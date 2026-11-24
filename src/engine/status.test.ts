import { describe, expect, it } from 'vitest';
import { getRole, tables } from '../data';
import { initialFacilities } from './facilities';
import { advanceDay, assignToFacility, dispatch, expToNextLevel, getMerc, guildUpkeepPerDay, levelUpCost, newGame, type GameState } from './game';
import type { Rift } from './rift';
import { guildStatusSummary, levelUpCandidates, riftAutoRisk } from './status';

const opener = () =>
  newGame(tables, { seed: 'stat', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'p' } });
const rift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 2, countOffset: 1, rewardU: 0.5 },
  territoryFactionId: null,
  deadlineDay: 9,
  durationDays: 3,
  enemies: [
    { monsterId: 'void_hound', grade: 'low', level: 6, row: 'front' },
    { monsterId: 'spore_spitter', grade: 'low', level: 6, row: 'back' },
  ],
  reward: { zero: 100, arche: 10, materials: {} },
  ...patch,
});
const patch = (s: GameState, id: string, p: object): GameState => ({ ...s, mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, ...p } : m)) });

/** 부상·파견·훈련·거부가 섞인 길드(m01~m04 + 영입 m05 m06) */
function mixed(): GameState {
  let s = opener();
  s = { ...s, resources: { ...s.resources, zero: 9999 }, facilities: { ...s.facilities, levels: { ...s.facilities.levels, training: 1 } }, rifts: [rift('A')] };
  s = patch(s, 'm05', { affiliation: { kind: 'guild' } });
  s = patch(s, 'm06', { affiliation: { kind: 'guild' } });
  s = dispatch(tables, s, 'A', [{ mercId: 'm01', row: 'front' }]); // 4일차 복귀
  s = patch(s, 'm02', { injury: { severity: 'heavy', recoverDay: 6 } });
  s = patch(s, 'm03', { injury: { severity: 'light', recoverDay: 3 } });
  s = assignToFacility(tables, s, 'training', 'm04');
  s = patch(s, 'm05', { loyalty: { ...getMerc(s, 'm05').loyalty!, refusedOnDay: s.day } });
  return s;
}

describe('지금 상황 요약', () => {
  it('부상·파견 중·훈련·거부가 섞여도 인원·일수·유지비가 맞는다', () => {
    const s = mixed();
    const sum = guildStatusSummary(tables, s);
    expect(sum.total).toBe(6);
    expect(sum.available).toBe(1); // m06만
    expect(sum.blocked).toEqual({ expedition: 1, injured: 2, training: 1, refused: 1 });
    expect(sum.nextReturnDay).toBe(1 + 3);
    expect(sum.nextRecoveryDay).toBe(3);
    const daily = guildUpkeepPerDay(tables, s);
    expect(sum.dailyUpkeep).toBe(daily);
    expect(sum.upkeepUntilReturn).toBe(3 * daily);
    expect(sum.upkeepUntilRecovery).toBe(2 * daily);
    expect(sum.short).toBe(true);
    expect(guildStatusSummary(tables, structuredClone(s))).toEqual(sum);
  });

  it('아무 일도 없으면 복귀·회복일이 없고 부족하지 않다', () => {
    const sum = guildStatusSummary(tables, opener());
    expect(sum).toMatchObject({ available: 4, nextReturnDay: null, nextRecoveryDay: null, upkeepUntilReturn: null, upkeepUntilRecovery: null, short: false });
  });
});

describe('레벨업 가능 용병', () => {
  const ready = (s: GameState, id: string) => patch(s, id, { exp: expToNextLevel(tables, getMerc(s, id).level) });

  it('경험치·아르케 충족이면 올릴 수 있음, 아르케가 모자라면 부족분', () => {
    let s = ready(ready(opener(), 'm02'), 'm03');
    const cost2 = levelUpCost(tables, getMerc(s, 'm02').level);
    s = { ...s, resources: { ...s.resources, arche: cost2 } };
    const c = Object.fromEntries(levelUpCandidates(tables, s).map((x) => [x.mercId, x]));
    expect(c.m02).toEqual({ mercId: 'm02', cost: cost2, affordable: true, shortfall: 0 });
    const cost3 = levelUpCost(tables, getMerc(s, 'm03').level);
    expect(c.m03.affordable).toBe(cost2 >= cost3);
    const poor = { ...s, resources: { ...s.resources, arche: 1 } };
    expect(levelUpCandidates(tables, poor).find((x) => x.mercId === 'm02')).toEqual({ mercId: 'm02', cost: cost2, affordable: false, shortfall: cost2 - 1 });
    expect(levelUpCandidates(tables, s).map((x) => x.mercId)).not.toContain('m04'); // 경험치 부족
  });

  it('파견 중이면 빼고, 부상 중은 넣는다', () => {
    let s = ready(ready(opener(), 'm02'), 'm03');
    s = patch(s, 'm03', { injury: { severity: 'light', recoverDay: 5 } });
    s = dispatch(tables, { ...s, rifts: [rift('A')] }, 'A', [{ mercId: 'm02', row: 'back' }]);
    const ids = levelUpCandidates(tables, s).map((x) => x.mercId);
    expect(ids).not.toContain('m02');
    expect(ids).toContain('m03');
    expect(levelUpCandidates(tables, s, ['m04']).map((x) => x.mercId)).toEqual([]);
  });
});

describe('리프트 목록 위험도', () => {
  it('지금 가용 인원으로 자동 편성한 위험도이고, 가용 인원이 없으면 null', () => {
    const s = { ...opener(), rifts: [rift('A')] };
    const r = riftAutoRisk(tables, s, rift('A'));
    expect(r?.partySize).toBe(4);
    let none = mixed();
    none = patch(none, 'm06', { injury: { severity: 'light', recoverDay: 5 } });
    expect(riftAutoRisk(tables, none, rift('A'))).toBeNull();
  });

  it('숨은 값만 다르고 보이는 정보가 같은 두 리프트는 같은 표시', () => {
    const s = opener();
    const a = rift('Z', { fog: { deadlineOffset: 0, levelOffset: 2, countOffset: 0, rewardU: 0.5 } });
    const b = rift('Z', {
      fog: { deadlineOffset: 0, levelOffset: 4, countOffset: 1, rewardU: 0.5 },
      enemies: [
        { monsterId: 'void_hound', grade: 'low', level: 8, row: 'front' },
        { monsterId: 'spore_spitter', grade: 'low', level: 8, row: 'back' },
        { monsterId: 'void_hound', grade: 'low', level: 8, row: 'front' },
      ],
    });
    // Lv1에서 둘 다 "Lv4~8, 2~3마리, 사냥개·포자"로 보인다(실제는 Lv6 2마리와 Lv8 3마리)
    expect(riftAutoRisk(tables, s, a)).toEqual(riftAutoRisk(tables, s, b));
  });

  it('위험도 계산이 세이브 상태와 실제 전투 결과를 바꾸지 않는다', () => {
    const start = () => dispatch(tables, { ...opener(), rifts: [rift('A'), rift('B')] }, 'A', ['m01', 'm02', 'm03', 'm04'].map((mercId) => ({ mercId, row: getRole(tables, getMerc(opener(), mercId).role).defaultRow })));
    const plain = advanceDay(tables, start());
    const s = start();
    const snap = structuredClone(s);
    for (let i = 0; i < 3; i++) for (const r of s.rifts) riftAutoRisk(tables, s, r);
    expect(s).toEqual(snap);
    expect(advanceDay(tables, s)).toEqual(plain);
    expect(initialFacilities(tables).levels.scout).toBe(1);
  });
});
