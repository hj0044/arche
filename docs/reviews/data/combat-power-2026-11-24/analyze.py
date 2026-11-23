"""CSV 요약과 그래프 생성. python3 경로/analyze.py (numpy, matplotlib)."""
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
RNG = np.random.default_rng(20261124)
KEYS = ["hp", "pAtk", "eAtk", "pDef", "eDef", "spd", "critExtraP", "critExtraE", "evaExtraHp"]
RISK_EDGES = np.array([0.25, 0.50, 0.75, 0.90])


def read(name):
    with (ROOT / (name + ".csv")).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def write(name, header, rows):
    with (ROOT / (name + ".csv")).open("w", encoding="utf-8", newline="") as file:
        w = csv.writer(file, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def quantiles(a):
    return np.quantile(a, [0.025, 0.975])


def band(p):
    return np.digitize(p, RISK_EDGES)


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -35, 35)))


def fit(x, y):
    design = np.column_stack([np.ones(len(x)), x])
    coef = np.array([0., 3.])
    for _ in range(35):
        p = sigmoid(design @ coef)
        derivative = design.T @ (p - y) + np.array([0, 0.001 * coef[1]])
        hessian = (design.T * (p * (1 - p))) @ design + np.eye(2) * 0.001
        step = np.linalg.solve(hessian, derivative)
        coef -= step
        if np.max(np.abs(step)) < 1e-7:
            break
    return coef


def metrics(p, y):
    d = p - y
    return [float(np.mean(np.abs(d))), float(np.sqrt(np.mean(d * d))),
            float(np.corrcoef(p, y)[0, 1]), float(np.mean(p * p - 2 * p * y + y))]


def bootstrap_gap(pred, truth, reference=None):
    """같은 구성의 예측을 짝짓고 구성 단위로 복원 추출한다."""
    diff = np.abs(pred - truth)
    if reference is not None:
        diff -= np.abs(reference - truth)
    idx = RNG.integers(0, len(diff), size=(4000, len(diff)))
    return quantiles(np.mean(diff[idx], axis=1)).tolist()


