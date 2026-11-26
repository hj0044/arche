// 지시서 028a: 이름 생성기, 리그 세계 생성, 시즌 진행·정산, 순위
import { describe, expect, it } from 'vitest';
import { tables } from '../../data';
import { advanceDay, newGame } from '../game';
import { cultureWeights, generateName, nameKey } from '../names';
import { createRng } from '../rng';
import {
  advanceLeagueDay,
  initLeague,
  memberActivityAt,
  memberRankings,
  membersOf,
  overallStandings,
  PLAYER_TEAM_ID,
  setPlayerScore,
  settleSeason,
  teamScoreAt,
  tierStandings,
  type LeagueState,
} from './league';

const rules = tables.league.rules;
const L = rules.season.length;
const rosterNames = tables.roster.map((r) => r.name);
const fresh = (seed = 'lg') => initLeague(tables, seed, rosterNames);
const run = (seed: string, seasons: number) => {
  const lg = fresh(seed);
  const hist = [];
  for (let i = 0; i < seasons; i++) hist.push(settleSeason(tables, lg));
  return { lg, hist };
};
/** 구조 불변식: 등급별 팀 수(우리 자리 포함), 규모 단계 인원 범위, 이름·id 중복 없음 */
function checkStructure(lg: LeagueState) {
  for (const tier of rules.tiers) {
    const n = lg.teams.filter((x) => x.tier === tier.id).length + (lg.player.tier === tier.id ? 1 : 0);
    expect(n, tier.id).toBe(tier.teams);
  }
  for (const team of lg.teams) {
    const sc = rules.scaleTiers.find((r) => r.tier === team.scaleTier)!;
    const n = membersOf(lg, team.id).length;
    expect(n, `${team.id} 규모 ${team.scaleTier}`).toBeGreaterThanOrEqual(sc.min);
    expect(n, `${team.id} 규모 ${team.scaleTier}`).toBeLessThanOrEqual(Math.min(sc.max, 70));
  }
  const names = lg.members.map((m) => nameKey(m.name));
  expect(new Set(names).size).toBe(names.length);
  for (const r of rosterNames) expect(names).not.toContain(nameKey(r));
  expect(new Set(lg.members.map((m) => m.id)).size).toBe(lg.members.length);
}

describe('028a 이름 생성기', () => {
  it('같은 시드면 같은 이름, 표기 순서·띄어쓰기는 문화권 규칙을 따른다', () => {
    expect(generateName(tables, 'n1', { gender: 'm' })).toEqual(generateName(tables, 'n1', { gender: 'm' }));
    const ko = generateName(tables, 'n2', { gender: 'f', cultureId: 'korea' });
    expect(ko.display).toBe(`${ko.surname}${ko.given}`);
    const jp = generateName(tables, 'n3', { gender: 'm', cultureId: 'japan' });
    expect(jp.display).toBe(`${jp.surname} ${jp.given}`);
    const fr = generateName(tables, 'n4', { gender: 'n', cultureId: 'france' });
    expect(fr.display).toBe(`${fr.given} ${fr.surname}`);
  });

  it('성 개수는 문화권 범위를 따른다(이베리아·브라질·중남미는 두 성도 나온다)', () => {
    const rng = createRng('two');
    const counts = new Set<number>();
    for (let i = 0; i < 80; i++) counts.add(generateName(tables, rng, { gender: 'm', cultureId: 'iberia' }).surname.split(' ').length);
    expect([...counts].sort()).toEqual([1, 2]);
    for (let i = 0; i < 40; i++) expect(generateName(tables, rng, { gender: 'f', cultureId: 'korea' }).surname.split(' ')).toHaveLength(1);
  });

  it('성별에 맞는 이름: 남성은 남성·중성, 여성은 여성·중성, 중성은 중성 이름만', () => {
    const rng = createRng('gender');
    for (const c of tables.namePool.cultures) {
      const pool = tables.namePool.pools[c.id].names;
      for (const g of ['m', 'f', 'n'] as const) {
        const n = generateName(tables, rng, { gender: g, cultureId: c.id });
        const row = pool.find((x) => x.text === n.given)!;
        expect(g === 'n' ? row.gender === 'n' : row.gender === g || row.gender === 'n', `${c.id} ${g} ${n.given}`).toBe(true);
      }
    }
  });

  it('겹치는 이름과 blocklist 쌍은 만들지 않는다', () => {
    const used = new Set<string>();
    const rng = createRng('uniq');
    for (let i = 0; i < 1500; i++) generateName(tables, rng, { gender: 'm', used });
    expect(used.size).toBe(1500);
    const first = generateName(tables, 'blk', { gender: 'm', cultureId: 'korea' });
    const t = { ...tables, namePool: { ...tables.namePool, blocklist: [[first.surname, first.given]] as [string, string][] } };
    expect(generateName(t, 'blk', { gender: 'm', cultureId: 'korea' }).display).not.toBe(first.display);
  });

  it('문화권 가중치: 합 1, 한 문화권 15% 이하, 대륙마다 5% 이상', () => {
    const w = cultureWeights(tables);
    expect([...w.values()].reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9);
    for (const v of w.values()) expect(v).toBeLessThanOrEqual(rules.names.cultureCap + 1e-9);
    const cont = new Map<string, number>();
    for (const c of tables.namePool.cultures) cont.set(c.continent, (cont.get(c.continent) ?? 0) + w.get(c.id)!);
    for (const [k, v] of cont) expect(v, k).toBeGreaterThanOrEqual(rules.names.continentMin - 1e-9);
  });

  it('실제 표본(이름 5,000개)도 상한·대륙 최소를 지킨다(표본 오차 1.5%p)', () => {
    const rng = createRng('sample');
    const used = new Set<string>();
    const by = new Map<string, number>();
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const n = generateName(tables, rng, { gender: (['m', 'f', 'n'] as const)[i % 3], used });
      by.set(n.cultureId, (by.get(n.cultureId) ?? 0) + 1);
    }
    for (const [, v] of by) expect(v / N).toBeLessThanOrEqual(rules.names.cultureCap + 0.015);
    const cont = new Map<string, number>();
    for (const c of tables.namePool.cultures) cont.set(c.continent, (cont.get(c.continent) ?? 0) + (by.get(c.id) ?? 0));
    for (const [k, v] of cont) expect(v / N, k).toBeGreaterThanOrEqual(rules.names.continentMin - 0.015);
  });
});

