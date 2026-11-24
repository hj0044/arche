import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { initialFacilities, visibleRift } from './facilities';
import { canLevelUp, dispatch, expToNextLevel, getMerc, levelUp, levelUpAll, levelUpCost, newGame, riftReward, type GameState } from './game';
import { generateRift, type Rift } from './rift';
import { createRng } from './rng';
import { levelUpOverview } from './status';

const gm = () => newGame(tables, { seed: 'lua', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
/** 용병에게 경험치를 levels 단계만큼 넣는다 */
function give(s: GameState, id: string, levels: number): GameState {
  const m = getMerc(s, id);
  let exp = 0;
  for (let i = 0; i < levels; i++) exp += expToNextLevel(tables, m.level + i);
  return { ...s, mercenaries: s.mercenaries.map((x) => (x.id === id ? { ...x, exp } : x)) };
}
const withArche = (s: GameState, arche: number): GameState => ({ ...s, resources: { ...s.resources, arche } });
const lv = (s: GameState, id: string) => getMerc(s, id).level;

describe('일괄 레벨업', () => {
  it('가장 낮은 레벨부터, 한 용병이 여러 번 오르고, 더 할 수 없을 때 멈춘다', () => {
    let s = gm(); // m01 Lv5, m02 Lv4, m03 Lv3, m04 Lv6
    s = give(give(give(s, 'm01', 1), 'm03', 3), 'm04', 1);
    s = withArche(s, 9999);
    const { state, steps } = levelUpAll(tables, s);
    expect(steps.map((x) => `${x.mercId}:${x.from}`)).toEqual(['m03:3', 'm03:4', 'm01:5', 'm03:5', 'm04:6']);
    expect([lv(state, 'm01'), lv(state, 'm03'), lv(state, 'm04')]).toEqual([6, 6, 7]);
    expect(state.resources.arche).toBe(9999 - steps.reduce((a, x) => a + x.cost, 0));
    expect(state.mercenaries.every((m) => !canLevelUp(tables, state, m.id))).toBe(true);
  });

  it('아르케가 모자라면 낮은 레벨 순서대로 가다 멈춘다', () => {
    let s = give(give(gm(), 'm03', 1), 'm04', 1);
    const c3 = levelUpCost(tables, 3);
    s = withArche(s, c3 + levelUpCost(tables, 6) - 1);
    const { steps } = levelUpAll(tables, s);
    expect(steps.map((x) => x.mercId)).toEqual(['m03']);
  });

  it('성장 한계에서 멈추고, 파견 중은 빼고, 부상 중은 넣는다', () => {
    let s = withArche(give(give(give(gm(), 'm01', 2), 'm02', 2), 'm03', 2), 9999);
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm01' ? { ...m, growth: { ...m.growth, cap: 6 } } : m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 9 } } : m)) };
    const rift: Rift = { id: 'A', cityId: 'seoul', tier: 'crack', name: 'A', appearedDay: 1, fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 }, territoryFactionId: null, deadlineDay: 9, durationDays: 2, enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }], reward: { zero: 1, arche: 1, materials: {} } };
    s = dispatch(tables, { ...s, rifts: [rift] }, 'A', [{ mercId: 'm02', row: 'back' }]);
    const { state } = levelUpAll(tables, s);
    expect(lv(state, 'm01')).toBe(6); // 한계
    expect(lv(state, 'm02')).toBe(4); // 파견 중
    expect(lv(state, 'm03')).toBe(5); // 부상 중에도 오름
  });

  it('같은 입력이면 같은 결과이고, 한 명씩 levelUp을 반복한 결과와 같다', () => {
    const s = withArche(give(give(give(gm(), 'm01', 2), 'm02', 3), 'm04', 1), 60);
    const a = levelUpAll(tables, s);
    expect(levelUpAll(tables, structuredClone(s))).toEqual(a);
    let manual = s;
    for (const st of a.steps) manual = levelUp(tables, manual, st.mercId);
    expect(manual).toEqual(a.state);
  });

  it('미리보기는 상태를 바꾸지 않고 합계를 보여준다', () => {
    const s = withArche(give(give(gm(), 'm03', 1), 'm04', 1), levelUpCost(tables, 3));
    const snap = structuredClone(s);
    const o = levelUpOverview(tables, s);
    expect(s).toEqual(snap);
    expect(o.readyCount).toBe(2);
    expect(o.totalCostOneEach).toBe(levelUpCost(tables, 3) + levelUpCost(tables, 6));
    expect(o.archeShortCount).toBe(1);
    expect(o.plan).toMatchObject({ mercs: 1, levels: 1, arche: levelUpCost(tables, 3) });
  });
});