def power():
    paths = sorted(ROOT.glob("power-*-0.csv"))
    rows = [r for path in paths for r in read(path.stem)]
    assert len(rows) == 365 and len({r["id"] for r in rows}) == 365
    assert all(int(r["n"]) >= 2000 for r in rows)
    a = np.array([[float(r["a_" + k]) for k in KEYS] for r in rows])
    e = np.array([[float(r["e_" + k]) for k in KEYS] for r in rows])
    ratio = np.array([float(r["ratio"]) for r in rows])
    truth = np.array([int(r["wins"]) / int(r["n"]) for r in rows])
    holdout = np.array([(int(r["enemy_level"]) + int(r["size"])) % 4 == 0 for r in rows])
    train = ~holdout
    weights0 = np.array([0.25, 2., 2., 1.5, 1.5, 1., 2., 2., 0.25])

    def log_ratio(w):
        return np.log(np.rint(a @ w) / np.rint(e @ w))

    baseline_x = np.log(ratio)
    assert np.max(np.abs(log_ratio(weights0) - baseline_x)) < 0.005
    baseline_coef = fit(baseline_x[train], truth[train])
    baseline = sigmoid(baseline_coef[0] + baseline_coef[1] * baseline_x)

    # 공격 기본 계수와 치명타 기댓값의 계수를 따로 테스트한다.
    groups = {
        "hp": [0], "pAtk": [1], "eAtk": [2], "attack_pair": [1, 2],
        "pDef": [3], "eDef": [4], "defense_pair": [3, 4], "spd": [5],
        "crit_expectation": [6, 7], "eva_expectation": [8],
    }

    def evaluate(w):
        x = log_ratio(w)
        coef = fit(x[train], truth[train])
        pred = sigmoid(coef[0] + coef[1] * x)
        return metrics(pred[train], truth[train]), metrics(pred[holdout], truth[holdout]), coef, pred

    probes = []
    for key, indices in groups.items():
        for f in [0.50, 0.75, 1, 1.25, 1.50]:
            w = weights0.copy()
            w[indices] *= f
            tr, ho, _, _ = evaluate(w)
            probes.append([key, f, *tr, *ho])
    metricnames = ["mae", "rmse", "pearson", "brier"]
    write("weight-grid", ["factor", "multiplier", *["train_" + k for k in metricnames],
                          *["holdout_" + k for k in metricnames]], probes)

    def search(axes, admissible=lambda _: True):
        w = weights0.copy()
        for _ in range(3):
            for indices in axes:
                candidates = []
                for factor in [0.5, 0.75, 1.0, 1.25, 1.5]:
                    trial = w.copy()
                    trial[indices] = weights0[indices] * factor
                    if admissible(trial):
                        candidates.append((evaluate(trial)[0][1], abs(factor - 1), trial))
                if candidates:
                    w = min(candidates, key=lambda v: v[:2])[2]
        return w

    raw_roster = json.loads((REPO / "src/data/roster.json").read_text())
    role_base = json.loads((REPO / "src/data/stats.json").read_text())["roleBase"]

    def level1(s):
        c = s["crit"] * (s["critDmg"] - 1)
        return [s[k] for k in KEYS[:6]] + [s["pAtk"] * c, s["eAtk"] * c, s["hp"] / (1 - s["eva"]) - s["hp"]]

    ra = np.array([level1(r["baseStats"]) for r in raw_roster])
    re = np.array([level1(role_base[r["role"]]["base"]) for r in raw_roster])
    budgets = lambda w: (ra @ w) / (re @ w)

    def permitted(w):
        budget = budgets(w)
        return (budget.min() >= 0.95) and (budget.max() <= 1.05)

    expanded = search([groups[k] for k in ["hp", "pAtk", "eAtk", "pDef", "eDef", "spd", "crit_expectation", "eva_expectation"]])
    json_axes = [[0, 8], [1, 6], [2, 7], [3], [4], [5]]
    constrained = search(json_axes, permitted)
    variants = []
    for name, w in [("current", weights0), ("expanded_grid", expanded), ("json_budget_grid", constrained)]:
        tr, ho, coef, pred = evaluate(w)
        rr = budgets(w)
        variants.append([name, *w.tolist(), *coef.tolist(), *tr, *ho, float(rr.min()), float(rr.max()),
                         int(np.sum((rr < .95) | (rr > 1.05))), *bootstrap_gap(pred[holdout], truth[holdout], baseline[holdout])])
    write("weight-models", ["model", *KEYS, "intercept", "slope", *["train_" + k for k in metricnames],
                            *["holdout_" + k for k in metricnames], "min_budget", "max_budget", "outside_budget",
                            "holdout_mae_delta_ci_low", "holdout_mae_delta_ci_high"], variants)

    risk_rows = []
    actual_band = band(truth)
    for sample in [12, 48, 96]:
        predictions = np.array([int(r["wins" + str(sample)]) / sample for r in rows])
        labels = band(predictions)
        for i in range(5):
            here = labels == i
            outcomes = truth[here]
            if len(outcomes) == 0:
                risk_rows.append([sample, i, 0, "", "", "", "", "", 0, 0, 0])
                continue
            match = int(np.sum(actual_band[here] == i))
            low = int(np.sum(actual_band[here] < i))
            high = int(np.sum(actual_band[here] > i))
            risk_rows.append([sample, i, len(outcomes), np.mean(outcomes), *np.quantile(outcomes, [.1, .5, .9]),
                              np.mean(predictions[here] - outcomes), match, low, high])
    write("risk-calibration", ["simulations", "band_low_to_high", "cases", "mean_actual", "p10_actual", "p50_actual",
                               "p90_actual", "prediction_bias", "match", "actual_lower", "actual_higher"], risk_rows)

    edges = [0, .5, .75, .9, 1.0, 1.1, 1.25, 1.5, 2, 4, np.inf]
    binned = []
    for l, u in zip(edges, edges[1:]):
        sel = (ratio >= l) & (ratio < u)
        values = truth[sel]
        if not len(values):
            continue
        ids = RNG.integers(0, len(values), size=(4000, len(values)))
        lo, hi = quantiles(values[ids].mean(axis=1))
        binned.append([l, u, int(sel.sum()), np.median(ratio[sel]), np.mean(values), lo, hi, np.mean(baseline[sel]),
                       np.mean(baseline[sel] - values), np.mean(np.abs(baseline[sel] - values))])
    write("power-bins", ["ratio_low", "ratio_high", "cases", "median_ratio", "mean_actual", "mean_actual_ci_low",
                         "mean_actual_ci_high", "mean_model", "model_bias", "model_mae"], binned)
    by_size = []
    for size in range(1, 6):
        sel = np.array([int(r["size"]) == size for r in rows])
        near = sel & (ratio >= .9) & (ratio < 1.25)
        for key, use in [("all", sel), ("ratio_0.90_to_1.25", near)]:
            by_size.append([size, key, int(use.sum()), float(np.mean(truth[use])), *metrics(baseline[use], truth[use])])
    write("power-party-size", ["size", "range", "n", "actual", *metricnames], by_size)

    role_by_id = {r["id"]: r["role"] for r in raw_roster}
    parties = [{role_by_id[x.split("@")[0]] for x in r["allies"].split(";")} for r in rows]
    role_rows = []
    role_rng = np.random.default_rng(912016)
    for scope, lo, hi in [("solo", 1, 1), ("team", 2, 5)]:
        for role in sorted(set(role_by_id.values())):
            select = np.array([lo <= int(r["size"]) <= hi and role in party
                               for r, party in zip(rows, parties)])
            select &= (ratio >= .9) & (ratio < 1.25)
            residual = baseline[select] - truth[select]
            pick = role_rng.integers(0, len(residual), (4000, len(residual)))
            role_rows.append([scope, role, int(select.sum()), np.mean(truth[select]),
                              np.mean(baseline[select]), np.mean(residual),
                              *quantiles(residual[pick].mean(axis=1))])
    write("power-by-role", ["scope", "role", "n", "actual", "predicted",
                            "overprediction", "ci_low", "ci_high"], role_rows)

    fig, (ax, bx) = plt.subplots(1, 2, figsize=(12, 4.5), layout="constrained")
    ax.scatter(ratio, truth * 100, alpha=.24, s=12, color="#4876a8", label="Engine matchups")
    ax.set_xscale("log")
    x = np.geomspace(min(ratio), max(ratio), 250)
    ax.plot(x, 100 * sigmoid(baseline_coef[0] + baseline_coef[1] * np.log(x)), color="#304254", lw=1.7, label="Ratio-only fit")
    for l, u, n, mid, mean, lo, hi, *_ in binned:
        ax.errorbar(mid, mean * 100, yerr=[[max(0, mean-lo) * 100], [max(0, hi-mean) * 100]], fmt="o", color="#b4522e", ms=3, capsize=3)
    ax.set(xlabel="Party / monster combat power", ylabel="Observed win rate (%)", title="Power ratio and observed wins")
    ax.grid(alpha=.16)
    ax.legend(loc="lower right", frameon=False)
    bins = [truth[band(np.array([int(r["wins12"]) / 12 for r in rows])) == k] * 100 for k in range(5)]
    bx.boxplot(bins, tick_labels=["Reckless", "Unfavored", "Even", "Favored", "Overwhelming"], showmeans=True,
               widths=.58, medianprops={"color": "#b4522e"})
    for boundary in RISK_EDGES:
        bx.axhline(100 * boundary, color="#8a9198", alpha=.35, ls="--")
    bx.tick_params(axis="x", labelrotation=20)
    bx.set(ylabel="Observed win rate (%)", title="Actual wins by displayed tier (12 trials)", ylim=(-4, 104))
    fig.savefig(ROOT / "power-calibration.png", dpi=160)
    plt.close(fig)

    p_h = baseline[holdout]
    y_h = truth[holdout]
    p12 = np.array([int(r["wins12"]) / 12 for r in rows])
    stat = {
        "cases": len(rows), "seeds": int(rows[0]["n"]), "holdout": int(holdout.sum()),
        "ratio_pearson": float(np.corrcoef(ratio, truth)[0, 1]),
        "log_ratio_pearson": float(np.corrcoef(baseline_x, truth)[0, 1]),
        "holdout_baseline": metrics(p_h, y_h), "holdout_mae_ci": bootstrap_gap(p_h, y_h),
        "near_cases": int(np.sum((truth >= .1) & (truth <= .9))),
        "zero_win_cases": int(np.sum(truth == 0)), "all_win_cases": int(np.sum(truth == 1)),
        "risk12_accuracy": float(np.mean(band(p12) == actual_band)),
        "risk12_mae": float(np.mean(abs(p12-truth))),
        "target_tier_12_precision": float(np.mean(np.isin(actual_band[np.isin(band(p12), [2, 3])], [2, 3]))),
        "target_tier_12_count": int(np.sum(np.isin(band(p12), [2, 3]))),
    }
    print(json.dumps(stat, ensure_ascii=False, indent=2))


