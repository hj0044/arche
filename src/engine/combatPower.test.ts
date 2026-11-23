import { describe, expect, it } from 'vitest';
import { getRole, tables, type GameTables } from '../data';
import { combatPower, estimateRisk, estimatedEnemies, riskTierOf, simulatedWinRate, visibleCases } from './combatPower';
import type { CombatSlot } from './combat';
import { initialFacilities, visibleRift, type FacilitiesState } from './facilities';
import { advanceDay, dispatch, mercToUnit, newGame, type GameState } from './game';
import type { Rift } from './rift';
import { createMercenary } from './unit';

const fsAt = (scout: number): FacilitiesState => ({ ...initialFacilities(tables), levels: { ...initialFacilities(tables).levels, scout } });
const rift = (patch: Partial<Rift> = {}): Rift => ({
  id: 'R1',
  cityId: 'seoul',
  tier: 'crack',
  name: 'R1',
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 2, countOffset: 1, rewardU: 0.5 },
  territoryFactionId: null,
  deadlineDay: 9,
  durationDays: 1,
  enemies: [
    { monsterId: 'void_hound', grade: 'low', level: 12, row: 'front' },
    { monsterId: 'husk_guard', grade: 'low', level: 12, row: 'front' },
    { monsterId: 'spore_spitter', grade: 'low', level: 12, row: 'back' },
  ],
  reward: { zero: 100, arche: 10, materials: {} },
  ...patch,
});
const party = (level: number, n = 4): CombatSlot[] =>
  tables.roster
    .filter((r) => r.startingCandidate)
    .slice(0, n)
    .map((r) => ({ unit: createMercenary(tables, { id: r.id, name: r.name, element: r.element, role: r.role, level }), row: getRole(tables, r.role).defaultRow }));
const order = [...tables.combatPower.riskTiers].sort((a, b) => b.minWinRate - a.minWinRate).map((t) => t.id);
const rank = (id: string) => order.indexOf(id);

