/**
 * 라이벌 리프트 선점(지시서 013, 세력 경쟁 1차). 데이터(rift-preemption.json)만 쓰는 순수 함수.
 * 확률 = 등급 기본값 × 마감 임박 보정. 시드 = 세이브 시드:preempt:날짜:리프트 id.
 */
import type { GameTables } from '../data';
import type { Rift } from './rift';
import { createRng } from './rng';

type PreemptTables = Pick<GameTables, 'riftPreemption'>;

/** 마감 임박 보정. 남은 일수 이상인 maxDaysLeft 중 가장 작은 행의 배율, 없으면 1 */
export function deadlineMultiplier(tables: PreemptTables, daysLeft: number): number {
  const rows = tables.riftPreemption.deadlineMultipliers.filter((r) => daysLeft <= r.maxDaysLeft).sort((a, b) => a.maxDaysLeft - b.maxDaysLeft);
  return rows[0]?.multiplier ?? 1;
}

/** 판정 대상인가. 파견이 출발한 리프트는 목록(state.rifts)에 없으므로 여기 오지 않는다. */
export function isPreemptable(tables: PreemptTables, rift: Rift, day: number): boolean {
  const ex = tables.riftPreemption.exclude;
  if (ex.noDeadline && (rift.deadlineDay === null || rift.stable)) return false;
  if (ex.appearedToday && rift.appearedDay >= day) return false;
  return true;
}

/** 이 리프트가 오늘(day) 선점될 확률. 판정 대상이 아니면 0 */
export function preemptionChance(tables: PreemptTables, rift: Rift, day: number): number {
  if (!isPreemptable(tables, rift, day)) return 0;
  const t = tables.riftPreemption;
  const base = t.baseChanceByTier[rift.tier] ?? t.defaultBaseChance;
  const daysLeft = rift.deadlineDay === null ? Infinity : rift.deadlineDay - day;
  return Math.min(1, Math.max(0, base * deadlineMultiplier(tables, daysLeft)));
}

/** 오늘 선점되는 리프트 목록(상태는 바꾸지 않는다). 목록 순서대로 리프트마다 한 번 굴린다. */
export function rollPreemption(tables: PreemptTables, state: { seed: string; rifts: Rift[] }, day: number): Rift[] {
  return state.rifts.filter((r) => {
    const p = preemptionChance(tables, r, day);
    return p > 0 && createRng(`${state.seed}:preempt:${day}:${r.id}`).chance(p);
  });
}