def progress():
    summary = []
    versions = {}
    for version in ["main", "parent", "after", "small-low"]:
        rows = read("days-" + version)
        seeds = sorted({r["seed"] for r in rows})
        for key, subset in [("all", rows), *[(s, [r for r in rows if r["seed"] == s]) for s in seeds]]:
            eligible = [r for r in subset if int(r["available"]) > 0]
            sendable = [r for r in eligible if int(r["evaluated_rifts"]) > 0]
            total = lambda col, rs=subset: sum(int(r[col]) for r in rs)
            summary.append([version, key, len(subset), len(eligible), len(sendable), total("target_actual_12", eligible),
                            total("target_display_definite", eligible), total("target_display_possible", eligible),
                            *[total(c) for c in ["dispatched", "returned", "victories", "injuries", "returns_with_injuries", "injured_merc_days"]]])
        per_seed = []
        for s in seeds:
            block = [r for r in rows if r["seed"] == s]
            use = [r for r in block if int(r["available"]) > 0]
            per_seed.append([sum(int(r["target_actual_12"]) for r in use), len(use)])
        data = np.array(per_seed)
        versions[version] = data
        draw = RNG.integers(0, len(data), (4000, len(data)))
        num_den = data[draw].sum(axis=1)
        print(version, "target 95% seed bootstrap", quantiles(num_den[:, 0] / num_den[:, 1]).tolist())
    a, b = versions["after"], versions["small-low"]
    draw = RNG.integers(0, len(a), (4000, len(a)))
    aggregate_a, aggregate_b = a[draw].sum(axis=1), b[draw].sum(axis=1)
    gap = aggregate_b[:, 0] / aggregate_b[:, 1] - aggregate_a[:, 0] / aggregate_a[:, 1]
    print("small-low minus after, paired seed bootstrap CI", quantiles(gap).tolist())
    write("days-summary", ["version", "seed", "days", "eligible_days", "sendable_days", "actual_target12",
                           "definite_display_target", "possible_display_target", "dispatches", "returns", "wins",
                           "injury_count", "injured_returns", "injured_merc_days"], summary)


def rank_traits():
    raw = read("traits")
    fields = list(raw[0])
    rows = sorted(raw, key=lambda row: (
        0 if row["enemy_element"] == "void" else 1 if row["n"] else 2,
        -float(row["delta"] or 0), row["id"],
    ))
    write("traits-ranked", fields, [[row[field] for field in fields] for row in rows])


if __name__ == "__main__":
    power()
    progress()
    rank_traits()
