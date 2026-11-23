/**
 * 전투력과 예상 위험도(지시서 010). 화면에 의존하지 않는 순수 함수.
 * 위험도는 탐지소로 "보이는 정보"(VisibleRift)만 받는다. 실제 Rift를 받지 않으므로 숨은 값을 쓸 수 없다.
 * 시뮬레이션은 전용 시드(power:리프트id:회차)만 써서 세이브 상태와 실제 전투 난수 흐름을 건드리지 않는다.
 */
import { getRole, type GameTables, type Row, type Stats } from '../data';
import { allyAuraRows, battleStartStats, computeEffectiveStats } from './stats';
import { resolveCombat, type CombatSlot } from './combat';
import type { ValueRange, VisibleRift } from './facilities';
import { createMonster, type Unit } from './unit';

/**
 * 스탯 하나 묶음의 전투력(지시서 016). 치명타는 평균 피해 배수 1 + 치명타율 × (치명타 피해율 − 1)로 공격에,
 * 회피는 받는 피해가 (1 − 회피율)배가 되는 효과를 체력에 1 ÷ (1 − 회피율)로 반영한다. 가중치는 combat-power.json.
 */
export function statsPower(tables: GameTables, s: Stats): number {
  const w = tables.combatPower.statWeights;
  const critMul = 1 + s.crit * (s.critDmg - 1);
  const evaMul = 1 / Math.max(0.01, 1 - s.eva);
  return s.hp * w.hp * evaMul + (s.pAtk * w.pAtk + s.eAtk * w.eAtk) * critMul + s.pDef * w.pDef + s.eDef * w.eDef + s.spd * w.spd;
}

/** 유닛 전투력: 최종 스탯 계산(stats.ts)의 전투 시작 기준 값으로 계산한다 */
export function unitPower(tables: GameTables, u: Unit, row?: Row): number {
  return statsPower(tables, computeEffectiveStats(tables, u, { round: 1, hpRatio: 1, row, allyAuras: allyAuraRows(tables, u) }));
}

/**
 * 파티 전투력: 파티원의 실제 현재 스탯(충성도 보정 포함, 호출 쪽이 mercToUnit으로 만든 유닛) 가중 합.
 * 전투 시작과 같은 함수(battleStartStats)로 파티 전체의 아군 효과까지 반영한다(지시서 018).
 */
export function combatPower(tables: GameTables, party: CombatSlot[]): number {
  return Math.round(battleStartStats(tables, party).reduce((s, st) => s + statsPower(tables, st), 0));
}

/** 보이는 정보의 한 경우(레벨, 마릿수)로 상대 무리를 만든다. 정확한 구성이 보이면 그 구성을 쓴다. */
export function estimatedEnemies(tables: GameTables, v: VisibleRift, level: number, count: number): CombatSlot[] {
  const species: string[] = [];
  if (v.monsterCounts) {
    for (const [id, n] of Object.entries(v.monsterCounts)) for (let i = 0; i < n; i++) species.push(id);
  } else {
    for (let i = 0; i < count; i++) species.push(v.monsterIds[i % v.monsterIds.length]);
  }
  return species.map((id, i) => {
    const m = tables.monsters.find((x) => x.id === id);
    if (!m) throw new Error(`몬스터 데이터에 없는 id: ${id}`);
    return {
      unit: createMonster(tables, { id: `est${i}`, name: m.name, element: m.element, role: m.role, grade: v.grade, level, monsterId: m.id }),
      row: getRole(tables, m.role).defaultRow,
    };
  });
}

/** 보이는 범위의 양 끝 조합(레벨 × 마릿수). 정확하면 한 경우뿐 */
export function visibleCases(v: VisibleRift): { level: number; count: number }[] {
  const levels = [...new Set([v.level[0], v.level[1]])];
  const counts = v.monsterCounts ? [Object.values(v.monsterCounts).reduce((a, b) => a + b, 0)] : [...new Set([v.count[0], v.count[1]])];
  return levels.flatMap((level) => counts.map((count) => ({ level, count })));
}

