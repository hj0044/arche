/**
 * 계약자 상세 화면용 읽기 전용 선택자(지시서 017). 스탯 막대의 기준값: 같은 레벨에서 모든 역할 기본값 × 바운더리 상한 중 가장 큰 값.
 * 그래서 막대는 역할을 넘어 비교할 수 있고, 계약자별 기본 스탯의 최댓값이면 가득 찬다.
 */
import { CORE_STATS, type CoreStatId, type GameTables } from '../data';
import { levelScale } from '../engine/stats';

export function statBarMax(tables: GameTables, stat: CoreStatId, level: number): number {
  const hi = tables.stats.roleBounds[stat][1];
  const best = Math.max(...Object.values(tables.stats.roleBase).map((r) => r.base[stat]));
  return best * hi * levelScale(tables, stat, level);
}
export const isCoreStat = (id: string): id is CoreStatId => (CORE_STATS as readonly string[]).includes(id);
