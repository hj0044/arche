import { useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { tables, travelDays } from '../../data';
import { scoutingRow, visibleRift, type FacilitiesState, type ValueRange, type VisibleReward } from '../../engine/facilities';
import { riftVariant, type Rift } from '../../engine/rift';
import { riftAutoRisk, type RiftAutoRisk } from '../../engine/status';
import { AppShell } from '../AppShell';
import type { GameState } from '../../engine/game';
import { ChipRow, ElementTag, OmenBadge, RiskLabel } from '../components';
import { cityName, gradeName, materialName, monsterName, num, omenText, territoryLabel, tierName } from '../format';
import { expeditionDays, latestDeparture, zeroPerDay } from '../riftInfo';
import { citySummary, cityChips, daysLeft, filterAndSortRifts, isUrgent, needsAllRisks, type RiftListOptions, type RiskLookup } from '../riftFilter';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

/** 리프트 이름에서 앞의 "도시 이름 "을 뺀 것 */
const shortName = (r: Rift) => {
  const prefix = `${cityName(r.cityId)} `;
  return r.name.startsWith(prefix) ? r.name.slice(prefix.length) : r.name;
};

/** 마감 표시 */
const deadlineText = (left: ValueRange | null) =>
  !left ? '마감 없음' : left[1] === 0 ? '오늘 마감' : left[0] === left[1] ? `마감 D-${left[0]}` : `마감 D-${left[0]}~${left[1]}`;

/** 등급 변형 표시 이름(예: 소규모). 데이터 label이 없으면 표시 안 함 */
const variantLabel = (r: Rift) => riftVariant(tables, r)?.label;

/** 일차 범위 글자(같으면 한 값) */
const dayRange = (r: ValueRange) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`);

/** 범위 표시: 같은 두 값이면 한 값 */
const rng = (r: ValueRange, unit = '') => (r[0] === r[1] ? `${num(r[0])}${unit}` : `${num(r[0])}~${num(r[1])}${unit}`);

export function RiftCard({
  rift,
  day,
  baseCityId,
  facilities,
  onClick,
  compact = false,
  autoRisk,
}: {
  rift: Rift;
  day: number;
  baseCityId: string;
  facilities: FacilitiesState;
  onClick?: () => void;
  /** 편성 화면 상단용: 탭 동작 없이 요약만 */
  compact?: boolean;
  /** 리프트 목록: 지금 가용 인원으로 자동 편성했을 때의 위험도(null이면 출전 가능 인원 없음, undefined면 표시 안 함) */
  autoRisk?: RiftAutoRisk | null;
}) {
  const [open, setOpen] = useState(false);
  // 화면은 탐지소로 "보이는 정보"만 쓴다(실제 값은 숨김).
  const v = visibleRift(tables, facilities, rift);
  const travel = travelDays(tables, baseCityId, rift.cityId);
  // 마감까지 남은 일수(범위). 보이는 최대값으로도 늦으면 확실히 늦은 것이다.
  const left: ValueRange | null = daysLeft(tables, facilities, rift, day);
  const tooLate = left !== null && travel > left[1];
  const total = expeditionDays(tables, rift, baseCityId);
  const depart = latestDeparture(tables, facilities, rift, baseCityId);
  const perDay = zeroPerDay(tables, facilities, rift, baseCityId);
  const fmt = (r: VisibleReward) =>
    [`제로 ${rng(r.zero)}`, `아르케 ${rng(r.arche)}`, ...Object.entries(r.materials).map(([id, n]) => `${materialName(id)} ${rng(n)}`)].join(' · ');
  const deadline = deadlineText(left);
  const urgent = isUrgent(tables, facilities, rift, day);

  const head = (
    <>
      <span className="rift-head">
        <span className="tag tier">{tierName(rift.tier)}</span>
        <span className="card-title">{rift.name}</span>
        {variantLabel(rift) && <span className="pill small">{variantLabel(rift)}</span>}
        {v.omen && <OmenBadge />}
        {rift.stable && <span className="pill ok">안정화</span>}
      </span>
      <span className="muted small">{territoryLabel(rift.territoryFactionId)}</span>
      <span className="rift-key">
        <span className="strong">Lv{rng(v.level)}</span>
        <span className={urgent ? 'bad strong' : ''}>
          {urgent ? '⚠ ' : ''}
          {deadline}
        </span>
        <span>
          소요 {total}일{travel ? `(이동 ${travel * 2})` : ''}
        </span>
      </span>
      {depart && !tooLate && (
        <span className="small">
          {depart.travel > 0 ? `이동 ${depart.travel}일 포함, ` : ''}늦어도 <span className="strong">{dayRange([Math.max(day, depart.day[0]), depart.day[1]])}일차</span>까지 출발
        </span>
      )}
      {autoRisk !== undefined && (
        <span className="small">
          {autoRisk === null ? (
            <span className="muted">출전 가능 인원 없음</span>
          ) : (
            <>
              <span className="muted">자동 편성 위험도 </span>
              <RiskLabel best={autoRisk.estimate.best} worst={autoRisk.estimate.worst} />
              <span className="muted">
                {' '}
                ({autoRisk.partySize}명{autoRisk.estimate.estimated ? ', 추정' : ''})
              </span>
            </>
          )}
        </span>
      )}
      {v.omen && <span className="omen-text small">{omenText(v.omen.textId)}</span>}
      {tooLate && <span className="error small">이동하는 동안 마감이 지나 보낼 수 없습니다.</span>}
    </>
  );

  return (
    <div className={`card rift tier-${rift.tier} ${compact ? 'compact' : ''}`}>
      {onClick ? (
        <button className="rift-main" onClick={onClick} disabled={tooLate}>
          {head}
        </button>
      ) : (
        <div className="rift-main">{head}</div>
      )}
      <button className="rift-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '세부 접기 ▴' : `세부 · 승리 시 제로 ${rng(v.victoryReward.zero)} (하루 ${rng(perDay)}) ▾`}
      </button>
      {open && (
        <div className="rift-details">
          <div className="rift-meta">
            <span>{gradeName(rift.enemies[0].grade)}</span>
            {v.elements ? v.elements.map((el) => <ElementTag key={el} id={el} />) : <span className="muted small">속성 ?</span>}
          </div>
          <div className="muted small">
            {v.monsterCounts
              ? Object.entries(v.monsterCounts).map(([id, n]) => `${monsterName(id)}×${n}`).join(' · ')
              : `${v.monsterIds.map(monsterName).join(' · ')} · ${rng(v.count, '마리')}`}
          </div>
          <div className="small">
            승리 시 {fmt(v.victoryReward)} · 파견 하루당 제로 {rng(perDay)}({total}일 기준)
            {tables.riftTiers.find((t) => t.id === rift.tier)?.stabilizes && !rift.stable && ' · 항로 안정화'}
          </div>
          {(v.retreatReward.zero[1] > 0 || v.retreatReward.arche[1] > 0) && <div className="muted tiny">철수 시 {fmt(v.retreatReward)}</div>}
          {rift.stable && <div className="muted tiny">안정화 통로: 보상 ×{tables.progression.stablePassageRewardRatio} 반영</div>}
          {v.omenHidden && <div className="muted tiny">징조 표식은 탐지소 레벨이 높아야 보입니다.</div>}
        </div>
      )}
    </div>
  );
}

/**
 * 리프트 목록의 두 줄 카드(지시서 013). 1줄: 등급·이름·영역 세력, 2줄: 마감·위험도·보상 요약.
 * 누르면 편성 화면(기존 상세 카드와 편성)으로 간다.
 */
export function RiftRow({ rift, s, risk, onClick }: { rift: Rift; s: GameState; risk: RiftAutoRisk | null | undefined; onClick: () => void }) {
  const v = visibleRift(tables, s.facilities, rift);
  const left = daysLeft(tables, s.facilities, rift, s.day);
  const urgent = isUrgent(tables, s.facilities, rift, s.day);
  const travel = travelDays(tables, s.baseCityId, rift.cityId);
  const tooLate = left !== null && travel > left[1];
  return (
    <button className={`rift-row tier-${rift.tier}`} onClick={onClick} aria-label={`${rift.name}${tooLate ? ', 보낼 수 없음' : ''}`}>
      <span className="rift-row-line">
        <span className="tag tier">{tierName(rift.tier)}</span>
        {/* 목록은 도시 칩으로 이미 걸렀으니 앞의 도시 이름은 빼고 보인다(저장된 이름은 그대로) */}
        <span className="rift-row-name">{shortName(rift)}</span>
        {variantLabel(rift) && <span className="pill small">{variantLabel(rift)}</span>}
        {v.omen && <OmenBadge />}
        {rift.stable && <span className="pill ok">안정화</span>}
        <span className="rift-row-territory">{territoryLabel(rift.territoryFactionId)}</span>
      </span>
      <span className="rift-row-line small">
        <span className={tooLate ? 'error' : urgent ? 'bad strong' : ''}>
          {tooLate ? '보낼 수 없음' : `${urgent ? '⚠ ' : ''}${deadlineText(left)}`}
        </span>
        <span>
          {risk === undefined ? (
            <span className="muted">위험도 계산 중</span>
          ) : risk === null ? (
            <span className="muted">출전 인원 없음</span>
          ) : (
            <RiskLabel best={risk.estimate.best} worst={risk.estimate.worst} />
          )}
        </span>
        <span className="rift-row-reward">
          제로 {rng(v.victoryReward.zero)}
          <span className="muted">(하루 {rng(zeroPerDay(tables, s.facilities, rift, s.baseCityId))})</span>
        </span>
      </span>
    </button>
  );
}

// ── 위험도: 보이는 카드(앞쪽 N개)부터, 나머지는 한가할 때 계산한다. 상태(GameState)마다 모아 두어 상세 왕복에 다시 계산하지 않는다.
const riskCache = new WeakMap<GameState, Map<string, RiftAutoRisk | null>>();
function cacheFor(s: GameState) {
  let c = riskCache.get(s);
  if (!c) riskCache.set(s, (c = new Map()));
  return c;
}
type IdleHandle = number;
const scheduleIdle = (fn: () => void): IdleHandle =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 500 }) : window.setTimeout(fn, 16);
const cancelIdle = (h: IdleHandle) => (typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(h) : window.clearTimeout(h));

interface ViewState {
  cityId: string;
  sortId: string;
  tier: string | null;
  playableOnly: boolean;
  /** 정렬·필터 줄을 펼쳤는가 */
  open: boolean;
}
/** 상세(편성)에서 돌아와도 도시·정렬·필터·스크롤을 유지한다(세이브에는 넣지 않음, 슬롯이 바뀌면 처음으로). */
let remembered: { slotId: string; view: ViewState; scrollTop: number } | null = null;

export function RiftList({ ctx, cityId }: { ctx: Ctx; cityId?: string }) {
  const s = ctx.game.state;
  const mine = remembered?.slotId === ctx.game.slotId ? remembered : null;
  const [view, setViewRaw] = useState<ViewState>(() => {
    const base: ViewState = mine?.view ?? { cityId: s.baseCityId, sortId: tables.ui.riftSort[0].id, tier: null, playableOnly: false, open: false };
    return cityId ? { ...base, cityId } : base;
  });
  const setView = (patch: Partial<ViewState>) =>
    setViewRaw((v) => {
      const next = { ...v, ...patch };
      remembered = { slotId: ctx.game.slotId, view: next, scrollTop: patch.cityId && patch.cityId !== v.cityId ? 0 : (remembered?.scrollTop ?? 0) };
      return next;
    });

  // 스크롤 위치 되살리기(같은 도시로 돌아왔을 때만)
  useLayoutEffect(() => {
    const body = document.querySelector('.shell-body');
    if (body && mine && mine.view.cityId === view.cityId) body.scrollTop = mine.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cache = cacheFor(s);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const risk: RiskLookup = (id) => cache.get(id);
  const opts: RiftListOptions = { cityId: view.cityId, sortId: view.sortId, tier: view.tier, playableOnly: view.playableOnly };
  const cityRifts = s.rifts.filter((r) => r.cityId === view.cityId);
  const compute = (r: Rift) => {
    if (!cache.has(r.id)) cache.set(r.id, riftAutoRisk(tables, s, r));
  };
  // 정렬·필터가 위험도에 달려 있으면 이 도시 리프트를 모두 먼저 계산한다.
  if (needsAllRisks(opts)) cityRifts.forEach(compute);
  const list = filterAndSortRifts(tables, s, opts, risk);

  // 목록을 먼저 그리고, 보이는 카드(앞쪽 N개)는 바로 다음 작업에서 하나씩, 나머지(이 도시 → 다른 도시)는 한가할 때 하나씩 계산한다.
  // 한 번에 몰아 계산하지 않아 긴 작업이 생기지 않는다.
  useEffect(() => {
    let h: { idle: boolean; id: number } | null = null;
    const eager = list.slice(0, tables.ui.riftEagerRiskCount);
    const order = [...eager, ...cityRifts, ...s.rifts.filter((r) => r.cityId !== view.cityId)];
    const schedule = () => {
      const next = order.find((r) => !cache.has(r.id));
      if (!next) return;
      const run = () => {
        compute(next);
        if (next.cityId === view.cityId) bump();
        schedule();
      };
      h = eager.includes(next) ? { idle: false, id: window.setTimeout(run, 0) } : { idle: true, id: scheduleIdle(run) };
    };
    schedule();
    return () => {
      if (h) (h.idle ? cancelIdle(h.id) : window.clearTimeout(h.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, view.cityId, view.sortId, view.tier]);

  const chips = cityChips(tables, s);
  const sum = citySummary(tables, s, view.cityId, risk);
  const blurred = scoutingRow(tables, s.facilities);
  const showHint = !(blurred.revealElements && blurred.exactEnemies && blurred.exactDeadline && blurred.exactReward && blurred.revealOmen);
  const activeCount = [view.tier, view.playableOnly || null].filter(Boolean).length;
  const filtered = activeCount > 0;
  const sortName = tables.ui.riftSort.find((o) => o.id === view.sortId)?.name;
  const clear = () => setView({ tier: null, playableOnly: false });
  const open = (r: Rift) => {
    remembered = { slotId: ctx.game.slotId, view, scrollTop: document.querySelector('.shell-body')?.scrollTop ?? 0 };
    ctx.go({ name: 'party', riftId: r.id });
  };
  const playableNames = tables.ui.riftPlayableRiskTiers.map((id) => tables.combatPower.riskTiers.find((t) => t.id === id)?.name ?? id);

  return (
    <AppShell title="리프트" subtitle={`${s.day}일차 · 탭하면 파티를 편성합니다`} footer={<MainTabs ctx={ctx} current="rifts" />}>
      <ChipRow
        label="도시"
        hideLabel
        required
        value={view.cityId}
        onChange={(v) => v && setView({ cityId: v })}
        items={chips.map((c) => ({
          id: c.cityId,
          name: `${cityName(c.cityId)}${c.cityId === s.baseCityId ? '(거점)' : ''} ${c.count}`,
          ariaLabel: `${cityName(c.cityId)}${c.cityId === s.baseCityId ? ' 거점' : ''}, 리프트 ${c.count}개${c.urgent ? `, 마감 임박 ${c.urgent}개` : ''}`,
          badge: c.urgent > 0 ? <span className="chip-badge" aria-hidden="true">⚠{c.urgent}</span> : undefined,
        }))}
      />
      <div className="rift-summary" aria-label="리프트 요약">
        <span className={sum.urgent ? 'bad strong' : ''}>마감 임박 {sum.urgent}</span>
        <span aria-hidden="true">·</span>
        <span>
          공략 가능({playableNames.length > 1 ? `${playableNames[0]}~${playableNames.at(-1)}` : playableNames[0]}) <span className="strong">{sum.playable}</span>
          {sum.pending && <span className="muted">+</span>}
        </span>
      </div>
      <div className="list-tools">
        <span className="small muted list-count">
          {list.length}개 · {sortName}
        </span>
        <button className={`btn small ${activeCount ? 'on-filter' : ''}`} aria-expanded={view.open} onClick={() => setView({ open: !view.open })}>
          정렬·필터{activeCount ? ` ${activeCount}` : ''} {view.open ? '▴' : '▾'}
        </button>
      </div>
      {view.open && (
        <div className="filter-panel">
          <ChipRow label="정렬" required items={tables.ui.riftSort} value={view.sortId} onChange={(v) => v && setView({ sortId: v })} />
          <ChipRow label="등급" items={tables.riftTiers.map((t) => ({ id: t.id, name: t.name }))} value={view.tier} onChange={(v) => setView({ tier: v })} />
          <p className="filter-label">위험도</p>
          <div className="chips">
            <button className={`chip small ${view.playableOnly ? 'on' : ''}`} aria-pressed={view.playableOnly} onClick={() => setView({ playableOnly: !view.playableOnly })}>
              {playableNames.at(-1)} 이상만 보기
            </button>
          </div>
        </div>
      )}
      {showHint && (
        <p className="hint">
          🔭 범위로 보이는 정보는 탐지소 레벨을 올리면 더 자세히 보입니다(현재 Lv{s.facilities.levels.scout ?? 0}).
        </p>
      )}
      {cityRifts.length === 0 && <p className="muted">열린 리프트가 없습니다. 하루를 넘기면 새로 열릴 수 있습니다.</p>}
      {cityRifts.length > 0 && list.length === 0 && (
        <div className="panel">
          <p className="muted">조건에 맞는 리프트가 없습니다</p>
          <button className="btn block" onClick={clear}>
            필터 해제
          </button>
        </div>
      )}
      {filtered && list.length > 0 && (
        <div className="merc-line small list-status">
          <span className="muted">필터 적용 중</span>
          <button className="link" onClick={clear}>
            필터 해제
          </button>
        </div>
      )}
      <ul className="rows rift-rows">
        {list.map((r) => (
          <li key={r.id}>
            <RiftRow rift={r} s={s} risk={risk(r.id)} onClick={() => open(r)} />
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
