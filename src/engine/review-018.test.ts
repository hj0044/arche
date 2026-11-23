/**
 * 지시서 018 회귀 테스트(근거: docs/reviews/2026-11-24-combat-power-sim.md, 재현 audit.ts의 core 검사).
 */
import { describe, expect, it } from 'vitest';
import { getRole, tables, type Stats } from '../data';
import { resolveCombat, type CombatSlot } from './combat';
import { combatPower, estimateRisk, statsPower } from './combatPower';
import { scoutingRow, type VisibleRift } from './facilities';
import { mercToUnit, newGame, type MercenaryState } from './game';
import { allyAuraRows, battleStartStats, computeEffectiveStats, validateStatsTable } from './stats';
import { createMercenary, type Unit } from './unit';

const slot = (unit: Unit): CombatSlot => ({ unit, row: getRole(tables, unit.role).defaultRow });
const generic = (role: string, level: number, id: string) => slot(createMercenary(tables, { id, name: id, element: 'void', role, level }));
const withTraits = (s: CombatSlot, ids: string[]): CombatSlot => ({ ...s, unit: { ...s.unit, traits: ids.map((id) => ({ id, rank: 1 })) } });

describe('018 1-1: 파티 전투력은 전투 시작과 같은 방식으로 아군 효과를 반영한다', () => {
  const party = [withTraits(generic('commander', 35, 'aura'), ['unique_m26']), generic('shield', 35, 'recipient')];

  it('power_party_aura: 표시 전투력 = 파티 전체 아군 효과를 반영한 값', () => {
    const aura = party.flatMap((s) => allyAuraRows(tables, s.unit));
    expect(aura.length).toBeGreaterThan(0);
    const full = Math.round(party.reduce((sum, s) => sum + statsPower(tables, computeEffectiveStats(tables, s.unit, { round: 1, hpRatio: 1, row: s.row, allyAuras: aura })), 0));
    expect(combatPower(tables, party)).toBe(full);
  });

  it('전투의 시작 최대 체력과 전투력 계산이 같은 함수(battleStartStats)를 쓴다', () => {
    const start = battleStartStats(tables, party);
    const r = resolveCombat(tables, { allies: party, enemies: [generic('warrior', 1, 'foe')], seed: 'aura-hp' });
    const startEvent = r.events.find((e) => e.type === 'start');
    if (startEvent?.type !== 'start') throw new Error('start 없음');
    expect(startEvent.combatants.filter((c) => c.side === 'ally').map((c) => c.maxHp)).toEqual(start.map((s) => s.hp));
    // 수호자의 체력은 전술가의 아군 체력 효과로 자기 혼자일 때보다 크다
    expect(start[1].hp).toBeGreaterThan(battleStartStats(tables, [party[1]])[0].hp);
  });
});

describe('018 1-2: 위험도 캐시 키에 특성이 들어간다', () => {
  it('risk_cache_trait_key: 같은 스탯에 특성만 더해도 캐시를 비운 결과와 같다(power:cache:15:84)', () => {
    const save = newGame(tables, { seed: 'days', guildName: '검수 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
    const base = generic('mage', 15, 'cache');
    const a: CombatSlot = { ...base, unit: { ...base.unit, stats: { ...base.unit.stats, eAtk: 84 } } };
    const buffed = withTraits(a, ['focus']);
    const reward = { zero: [0, 0] as [number, number], arche: [0, 0] as [number, number], materials: {} };
    const visible: VisibleRift = {
      riftId: 'cache:15:84', grade: 'mid', tier: 'gate', scouting: scoutingRow(tables, save.facilities),
      level: [15, 15], count: [2, 2], monsterIds: ['rift_caller'], monsterCounts: { rift_caller: 2 },
      elements: ['void'], deadline: null, victoryReward: reward, retreatReward: reward, omenHidden: true, blurred: false,
    };
    estimateRisk(tables, [a], visible);
    const warm = estimateRisk(tables, [buffed], visible).worst.id;
    const fresh = estimateRisk({ ...tables }, [buffed], visible).worst.id;
    expect(warm).toBe(fresh);
  });
});

describe('018 1-3: 치명타 피해율 최종 상한', () => {
  it('stats.json caps에 critDmg가 있고, 상한 키가 빠지면 검증이 실패한다', () => {
    expect(tables.stats.caps.critDmg).toBe(2);
    expect(validateStatsTable(tables)).toEqual([]);
    const { critDmg: _drop, ...rest } = tables.stats.caps;
    expect(validateStatsTable({ ...tables, stats: { ...tables.stats, caps: rest } }).join()).toMatch(/critDmg/);
  });

  it('입력 10.0이 2.0으로 잘린다', () => {
    const u = generic('archer', 10, 'c').unit;
    const stats: Stats = { ...u.stats, critDmg: 10 };
    expect(computeEffectiveStats(tables, { ...u, stats }).critDmg).toBe(2);
  });

  it('지금 계약자 30명은 성장 한계 레벨에서도 잘리지 않는다(최대 1.75)', () => {
    let max = 0;
    for (const m of tables.roster) {
      const state: MercenaryState = {
        id: m.id, name: m.name, role: m.role, element: m.element, level: m.growth.cap, exp: 0,
        initialLevel: m.initialLevel, growth: m.growth, affiliation: { kind: 'guild' },
        profile: { background: m.background, world: m.world, race: m.race },
      };
      const u = mercToUnit(tables, state);
      const s = battleStartStats(tables, [slot(u)])[0];
      max = Math.max(max, s.critDmg);
    }
    expect(max).toBeLessThan(tables.stats.caps.critDmg!);
    expect(max).toBeCloseTo(1.75, 5);
  });
});

describe('018 3: 위험도 상세 평가', () => {
  it('detail이면 detailSimulations(96)번, 기본은 simulations(12)번으로 승률을 잰다', async () => {
    const { simulatedWinRate, estimatedEnemies } = await import('./combatPower');
    expect(tables.combatPower.simulations).toBe(12);
    expect(tables.combatPower.detailSimulations).toBe(96);
    const party = [generic('warrior', 12, 'w'), generic('healer', 12, 'h')];
    const save = newGame(tables, { seed: 'days', guildName: 'x', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'fire', role: 'warrior', background: 'survivor' } });
    const reward = { zero: [0, 0] as [number, number], arche: [0, 0] as [number, number], materials: {} };
    const visible: VisibleRift = {
      riftId: 'detail', grade: 'mid', tier: 'gate', scouting: scoutingRow(tables, save.facilities),
      level: [14, 14], count: [2, 2], monsterIds: ['rift_caller'], monsterCounts: { rift_caller: 2 },
      elements: ['void'], deadline: null, victoryReward: reward, retreatReward: reward, omenHidden: true, blurred: false,
    };
    const enemies = estimatedEnemies(tables, visible, 14, 2);
    const w96 = simulatedWinRate(tables, party, enemies, 'detail', 96);
    const { riskTierOf } = await import('./combatPower');
    expect(estimateRisk(tables, party, visible, { detail: true }).worst.id).toBe(riskTierOf(tables, w96).id);
    const w12 = simulatedWinRate(tables, party, enemies, 'detail');
    expect(estimateRisk(tables, party, visible).worst.id).toBe(riskTierOf(tables, w12).id);
  });
});
