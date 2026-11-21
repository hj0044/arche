/**
 * 리프트 화면의 도시 칩·요약·정렬·필터(지시서 013). React에 의존하지 않는 순수 함수라 테스트한다.
 * 정렬 항목과 "공략 가능" 위험도 단계는 ui.json에서 읽고, 비교 방법만 id별로 코드가 정한다(012 용병 화면과 같은 구조).
 * 화면은 탐지소로 "보이는 정보"(visibleRift)만 쓴다.
 */
import type { GameTables } from '../data';
import { visibleRift, type FacilitiesState, type ValueRange } from '../engine/facilities';
import type { GameState } from '../engine/game';
import type { Rift } from '../engine/rift';
import type { RiftAutoRisk } from '../engine/status';

/** 위험도: 계산 전이면 undefined, 출전 가능 인원이 없으면 null */
export type RiskLookup = (riftId: string) => RiftAutoRisk | null | undefined;

/** 보이는 마감까지 남은 일수(범위). 마감 없으면 null */
export function daysLeft(tables: GameTables, fs: FacilitiesState, rift: Rift, day: number): ValueRange | null {
  const d = visibleRift(tables, fs, rift).deadline;
  return d ? [Math.max(0, d[0] - day), Math.max(0, d[1] - day)] : null;
}

/** 마감 임박: 보이는 남은 일수의 작은 쪽이 ui.deadlineWarnDays 이하 */
export function isUrgent(tables: GameTables, fs: FacilitiesState, rift: Rift, day: number): boolean {
  const left = daysLeft(tables, fs, rift, day);
  return left !== null && left[0] <= tables.ui.deadlineWarnDays;
}

/** 공략 가능: 위험도 범위의 나쁜 쪽 끝이 ui.riftPlayableRiskTiers 안(예: 안전~해볼 만) */
export function isPlayable(tables: GameTables, risk: RiftAutoRisk | null | undefined): boolean {
  return !!risk && tables.ui.riftPlayableRiskTiers.includes(risk.estimate.worst.id);
}

export interface CityChip {
  cityId: string;
  count: number;
  urgent: number;
}

/** 도시 칩: 도시 표 순서, 리프트 수와 마감 임박 수 */
export function cityChips(tables: GameTables, state: GameState): CityChip[] {
  return tables.cities.map((c) => {
    const rifts = state.rifts.filter((r) => r.cityId === c.id);
    return { cityId: c.id, count: rifts.length, urgent: rifts.filter((r) => isUrgent(tables, state.facilities, r, state.day)).length };
  });
}

/** 전체 도시의 마감 임박 리프트 수(홈 한 줄) */
export const urgentRiftCount = (tables: GameTables, state: GameState) => cityChips(tables, state).reduce((a, c) => a + c.urgent, 0);

export interface RiftListOptions {
  cityId: string;
  sortId: string;
  /** 리프트 등급 칩(없으면 null) */
  tier: string | null;
  /** 위험도 "공략 가능"만 보기 */
  playableOnly: boolean;
}

const riskIndex = (tables: GameTables, id: string) => tables.combatPower.riskTiers.findIndex((t) => t.id === id);

function comparator(tables: GameTables, state: GameState, sortId: string, risk: RiskLookup): (a: Rift, b: Rift) => number {
  const fs = state.facilities;
  const deadline = (r: Rift) => visibleRift(tables, fs, r).deadline?.[0] ?? Infinity;
  const byDeadline = (a: Rift, b: Rift) => deadline(a) - deadline(b);
  // 위험도: 나쁜 쪽 끝 → 좋은 쪽 끝. 출전 가능 인원 없음(null)은 뒤, 계산 전(undefined)은 맨 뒤.
  const riskKey = (r: Rift): [number, number] => {
    const x = risk(r.id);
    if (x === undefined) return [Infinity, Infinity];
    if (x === null) return [1e6, 1e6];
    return [riskIndex(tables, x.estimate.worst.id), riskIndex(tables, x.estimate.best.id)];
  };
  const reward = (r: Rift) => visibleRift(tables, fs, r).victoryReward.zero[1];
  const tierIdx = (r: Rift) => tables.riftTiers.findIndex((t) => t.id === r.tier);
  const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
  switch (sortId) {
    case 'risk':
      return (a, b) => {
        const [ka, kb] = [riskKey(a), riskKey(b)];
        return cmp(ka[0], kb[0]) || cmp(ka[1], kb[1]) || byDeadline(a, b);
      };
    case 'reward':
      return (a, b) => reward(b) - reward(a) || byDeadline(a, b);
    case 'tier':
      return (a, b) => tierIdx(b) - tierIdx(a) || byDeadline(a, b);
    case 'deadline':
    default:
      return byDeadline;
  }
}

const byId = (a: Rift, b: Rift) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 도시·등급·공략 가능 필터(AND)와 정렬(같으면 마감, 그다음 id 순). */
export function filterAndSortRifts(tables: GameTables, state: GameState, o: RiftListOptions, risk: RiskLookup): Rift[] {
  const cmp = comparator(tables, state, o.sortId, risk);
  return state.rifts
    .filter((r) => r.cityId === o.cityId)
    .filter((r) => !o.tier || r.tier === o.tier)
    .filter((r) => !o.playableOnly || isPlayable(tables, risk(r.id)))
    .sort((a, b) => cmp(a, b) || byId(a, b));
}

/** 정렬·필터 결과가 위험도에 달려 있는가(그러면 도시의 리프트 위험도를 모두 먼저 계산한다) */
export const needsAllRisks = (o: RiftListOptions) => o.sortId === 'risk' || o.playableOnly;

/** 요약 한 줄 값: 마감 임박 수, 공략 가능 수(계산 전 리프트가 있으면 pending) */
export function citySummary(tables: GameTables, state: GameState, cityId: string, risk: RiskLookup) {
  const rifts = state.rifts.filter((r) => r.cityId === cityId);
  return {
    urgent: rifts.filter((r) => isUrgent(tables, state.facilities, r, state.day)).length,
    playable: rifts.filter((r) => isPlayable(tables, risk(r.id))).length,
    pending: rifts.some((r) => risk(r.id) === undefined),
  };
}
