import { describe, expect, it } from 'vitest';
import { type GameTables } from '../data';
import { legacyTables as tables } from '../testing/legacyTables';
import { advanceDay, dispatch, getMerc, newGame, recruit, recruitInfo, type GameState } from './game';
import { isLoyaltySimulated, loyaltyDelta } from './loyalty';
import type { Rift } from './rift';

const L = tables.loyalty;
const gm = (seed = 'ext') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'gm' } });
const opener = (seed = 'ext') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'p' } });
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
  territoryFactionId: null,
  deadlineDay: 99,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
});

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

  it('길드 밖 용병은 시뮬레이션하지 않는다', () => {
    let s = opener();
    for (let i = 0; i < 12; i++) s = advanceDay(tables, rich(s)).state;
    expect(getMerc(s, 'm05').loyalty!.restStreak).toBe(0);
    expect(isLoyaltySimulated(tables, { kind: 'guild' })).toBe(true);
    expect(isLoyaltySimulated(tables, { kind: 'faction', factionId: 'rrb' })).toBe(false);
  });

  it('시뮬레이션 대상은 데이터로 정한다(세력을 켜면 그 세력 용병도 변한다)', () => {
    const t: GameTables = { ...tables, loyalty: { ...tables.loyalty, simulatedAffiliations: ['guild', 'rrb'] } };
    let s = gm();
    for (let i = 0; i < 3; i++) s = advanceDay(t, rich(s)).state;
    expect(getMerc(s, 'm06').loyalty!.restStreak).toBe(3); // 리프트 대응국 소속(026d)
  });
});

describe('세력은 수치에 개입하지 않는다(지시서 026)', () => {
  it('무소속 계약자는 며칠이 지나도 다른 세력으로 옮기지 않는다(스카우트 이동 폐지)', () => {
    let s = opener('poach');
    const before = s.mercenaries.map((m) => [m.id, m.affiliation]);
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = advanceDay(tables, rich(s));
      s = r.state;
      for (const e of r.events) kinds.add(e.type);
    }
    expect(kinds.has('poached')).toBe(false);
    expect(s.mercenaries.map((m) => [m.id, m.affiliation])).toEqual(before);
  });

  it('영입비는 세력과 무관하다: 같은 계약자를 다른 세력으로 바꿔도 비용이 같다', () => {
    const start = gm('cost');
    for (const id of ['m28', 'm16', 'm05']) {
      const costs = tables.factions.map((f) => recruitInfo(tables, patch(start, id, () => ({ affiliation: { kind: 'faction', factionId: f.id } })), id).cost);
      expect(new Set(costs).size).toBe(1);
    }
    const id = 'm28';
    const m = getMerc(start, id);
    const c = tables.progression.recruitZeroCost;
    const raw = c.base + c.perCapAbove30 * Math.max(0, m.growth.cap - c.capBaseline) + c.perLevel * (m.level - 1);
    const city = tables.cities.find((x) => x.id === start.baseCityId)!;
    const away = m.profile.hometown !== start.baseCityId ? city.recruitment.otherHometownCostMultiplier : 1;
    expect(recruitInfo(tables, start, id).cost).toBe(Math.round(raw * away));
    expect(getMerc(recruit(tables, start, id), id).affiliation).toEqual({ kind: 'guild' });
  });
});
