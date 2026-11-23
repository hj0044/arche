/**
 * 파티 편성 화면용 읽기 전용 선택자(지시서 017 3항 Party). 엔진의 전투력·위험도 함수를 그대로 쓴다.
 * 승률 범위는 위험도 추정과 같은 경우(보이는 레벨·수의 양 끝)를 같은 모의 전투로 잰 값이다.
 */
import type { GameTables } from '../data';
import type { CombatSlot } from '../engine/combat';
import { estimatedEnemies, simulatedWinRate, visibleCases } from '../engine/combatPower';
import type { VisibleRift } from '../engine/facilities';

const memo = new Map<string, [number, number]>();

export function winRateRange(tables: GameTables, party: CombatSlot[], v: VisibleRift): [number, number] | null {
  if (!party.length) return null;
  const key = JSON.stringify([party.map((p) => [p.unit.id, p.unit.level, p.unit.stats, p.unit.traits, p.row]), v.riftId, v.level, v.count, v.monsterCounts]);
  const hit = memo.get(key);
  if (hit) return hit;
  const rates = visibleCases(v).map((c) => simulatedWinRate(tables, party, estimatedEnemies(tables, v, c.level, c.count), v.riftId));
  const r: [number, number] = [Math.min(...rates), Math.max(...rates)];
  if (memo.size > 200) memo.clear();
  memo.set(key, r);
  return r;
}
