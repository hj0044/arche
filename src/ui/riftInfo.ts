/**
 * 리프트 카드·상세·편성 화면의 마감과 하루당 수익 표기(지시서 015). React에 의존하지 않는 순수 함수.
 * 보이는 정보(visibleRift)만 써서 탐지소로 숨긴 값이 새지 않게 한다.
 */
import { travelDays, type GameTables } from '../data';
import { visibleRift, type FacilitiesState, type ValueRange } from '../engine/facilities';
import type { Rift } from '../engine/rift';

/**
 * 출발 마감. 엔진은 "오늘 + 편도 이동일 ≤ 마감일"일 때만 보낼 수 있다(game.ts dispatch).
 * 그래서 늦어도 출발해야 하는 날 = 마감일 − 편도 이동일. 마감이 범위로 보이면 범위. 마감 없으면 null.
 */
export function latestDeparture(tables: GameTables, fs: FacilitiesState, rift: Rift, baseCityId: string): { travel: number; day: ValueRange } | null {
  const d = visibleRift(tables, fs, rift).deadline;
  if (!d) return null;
  const travel = travelDays(tables, baseCityId, rift.cityId);
  return { travel, day: [d[0] - travel, d[1] - travel] };
}

/** 파견 총일수 = 소요 + 왕복 이동(소요 일수는 화면에 늘 보이는 값) */
export const expeditionDays = (tables: GameTables, rift: Rift, baseCityId: string) => rift.durationDays + travelDays(tables, baseCityId, rift.cityId) * 2;

/**
 * 승리 시 파견 하루당 제로 = 보이는 승리 보상(범위) ÷ 총일수, 내림. 보상이 범위면 범위 그대로 나눈다
 * (보이는 범위만 쓰므로 숨은 실제 보상은 드러나지 않는다).
 */
export function zeroPerDay(tables: GameTables, fs: FacilitiesState, rift: Rift, baseCityId: string): ValueRange {
  const z = visibleRift(tables, fs, rift).victoryReward.zero;
  const days = Math.max(1, expeditionDays(tables, rift, baseCityId));
  return [Math.floor(z[0] / days), Math.floor(z[1] / days)];
}
