import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { advanceDay, dispatch, GameError, getMerc, isAvailable, levelUp, newGame, riftReward, type GameState } from './game';
import type { Rift } from './rift';

const opener = () =>
  newGame(tables, {
    seed: 'audit-20261120',
    guildName: '검수 길드',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: '검수자', element: 'fire', role: 'warrior', background: 'survivor' },
  });

const easyRift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: `시험 ${id}`,
  appearedDay: 1,
  deadlineDay: 20,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 3, row: 'front' }],
  reward: { zero: 100, arche: 20, materials: {} },
  ...patch,
});

const add = (s: GameState, ...rifts: Rift[]): GameState => ({ ...s, rifts: [...s.rifts, ...rifts] });

describe('주인공 파견 규칙(2026-11-20 확정)', () => {
  it('주인공 없이도 파견할 수 있다', () => {
    const s = dispatch(tables, add(opener(), easyRift('A')), 'A', [
      { mercId: 'm02', row: 'back' },
      { mercId: 'm03', row: 'back' },
    ]);
    expect(s.expeditions[0].party.map((p) => p.mercId)).toEqual(['m02', 'm03']);
    expect(isAvailable(s, 'hero')).toBe(true);
  });

  it('주인공이 파견 중이면 다른 파티에 넣을 수 없고, 복귀하면 다시 넣을 수 있다', () => {
    let s = add(opener(), easyRift('A'), easyRift('B'));
    s = dispatch(tables, s, 'A', [{ mercId: 'hero', row: 'front' }, { mercId: 'm02', row: 'back' }]);
    expect(isAvailable(s, 'hero')).toBe(false);
    expect(() => dispatch(tables, s, 'B', [{ mercId: 'hero', row: 'front' }])).toThrow(/이미 파견/);
    s = advanceDay(tables, s).state;
    expect(s.reports[0].outcome).toBe('victory');
    const hero = getMerc(s, 'hero');
    expect(hero.injury).toBeUndefined();
    expect(isAvailable(s, 'hero')).toBe(true);
    expect(dispatch(tables, s, 'B', [{ mercId: 'hero', row: 'front' }]).expeditions).toHaveLength(1);
  });
});

describe('리프트 카드 보상 = 승리 정산', () => {
  const settle = (rift: Rift) => {
    let s = add(opener(), rift);
    const before = s.resources;
    s = dispatch(tables, s, rift.id, [
      { mercId: 'hero', row: 'front' },
      { mercId: 'm02', row: 'back' },
      { mercId: 'm03', row: 'back' },
      { mercId: 'm04', row: 'back' },
    ]);
    const { state } = advanceDay(tables, s);
    return { before, state, report: state.reports[0] };
  };

  it.each([
    ['일반 리프트', easyRift('N', { enemies: [{ monsterId: 'void_hound', grade: 'low', level: 12, row: 'front' }], reward: { zero: 147, arche: 14, materials: {} } })],
    ['관문(재료 포함)', easyRift('G', { tier: 'gate', reward: { zero: 250, arche: 40, materials: { earth_parts: 2 } } })],
    ['안정화 통로', easyRift('S', { tier: 'route', stable: true, deadlineDay: null, reward: { zero: 600, arche: 100, materials: { earth_parts: 3 } } })],
  ])('%s: 카드가 쓰는 계산과 실제 승리 보상이 같다', (_label, rift) => {
    const shown = riftReward(tables, rift, 'victory');
    const { report } = settle(rift);
    expect(report.outcome).toBe('victory');
    expect(report.reward).toEqual(shown);
  });

  it('카드 값에는 몬스터 레벨 배율과 안정화 통로 배율이 들어간다', () => {
    const base = easyRift('X', { enemies: [{ monsterId: 'void_hound', grade: 'low', level: 12, row: 'front' }], reward: { zero: 147, arche: 14, materials: {} } });
    const p = tables.progression;
    expect(riftReward(tables, base, 'victory').zero).toBe(Math.floor(147 * (1 + p.rewardLevelScale * 12)));
    const stable = { ...base, stable: true };
    expect(riftReward(tables, stable, 'victory').zero).toBe(Math.floor(147 * p.stablePassageRewardRatio * (1 + p.rewardLevelScale * 12)));
    expect(riftReward(tables, base, 'retreat').zero).toBe(Math.floor(147 * p.rewardRatioByOutcome.retreat * (1 + p.rewardLevelScale * 12)));
  });
});

describe('레벨업 규칙(2026-11-20 확정)', () => {
  const ready = (s: GameState, id: string, patch: object = {}): GameState => ({
    ...s,
    resources: { ...s.resources, arche: 999 },
    mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, exp: 9999, ...patch } : m)),
  });

  it('파견 중에는 거부하고, 복귀하면 허용한다', () => {
    let s = ready(add(opener(), easyRift('A')), 'm02');
    s = dispatch(tables, s, 'A', [{ mercId: 'hero', row: 'front' }, { mercId: 'm02', row: 'back' }]);
    expect(() => levelUp(tables, s, 'm02')).toThrow(GameError);
    expect(() => levelUp(tables, s, 'm02')).toThrow('파견 중에는 레벨업할 수 없음');
    s = advanceDay(tables, s).state;
    const lv = getMerc(s, 'm02').level;
    expect(getMerc(levelUp(tables, s, 'm02'), 'm02').level).toBe(lv + 1);
  });

  it('부상 중에는 허용한다', () => {
    const s = ready(opener(), 'm03', { injury: { severity: 'heavy', recoverDay: 5 } });
    const lv = getMerc(s, 'm03').level;
    expect(getMerc(levelUp(tables, s, 'm03'), 'm03').level).toBe(lv + 1);
  });
});

describe('이름 길이(2026-11-20 확정: 제한 없음)', () => {
  it('아주 긴 길드·주인공 이름도 받고, 빈 이름만 막는다', () => {
    const long = '가'.repeat(200);
    const s = newGame(tables, {
      seed: 'n',
      guildName: long,
      baseCityId: 'seoul',
      protagonist: { mode: 'opener', name: long, element: 'fire', role: 'warrior', background: 'survivor' },
    });
    expect(s.guildName).toBe(long);
    expect(getMerc(s, 'hero').name).toBe(long);
    const base = { seed: 'n', baseCityId: 'seoul', protagonist: { mode: 'guildMaster' as const, name: 'gm', background: 'heir' } };
    expect(() => newGame(tables, { ...base, guildName: '   ' })).toThrow(/길드 이름/);
    expect(() => newGame(tables, { ...base, guildName: 'g', protagonist: { ...base.protagonist, name: ' ' } })).toThrow(/주인공 이름/);
  });
});