describe('탐지소 보상 범위(보이는 정보로만)', () => {
  const fsAt = (scout: number) => ({ ...initialFacilities(tables), levels: { ...initialFacilities(tables).levels, scout } });
  const base: Rift = {
    id: 'B', cityId: 'seoul', tier: 'gate', name: 'B', appearedDay: 1, fog: { deadlineOffset: 0, levelOffset: 2, countOffset: 0, rewardU: 0.3 }, territoryFactionId: null, deadlineDay: 9, durationDays: 2,
    enemies: [{ monsterId: 'void_hound', grade: 'mid', level: 20, row: 'front' }], reward: { zero: 250, arche: 40, materials: { earth_parts: 2 } },
  };

  it('보이는 레벨 범위가 같고 실제 레벨·보상만 다르면 같은 보상 범위', () => {
    const other: Rift = { ...base, fog: { ...base.fog, levelOffset: 4, rewardU: 0.9 }, enemies: [{ ...base.enemies[0], level: 22 }], reward: { zero: 300, arche: 33, materials: { earth_parts: 1 } } };
    for (const lv1 of [1, 2]) {
      const a = visibleRift(tables, fsAt(lv1), base);
      const b = visibleRift(tables, fsAt(lv1), other);
      if (lv1 === 1) {
        expect(a.level).toEqual(b.level);
        expect(a.victoryReward).toEqual(b.victoryReward);
        expect(a.retreatReward).toEqual(b.retreatReward);
      }
    }
  });

  it('실제 보상은 항상 보이는 범위 안에 있고, Lv3에서는 정확한 값', () => {
    const t: GameTables = tables;
    for (let i = 0; i < 200; i++) {
      const r = generateRift(t, i % 2 ? 'newyork' : 'seoul', 1, `x${i}`, createRng(`rw-${i}`));
      for (const scout of [1, 2]) {
        const v = visibleRift(t, fsAt(scout), r);
        for (const outcome of ['victory', 'retreat'] as const) {
          const real = riftReward(t, r, outcome);
          const shown = outcome === 'victory' ? v.victoryReward : v.retreatReward;
          expect(real.zero).toBeGreaterThanOrEqual(shown.zero[0]);
          expect(real.zero).toBeLessThanOrEqual(shown.zero[1]);
          expect(real.arche).toBeGreaterThanOrEqual(shown.arche[0]);
          expect(real.arche).toBeLessThanOrEqual(shown.arche[1]);
          for (const [k, n] of Object.entries(real.materials)) {
            expect(n).toBeGreaterThanOrEqual(shown.materials[k][0]);
            expect(n).toBeLessThanOrEqual(shown.materials[k][1]);
          }
        }
      }
      const v3 = visibleRift(t, fsAt(3), r);
      const real = riftReward(t, r, 'victory');
      expect(v3.victoryReward.zero).toEqual([real.zero, real.zero]);
    }
  });
});

describe('훈련 배치 버튼 상태', () => {
  it('미건설, 가능, 배치됨, 부상, 칸 가득', async () => {
    const { trainingAccess } = await import('./status');
    const { assignToFacility } = await import('./game');
    let s = gm();
    expect(trainingAccess(tables, s, 'm01')).toMatchObject({ built: false, reason: null });
    s = { ...s, facilities: { ...s.facilities, levels: { ...s.facilities.levels, training: 1 } } };
    const a = trainingAccess(tables, s, 'm01');
    expect(a).toMatchObject({ built: true, reason: null, assigned: false, used: 0 });
    for (let i = 0; i < a.slots; i++) s = assignToFacility(tables, s, 'training', ['m01', 'm02', 'm03', 'm04'][i]);
    expect(trainingAccess(tables, s, 'm01')).toMatchObject({ assigned: true, reason: null });
    expect(trainingAccess(tables, s, 'm04').reason).toBe('칸이 가득 참');
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm04' ? { ...m, injury: { severity: 'light', recoverDay: 5 } } : m)) };
    expect(trainingAccess(tables, s, 'm04').reason).toBe('부상 중');
  });
});
