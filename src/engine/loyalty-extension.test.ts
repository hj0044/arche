import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { advanceDay, dispatch, getMerc, newGame, recruit, recruitInfo, type DayEvent, type GameState } from './game';
import { isLoyaltySimulated, loyaltyDelta } from './loyalty';
import type { Rift } from './rift';

const L = tables.loyalty;
const P = tables.poaching;
const gm = (seed = 'ext') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'gm', background: 'heir' } });
const opener = (seed = 'ext') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'fire', role: 'warrior', background: 'soldier' } });
const rich = (s: GameState): GameState => ({ ...s, resources: { ...s.resources, zero: 999999 } });
const patch = (s: GameState, id: string, f: (m: GameState['mercenaries'][number]) => object): GameState => ({
  ...s,
  mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, ...f(m) } : m)),
});
const rift = (id: string): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  deadlineDay: 99,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
});
/** 이동 확률을 바꾼 표 */
const withPoach = (chance: number): GameTables => ({ ...tables, poaching: { ...tables.poaching, dailyChance: chance } });

describe('대기 하락', () => {
  /** 매일 쉬기만 하는 길드에서 n일 동안 m01의 변동 요인을 모은다 */
  function restDays(s: GameState, id: string, n: number) {
    const reasons: string[] = [];
    for (let i = 0; i < n; i++) {
      s = advanceDay(tables, rich(s)).state;
      reasons.push(getMerc(s, id).loyalty!.recent.at(-1)!.reason);
    }
    return { s, reasons };
  }

  it('쉬는 날 상승은 연속 7일까지, 8일째부터 대기 하락', () => {
    const { s, reasons } = restDays(gm(), 'm01', 10);
    expect(reasons.slice(0, L.restMaxDays)).toEqual(Array(L.restMaxDays).fill('restDay'));
    expect(reasons.slice(L.restMaxDays)).toEqual(Array(10 - L.restMaxDays).fill('idleDecay'));
    expect(getMerc(s, 'm01').loyalty!.restStreak).toBe(10);
    const bg = getMerc(s, 'm01').profile.background;
    expect(getMerc(s, 'm01').loyalty!.value).toBeCloseTo(L.start + 7 * loyaltyDelta(tables, bg, 'restDay') + 3 * loyaltyDelta(tables, bg, 'idleDecay'), 5);
  });

  it.each([
    ['야망(길드 계승자)', 'heir', 2],
    ['안정(시민)', 'citizen', 0.25],
    ['명예(군인, 가중치 없음)', 'soldier', 1],
  ])('성향 가중치: %s ×%s', (_l, background, w) => {
    expect(loyaltyDelta(tables, background, 'idleDecay')).toBeCloseTo(L.changes.idleDecay * w, 5);
    let s = patch(gm(), 'm01', (m) => ({ profile: { ...m.profile, background }, loyalty: { ...m.loyalty!, restStreak: L.restMaxDays } }));
    s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'm01').loyalty!.value).toBeCloseTo(L.start + L.changes.idleDecay * w, 1); // 소수 둘째 자리 반올림
  });

  it('파견을 나가거나 부상을 입으면 연속 쉰 일수가 0으로 돌아간다', () => {
    let s = gm();
    for (const id of ['m01', 'm02', 'm03']) s = patch(s, id, (m) => ({ loyalty: { ...m.loyalty!, restStreak: 9 } }));
    s = patch(s, 'm03', () => ({ injury: { severity: 'light', recoverDay: 5 } }));
    s = dispatch(tables, { ...s, rifts: [...s.rifts, rift('A')] }, 'A', [{ mercId: 'm02', row: 'back' }]);
    s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'm01').loyalty!.restStreak).toBe(10);
    expect(getMerc(s, 'm02').loyalty!.restStreak).toBe(0);
    expect(getMerc(s, 'm03').loyalty!.restStreak).toBe(0);
    // 다시 쉬기 시작하면 1부터, 쉬는 날 상승
    s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'm02').loyalty!.restStreak).toBe(1);
    expect(getMerc(s, 'm02').loyalty!.recent.at(-1)!.reason).toBe('restDay');
  });

  it('0 아래로 내려가지 않는다', () => {
    let s = patch(gm(), 'm04', (m) => ({ profile: { ...m.profile, background: 'heir' }, loyalty: { ...m.loyalty!, value: 0.3, restStreak: 30 } }));
    s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'm04').loyalty!.value).toBe(L.range[0]);
  });

  it('주인공에는 적용되지 않고, 길드 밖 용병도 시뮬레이션하지 않는다', () => {
    let s = opener();
    for (let i = 0; i < 12; i++) s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'hero').loyalty).toBeUndefined();
    expect(getMerc(s, 'm05').loyalty!.restStreak).toBe(0);
    expect(isLoyaltySimulated(tables, { kind: 'guild' })).toBe(true);
    expect(isLoyaltySimulated(tables, { kind: 'faction', factionId: 'rrb' })).toBe(false);
  });

  it('시뮬레이션 대상은 데이터로 정한다(세력을 켜면 그 세력 용병도 변한다)', () => {
    const t: GameTables = { ...tables, loyalty: { ...tables.loyalty, simulatedAffiliations: ['guild', 'rrb'] } };
    let s = gm();
    for (let i = 0; i < 3; i++) s = advanceDay(t, rich(s)).state;
    expect(getMerc(s, 'm05').loyalty!.restStreak).toBe(3); // 리프트 대응국 소속
  });
});