describe('전투력', () => {
  it('스탯 가중 합(데이터 가중치)이고, 충성도 보정이 든 실제 스탯을 쓴다', () => {
    const w = tables.combatPower.statWeights;
    const p = party(5, 1);
    const u = p[0].unit.stats; // 견본 유닛은 특성이 없어 최종 스탯 = 레벨 스탯
    const crit = 1 + u.crit * (u.critDmg - 1);
    const expected = (u.hp * w.hp) / (1 - u.eva) + (u.pAtk * w.pAtk + u.eAtk * w.eAtk) * crit + u.pDef * w.pDef + u.eDef * w.eDef + u.spd * w.spd;
    expect(combatPower(tables, p)).toBe(Math.round(expected));
    const s = newGame(tables, { seed: 'cp', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
    const m = s.mercenaries.find((x) => x.id === 'm01')!;
    const high = mercToUnit(tables, { ...m, loyalty: { ...m.loyalty!, value: 90 } });
    const low = mercToUnit(tables, { ...m, loyalty: { ...m.loyalty!, value: 5 } });
    expect(combatPower(tables, [{ unit: high, row: 'front' }])).toBeGreaterThan(combatPower(tables, [{ unit: low, row: 'front' }]));
  });
});

describe('예상 위험도', () => {
  it('같은 입력이면 같은 결과', () => {
    const v = visibleRift(tables, fsAt(1), rift());
    expect(estimateRisk(tables, party(8), v)).toEqual(estimateRisk(tables, party(8), structuredClone(v)));
  });

  it('숨은 값만 다르고 보이는 정보가 같은 두 리프트는 같은 위험도(새지 않음)', () => {
    // 실제 레벨 12(오프셋 2)와 14(오프셋 4)는 Lv1에서 둘 다 "Lv10~14", 수 3(오프셋 1)과 2(오프셋 0)는 둘 다 "2~3마리"
    const a = rift();
    const b = rift({
      fog: { deadlineOffset: 0, levelOffset: 4, countOffset: 0, rewardU: 0.5 },
      enemies: [
        { monsterId: 'void_hound', grade: 'low', level: 14, row: 'front' },
        { monsterId: 'husk_guard', grade: 'low', level: 14, row: 'front' },
      ],
    });
    const va = visibleRift(tables, fsAt(1), a);
    const vb = visibleRift(tables, fsAt(1), b);
    expect([va.level, va.count]).toEqual([vb.level, vb.count]);
    // 종류 목록이 다르면 보이는 정보도 다르니, 같은 종류만 비교
    const vb2 = { ...vb, monsterIds: va.monsterIds, victoryReward: va.victoryReward, retreatReward: va.retreatReward };
    expect(estimateRisk(tables, party(10), va)).toEqual(estimateRisk(tables, party(10), vb2));
  });

  it('파티 레벨을 올리면 위험도가 나빠지지 않는다(단조성)', () => {
    const v = visibleRift(tables, fsAt(2), rift());
    let prevBest = Infinity;
    let prevWorst = Infinity;
    for (const lv of [1, 4, 7, 10, 13, 16, 20, 30]) {
      const e = estimateRisk(tables, party(lv), v);
      expect(rank(e.best.id)).toBeLessThanOrEqual(prevBest);
      expect(rank(e.worst.id)).toBeLessThanOrEqual(prevWorst);
      prevBest = rank(e.best.id);
      prevWorst = rank(e.worst.id);
    }
    expect(order[prevBest]).toBe(order[0]);
  });

  it('범위면 양 끝 조합을 계산해 가장 좋은 단계와 가장 나쁜 단계를 구간으로 낸다', () => {
    const v = visibleRift(tables, fsAt(1), rift());
    const cases = visibleCases(v);
    expect(cases).toHaveLength(4);
    // 절벽 근처 레벨을 찾아 구간이 생기는지 본다
    const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((l) => {
      const e = estimateRisk(tables, party(l), v);
      return e.best.id !== e.worst.id;
    });
    expect(lv).toBeDefined();
    const tiers = cases.map((c) => riskTierOf(tables, simulatedWinRate(tables, party(lv!), estimatedEnemies(tables, v, c.level, c.count), v.riftId)).id);
    const e = estimateRisk(tables, party(lv!), v);
    expect(e.estimated).toBe(true);
    expect(e.best.id).toBe(order[Math.min(...tiers.map(rank))]);
    expect(e.worst.id).toBe(order[Math.max(...tiers.map(rank))]);
    expect(e.enemyPower[0]).toBeLessThan(e.enemyPower[1]);
    const exact = estimateRisk(tables, party(10), visibleRift(tables, fsAt(2), rift()));
    expect(exact.estimated).toBe(false);
    expect(exact.best).toEqual(exact.worst);
  });

  it('데이터 경계를 바꾸면 결과가 따라 바뀐다(5단계)', () => {
    const t: GameTables = {
      ...tables,
      combatPower: {
        ...tables.combatPower,
        riskTiers: [
          { id: 'a', name: '압승', minWinRate: 1, step: 1 },
          { id: 'b', name: '유리', minWinRate: 0.75, step: 2 },
          { id: 'c', name: '반반', minWinRate: 0.5, step: 3 },
          { id: 'd', name: '불리', minWinRate: 0.2, step: 4 },
          { id: 'e', name: '패배', minWinRate: 0, step: 5 },
        ],
      },
    };
    expect(riskTierOf(t, 1).name).toBe('압승');
    expect(riskTierOf(t, 0.8).name).toBe('유리');
    expect(riskTierOf(t, 0.1).name).toBe('패배');
    // 기본 데이터는 5구간(지시서 015): 압도 ≥0.9, 우세 ≥0.75, 접전 ≥0.5, 열세 ≥0.25, 무모
    expect(riskTierOf(tables, 0.95).name).toBe('압도');
    expect(riskTierOf(tables, 0.8).name).toBe('우세');
    expect(riskTierOf(tables, 0.6).name).toBe('접전');
    expect(riskTierOf(tables, 0.3).name).toBe('열세');
    expect(riskTierOf(tables, 0.1).name).toBe('무모');
    const v = visibleRift(tables, fsAt(2), rift());
    expect(['a', 'b', 'c', 'd', 'e']).toContain(estimateRisk(t, party(40), v).best.id);
  });

  it('위험도 계산 전후로 세이브 상태와 실제 전투 결과가 같다', () => {
    const start = (): GameState => {
      let s = newGame(tables, { seed: 'risk', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
      s = { ...s, rifts: [rift()] };
      return dispatch(tables, s, 'R1', ['m01', 'm02', 'm03', 'm04'].map((mercId) => ({ mercId, row: getRole(tables, s.mercenaries.find((m) => m.id === mercId)!.role).defaultRow })));
    };
    const plain = advanceDay(tables, start());
    const s = start();
    const snapshot = structuredClone(s);
    const p = s.expeditions[0].party.map((x) => ({ unit: mercToUnit(tables, s.mercenaries.find((m) => m.id === x.mercId)!), row: x.row }));
    for (let i = 0; i < 3; i++) estimateRisk(tables, p, visibleRift(tables, s.facilities, s.expeditions[0].rift));
    expect(s).toEqual(snapshot);
    expect(advanceDay(tables, s)).toEqual(plain);
  });
});