describe('028a 리그 세계 생성', () => {
  const lg = fresh();

  it('39팀(설정 14, 민간 25)과 우리 자리로 등급별 10/10/8/8/4, 우리 자리는 미진', () => {
    expect(lg.teams).toHaveLength(39);
    expect(lg.player).toEqual({ tier: 'mijin', score: 0 });
    checkStructure(lg);
  });

  it('리그 힌트를 지킨다: top은 격진, upper는 강진, mid는 중진·약진, lower는 약진·미진', () => {
    for (const row of tables.league.teams) {
      const team = lg.teams.find((x) => x.id === row.id)!;
      expect(rules.hintTiers[row.leagueHint], `${row.id} ${row.leagueHint}`).toContain(team.tier);
    }
  });

  it('초기 규모 분포 6·11·11·8·3, 총 인원 약 660명(600~760)', () => {
    expect([1, 2, 3, 4, 5].map((k) => lg.teams.filter((x) => x.scaleTier === k).length)).toEqual(rules.initialScaleTarget);
    expect(lg.members.length).toBeGreaterThan(600);
    expect(lg.members.length).toBeLessThan(760);
  });

  it('설정 용병단은 대표 인물을 모두 포함한다(이름·직책 그대로)', () => {
    for (const f of tables.league.featured) {
      const m = lg.members.find((x) => x.featuredId === f.id)!;
      expect(m).toMatchObject({ teamId: f.teamId, name: f.name, post: f.post, role: f.role, cultureId: f.cultureId });
    }
  });

  it('같은 시드면 같은 세계', () => {
    expect(fresh()).toEqual(lg);
    expect(fresh('other')).not.toEqual(lg);
  });
});