describe('무소속 용병 영입 이동', () => {
  const freeIds = (s: GameState) => s.mercenaries.filter((m) => m.affiliation.kind === 'faction' && m.affiliation.factionId === 'free').map((m) => m.id);
  const run = (t: GameTables, s: GameState, days: number) => {
    const events: DayEvent[] = [];
    for (let i = 0; i < days; i++) {
      const r = advanceDay(t, rich(s));
      s = r.state;
      events.push(...r.events);
    }
    return { s, events };
  };

  it('같은 시드면 같은 이동', () => {
    expect(run(withPoach(0.3), gm('same'), 15)).toEqual(run(withPoach(0.3), gm('same'), 15));
  });

  it('무소속만 대상이고, 길드·주인공·다른 세력은 이동하지 않으며, 영구 소멸 없음', () => {
    const start = opener('poach');
    const { s, events } = run(withPoach(1), start, 3);
    const moved = events.filter((e): e is Extract<DayEvent, { type: 'poached' }> => e.type === 'poached');
    const before = freeIds(start);
    expect(new Set(moved.map((e) => e.mercId))).toEqual(new Set(before)); // 확률 1이면 첫날 전원 이동
    for (const e of moved) {
      expect(e.fromFactionId).toBe('free');
      expect(P.excludeTargets).not.toContain(e.toFactionId);
    }
    expect(s.mercenaries).toHaveLength(start.mercenaries.length);
    expect(getMerc(s, 'hero').affiliation).toEqual({ kind: 'guild' });
    for (const m of start.mercenaries.filter((x) => x.affiliation.kind === 'guild')) expect(getMerc(s, m.id).affiliation).toEqual({ kind: 'guild' });
    for (const m of start.mercenaries.filter((x) => x.affiliation.kind === 'faction' && x.affiliation.factionId !== 'free')) {
      expect(getMerc(s, m.id).affiliation).toEqual(m.affiliation);
    }
    expect(freeIds(s)).toEqual([]);
  });

  it('개방자 모드에서 빠진 후보도 같은 규칙을 따른다', () => {
    const start = opener('left'); // 전사 주인공 → 강태산(m01)이 무소속
    expect(getMerc(start, 'm01').affiliation).toEqual({ kind: 'faction', factionId: 'free' });
    const { s } = run(withPoach(1), start, 1);
    expect(getMerc(s, 'm01').affiliation.kind).toBe('faction');
    expect(getMerc(s, 'm01').affiliation).not.toEqual({ kind: 'faction', factionId: 'free' });
  });

  it('이동하면 소속만 바뀌고 다시 영입할 수 있으며, 영입비는 새 세력 배율로 달라진다', () => {
    const start = gm('cost');
    const id = 'm28'; // 무소속 안예린
    const before = recruitInfo(tables, start, id);
    const { s } = run(withPoach(1), start, 1);
    const m = getMerc(s, id);
    expect(m.affiliation.kind).toBe('faction');
    const to = m.affiliation.kind === 'faction' ? m.affiliation.factionId : '';
    const mult = (fid: string) => tables.factions.find((f) => f.id === fid)!.recruitCostMultiplier;
    const after = recruitInfo(tables, s, id);
    expect(after.eligible).toBe(true);
    expect(after.unlock).toEqual(before.unlock);
    expect(after.cost).toBe(Math.round((before.cost / mult('free')) * mult(to)));
    expect(getMerc(recruit(tables, s, id), id).affiliation).toEqual({ kind: 'guild' });
  });

  it('이탈 직후 보호 기간에는 이동하지 않고, 지나면 이동하며 이탈했던 용병임을 알린다', () => {
    let s = patch(gm('protect'), 'm02', () => ({ affiliation: { kind: 'faction', factionId: 'free' }, departedDay: 1 }));
    const t = withPoach(1);
    const moves: DayEvent[] = [];
    for (let i = 0; i < P.protectionDaysAfterDeparture + 1; i++) {
      const r = advanceDay(t, rich(s));
      s = r.state;
      const mine = r.events.filter((e) => e.type === 'poached' && e.mercId === 'm02');
      if (s.day - 1 <= P.protectionDaysAfterDeparture) expect(mine).toEqual([]);
      moves.push(...mine);
    }
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: 'poached', mercId: 'm02', wasDeparted: true });
    expect(s.day - 1).toBe(P.protectionDaysAfterDeparture + 1);
  });

  it('고향 도시에서 영향력이 모두 0이면 동률로 고른다', () => {
    const zero: GameTables = { ...withPoach(1), factions: tables.factions.map((f) => ({ ...f, cityInfluence: {} })) };
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const { events } = run(zero, gm(`tie-${i}`), 1);
      for (const e of events) if (e.type === 'poached') counts.set(e.toFactionId, (counts.get(e.toFactionId) ?? 0) + 1);
    }
    const targets = tables.factions.filter((f) => !P.excludeTargets.includes(f.id)).map((f) => f.id);
    expect([...counts.keys()].sort()).toEqual([...targets].sort());
  });

  it('영향력이 큰 세력으로 더 자주 간다', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const { events } = run(withPoach(1), gm(`w-${i}`), 1);
      for (const e of events) if (e.type === 'poached' && e.mercId === 'm28') counts.set(e.toFactionId, (counts.get(e.toFactionId) ?? 0) + 1);
    }
    // 안예린 고향 서울: 리프트 대응국 0.5 > 웨이포인트 0.15
    expect(counts.get('rrb') ?? 0).toBeGreaterThan(counts.get('waypoint') ?? 0);
  });
});
