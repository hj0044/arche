import { describe, expect, it } from 'vitest';
import { tables, type GameTables, type Outcome } from '../data';
import { advanceDay, dispatch, expPerMember, expShare, getMerc, newGame, type GameState, type PartyMember } from './game';
import type { Rift } from './rift';

const rift: Rift = {
  id: 'X',
  cityId: 'seoul',
  tier: 'gate',
  name: 'X',
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  territoryFactionId: null,
  deadlineDay: 9,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'mid', level: 20, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
};
const withShare = (basePartySize: number, soloCapMultiplier: number): GameTables => ({
  ...tables,
  progression: { ...tables.progression, expShare: { basePartySize, soloCapMultiplier } },
});

describe('파견 경험치 나누기', () => {
  const per = expPerMember(tables, rift, 'victory');

  it('5인은 기존 한 명당 경험치와 같다(회귀)', () => {
    const old = Math.round(tables.progression.expByOutcome.victory * tables.progression.expTierMultiplier.gate * (1 + tables.progression.expLevelScale * 20));
    expect(per).toBe(old);
    expect(expShare(tables, rift, 'victory', 5)).toBe(old);
  });

  it('4인 ×1.25, 3인 ×5/3, 2인·1인은 상한 ×2', () => {
    expect(expShare(tables, rift, 'victory', 4)).toBe(Math.round(per * 1.25));
    expect(expShare(tables, rift, 'victory', 3)).toBe(Math.round((per * 5) / 3));
    expect(expShare(tables, rift, 'victory', 2)).toBe(per * 2);
    expect(expShare(tables, rift, 'victory', 1)).toBe(per * 2);
  });

  it('데이터 값을 바꾸면 규칙이 따라 바뀐다(기준 4, 상한 3배)', () => {
    const t = withShare(4, 3);
    expect(expShare(t, rift, 'victory', 4)).toBe(per);
    expect(expShare(t, rift, 'victory', 5)).toBe(Math.round((per * 4) / 5));
    expect(expShare(t, rift, 'victory', 2)).toBe(per * 2);
    expect(expShare(t, rift, 'victory', 1)).toBe(per * 3);
  });

  it.each(['victory', 'retreat', 'defeat'] as Outcome[])('%s도 같은 나누기를 따른다', (outcome) => {
    const p = expPerMember(tables, rift, outcome);
    expect(expShare(tables, rift, outcome, 5)).toBe(p);
    expect(expShare(tables, rift, outcome, 3)).toBe(Math.round((p * 5) / 3));
    expect(expShare(tables, rift, outcome, 1)).toBe(p * 2);
  });

  /** 같은 리프트에 인원만 다르게 보내 정산한다 */
  function settle(ids: string[]) {
    let s: GameState = newGame(tables, { seed: 'share', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'light', role: 'warrior', background: 'soldier' } });
    s = { ...s, mercenaries: s.mercenaries.map((m) => (['m05', 'm06'].includes(m.id) ? { ...m, affiliation: { kind: 'guild' as const }, loyalty: m.loyalty } : m)) };
    const easy: Rift = { ...rift, tier: 'crack', enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }] };
    const party: PartyMember[] = ids.map((mercId) => ({ mercId, row: tables.roles.find((r) => r.id === getMerc(s, mercId).role)!.defaultRow }));
    s = dispatch(tables, { ...s, rifts: [easy] }, 'X', party);
    const after = advanceDay(tables, s).state;
    return { report: after.reports[0], per: expPerMember(tables, easy, 'victory'), after };
  }

  it('정산 보고서에는 나눈 뒤의 값이 기록되고 실제로 쌓인다(주인공 포함, 인원 = 파견 전원)', () => {
    for (const ids of [['hero', 'm02', 'm03', 'm04', 'm05'], ['hero', 'm02', 'm03'], ['m02']]) {
      const { report, per: p, after } = settle(ids);
      expect(report.outcome).toBe('victory');
      const expected = expShare(tables, { ...rift, tier: 'crack', enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }] }, 'victory', ids.length);
      expect(report.expGains.map((g) => g.exp)).toEqual(ids.map(() => expected));
      expect(report.expGains.map((g) => g.mercId)).toEqual(ids);
      if (ids.length === 5) expect(expected).toBe(p);
      for (const id of ids) expect(getMerc(after, id).exp).toBe(expected);
    }
  });

  it('같은 입력이면 두 번 돌려도 같다', () => {
    expect(settle(['hero', 'm02', 'm03'])).toEqual(settle(['hero', 'm02', 'm03']));
  });
});