describe('028a 점수 곡선과 활약도', () => {
  const lg = fresh('curve');

  it('팀 누적 점수는 0에서 시작해 줄지 않고 시즌 끝에 총점이 된다. 총점은 등급 목표 ± 난수 폭 안', () => {
    for (const team of lg.teams) {
      let prev = 0;
      for (let d = 1; d <= L; d++) {
        const s = teamScoreAt(tables, lg, team, d);
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
      expect(prev).toBe(team.total);
      const tier = rules.tiers.find((x) => x.id === team.tier)!;
      expect(Math.abs(team.total / tier.targetScore - 1)).toBeLessThanOrEqual(tier.spread + 1e-3);
    }
  });

  it('난수 폭은 높은 등급일수록 크다', () => {
    const order = [...rules.tiers].sort((a, b) => a.order - b.order);
    for (let i = 1; i < order.length; i++) expect(order[i].spread).toBeGreaterThan(order[i - 1].spread);
  });

  it('작은 팀의 개인 평균 활약도가 큰 팀보다 높고, 큰 팀에도 상위 강자가 있다', () => {
    const { lg: big } = run('size', 3);
    const avgByScale = (k: number) => {
      const ms = big.members.filter((m) => big.teams.find((x) => x.id === m.teamId)!.scaleTier === k);
      return ms.reduce((a, m) => a + m.act, 0) / ms.length;
    };
    expect(avgByScale(1)).toBeGreaterThan(avgByScale(5));
    for (const team of big.teams.filter((x) => x.scaleTier >= 4)) {
      const acts = membersOf(big, team.id).map((m) => m.act).sort((a, b) => b - a);
      const median = acts[Math.floor(acts.length / 2)];
      expect(acts[0], team.id).toBeGreaterThan(median * 1.3);
    }
  });

  it('최상위(격진) 팀으로 4~5명 팀과 20명 이상 팀이 모두 나온다(시드 표본)', () => {
    const sizes = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { lg: x } = run(seed, 6);
      for (const team of x.teams.filter((t) => t.tier === 'gyeokjin')) {
        const n = membersOf(x, team.id).length;
        if (n <= 5) sizes.add('small');
        if (n >= 20) sizes.add('big');
      }
    }
    expect([...sizes].sort()).toEqual(['big', 'small']);
  });

  it('시즌 활약도는 시즌 끝에 최종값이 되고 같은 날이면 같은 값', () => {
    const m = lg.members[5];
    expect(memberActivityAt(tables, lg, m, L)).toBe(m.act);
    expect(memberActivityAt(tables, lg, m, 10)).toBe(memberActivityAt(tables, lg, m, 10));
  });
});