export interface RiskTierRow {
  id: string;
  name: string;
  minWinRate: number;
  /** 화면 5칸 막대 단계(1이 가장 좋음) */
  step: number;
}

export function riskTierOf(tables: GameTables, winRate: number): RiskTierRow {
  const tiers = [...tables.combatPower.riskTiers].sort((a, b) => b.minWinRate - a.minWinRate);
  return tiers.find((t) => winRate >= t.minWinRate) ?? tiers[tiers.length - 1];
}

export interface RiskEstimate {
  /** 가장 좋은 경우의 단계 */
  best: RiskTierRow;
  /** 가장 나쁜 경우의 단계 */
  worst: RiskTierRow;
  /** 보이는 정보가 범위라 여러 경우를 계산했는가("추정" 표시) */
  estimated: boolean;
  /** 상대 추정 전투력(범위) */
  enemyPower: ValueRange;
}

/** 승률(0~1): 전용 시드 power:리프트id:회차로 n번(기본 simulations) */
export function simulatedWinRate(tables: GameTables, party: CombatSlot[], enemies: CombatSlot[], riftId: string, n = tables.combatPower.simulations): number {
  let win = 0;
  for (let i = 0; i < n; i++) {
    if (resolveCombat(tables, { allies: party, enemies, seed: `power:${riftId}:${i}` }).outcome === 'victory') win++;
  }
  return n > 0 ? win / n : 0;
}

const memo = new Map<string, RiskEstimate>();
const MEMO_LIMIT = 200;

export interface RiskOptions {
  /** 상세 평가: detailSimulations번 모의(파티 편성 요약 등). 기본은 목록용 simulations번(지시서 018) */
  detail?: boolean;
}

/** 예상 위험도. 같은 입력이면 같은 결과(메모이제이션). */
export function estimateRisk(tables: GameTables, party: CombatSlot[], visible: VisibleRift, opts: RiskOptions = {}): RiskEstimate {
  const sims = opts.detail ? tables.combatPower.detailSimulations : tables.combatPower.simulations;
  const key = JSON.stringify([
    sims,
    // 특성·단계·스킬·레벨·최종 스탯까지 키에 넣는다(지시서 018: 특성만 다른 입력이 같은 캐시를 받던 오류)
    party.map((p) => [p.unit.id, p.unit.level, p.unit.element, p.unit.role, p.unit.stats, p.row, p.unit.traits ?? [], p.unit.skills]),
    battleStartStats(tables, party),
    visible.riftId,
    visible.grade,
    visible.level,
    visible.count,
    visible.monsterIds,
    visible.monsterCounts,
    tables.combatPower,
  ]);
  const hit = memo.get(key);
  if (hit && tables === lastTables) return hit;
  const cases = visibleCases(visible);
  const order = [...tables.combatPower.riskTiers].sort((a, b) => b.minWinRate - a.minWinRate);
  const rank = (t: RiskTierRow) => order.findIndex((x) => x.id === t.id);
  let best: RiskTierRow | undefined;
  let worst: RiskTierRow | undefined;
  const powers: number[] = [];
  for (const c of cases) {
    const enemies = estimatedEnemies(tables, visible, c.level, c.count);
    powers.push(combatPower(tables, enemies));
    const tier = party.length ? riskTierOf(tables, simulatedWinRate(tables, party, enemies, visible.riftId, sims)) : order[order.length - 1];
    if (!best || rank(tier) < rank(best)) best = tier;
    if (!worst || rank(tier) > rank(worst)) worst = tier;
  }
  const result: RiskEstimate = { best: best!, worst: worst!, estimated: cases.length > 1, enemyPower: [Math.min(...powers), Math.max(...powers)] };
  if (tables !== lastTables) memo.clear();
  lastTables = tables;
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, result);
  return result;
}
let lastTables: GameTables | undefined;