describe('028a 시즌 진행과 정산', () => {
  it('간이 정산(15·30·45일)은 순위와 역할별 상위 3명 스냅샷만 남기고 승강하지 않는다', () => {
    const lg = fresh('cp');
    const tiersBefore = lg.teams.map((x) => x.tier);
    for (let d = 1; d < L; d++) advanceLeagueDay(tables, lg, d);
    expect(lg.checkpoints.map((c) => c.day)).toEqual(rules.season.checkpoints);
    expect(lg.teams.map((x) => x.tier)).toEqual(tiersBefore);
    const cp = lg.checkpoints[0];
    for (const r of tables.roles.filter((x) => x.enabled)) expect(cp.topByRole[r.id]).toHaveLength(3);
    expect(cp.standings.mijin.at(-1)!.id).toBe(PLAYER_TEAM_ID);
    advanceLeagueDay(tables, lg, L);
    expect(lg.season).toBe(2);
    expect(lg.checkpoints).toEqual([]);
    expect(lg.history).toHaveLength(1);
  });

  it('게임 하루 진행과 연결: 60일이 지나면 리그 시즌 2, 61일차 시작', () => {
    let s = newGame(tables, { seed: 'g28', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'm' } });
    for (let i = 0; i < L; i++) s = advanceDay(tables, s).state;
    expect(s.day).toBe(L + 1);
    expect(s.league.season).toBe(2);
  });

  it('승격·강등 수가 규칙과 같고 리그별 팀 수가 정산을 거듭해도 유지된다(우리 자리 0점이면 미진 최하위)', () => {
    const lg = fresh('promo');
    for (let s = 0; s < 12; s++) {
      const h = settleSeason(tables, lg);
      for (const tier of rules.tiers) {
        expect(h.promoted.filter((x) => x.from === tier.id), `${tier.id} 승격`).toHaveLength(tier.order < 5 ? tier.promote : 0);
        expect(h.relegated.filter((x) => x.from === tier.id), `${tier.id} 강등`).toHaveLength(tier.order > 1 ? tier.relegate : 0);
      }
      expect(h.standings.mijin.at(-1)!.id).toBe(PLAYER_TEAM_ID);
      checkStructure(lg);
    }
    expect(lg.history).toHaveLength(rules.season.historyLimit);
  });

  it('우리 자리도 같은 규칙: 미진 1위 점수면 약진으로 승격', () => {
    const lg = fresh('up');
    setPlayerScore(lg, 999999);
    const h = settleSeason(tables, lg);
    expect(h.promoted).toContainEqual({ id: PLAYER_TEAM_ID, from: 'mijin', to: 'yakjin' });
    expect(lg.player).toEqual({ tier: 'yakjin', score: 0 });
    checkStructure(lg);
  });

  it('변동: 시즌마다 일부 팀의 규모·이름·등급·명단이 바뀌고, 설정 용병단 이름은 안 바뀐다', () => {
    const { lg, hist } = run('change', 10);
    expect(hist.some((h) => h.scaleMoves.length > 0)).toBe(true);
    expect(hist.some((h) => h.renamed.length > 0)).toBe(true);
    expect(hist.every((h) => h.promoted.length > 0)).toBe(true);
    expect(hist.every((h) => h.retired > 0 && h.recruits > 0)).toBe(true);
    expect(hist.some((h) => h.transfers > 0)).toBe(true);
    for (const row of tables.league.teams.filter((x) => x.kind === 'named')) expect(lg.teams.find((x) => x.id === row.id)!.name).toBe(row.name);
    for (const h of hist) for (const r of h.renamed) expect(tables.league.teams.find((x) => x.id === r.id)!.kind).toBe('civil');
    // 대표 인물은 은퇴·이적하지 않는다
    for (const f of tables.league.featured) expect(lg.members.find((m) => m.featuredId === f.id)?.teamId).toBe(f.teamId);
  });

  it('이적한 계약자는 이름·id·통산 기록을 유지한다', () => {
    const lg = fresh('move');
    const before = new Map(lg.members.map((m) => [m.id, structuredClone(m)]));
    settleSeason(tables, lg);
    const moved = lg.members.filter((m) => before.has(m.id) && before.get(m.id)!.teamId !== m.teamId);
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) {
      expect(m.name).toBe(before.get(m.id)!.name);
      expect(m.career.transfers).toBe(1);
      expect(m.career.seasons).toBe(1);
      expect(m.career.activitySum).toBeCloseTo(before.get(m.id)!.act, 6);
    }
  });

  it('50시즌 동안 규모 분포가 한 단계로 쏠리지 않는다(각 단계 5% 이상, 여러 시드)', () => {
    for (const seed of ['d1', 'd2', 'd3']) {
      const lg = fresh(seed);
      for (let s = 0; s < 50; s++) {
        settleSeason(tables, lg);
        const counts = [1, 2, 3, 4, 5].map((k) => lg.teams.filter((x) => x.scaleTier === k).length);
        for (const c of counts) expect(c / lg.teams.length, `${seed} 시즌 ${s + 1}: ${counts}`).toBeGreaterThanOrEqual(0.05);
      }
      checkStructure(lg);
    }
  });

  it('결정성: 같은 시드·시즌 수면 모든 결과가 같다', () => {
    expect(run('det', 8)).toEqual(run('det', 8));
  });
});

describe('028a 순위', () => {
  const lg = fresh('rank');

  it('등급별·전체 순위: 높은 등급이 먼저, 점수 내림차순', () => {
    const by = tierStandings(tables, lg, 30);
    for (const rows of Object.values(by)) for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
    const all = overallStandings(tables, lg, 30);
    expect(all).toHaveLength(40);
    expect(all[0].tier).toBe('gyeokjin');
    expect(all.at(-1)!.id).toBe(PLAYER_TEAM_ID);
  });

  it('계약자 순위: 전체·역할별, 우리 계약자는 밖에서 넣는다', () => {
    const all = memberRankings(tables, lg, { day: 30, scope: 'season' });
    expect(all).toHaveLength(lg.members.length);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].activity).toBeGreaterThanOrEqual(all[i].activity);
    const mages = memberRankings(tables, lg, { day: 30, scope: 'season', role: 'mage', external: [{ id: 'm10', name: '우리', role: 'mage', season: 9999, career: null }] });
    expect(mages[0]).toMatchObject({ id: 'm10', teamId: PLAYER_TEAM_ID, rank: 1 });
    expect(mages.every((r) => r.role === 'mage')).toBe(true);
    // 통산은 지난 시즌이 있어야 나온다
    expect(memberRankings(tables, lg, { day: 30, scope: 'career' })).toHaveLength(0);
  });
});
