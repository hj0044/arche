import type { GameTables, LoyaltyChangeKey, LoyaltyTierRow, LoyaltyWeightKey, TendencyRow } from '../data';

/** 계약자 한 명의 충성도 상태 */
export interface LoyaltyState {
  value: number;
  /** 위험 구간에서 하루를 마친 연속 일수 */
  dangerDays: number;
  /** 연속으로 쉰 일수(파견 중도 부상 중도 아닌 날). 파견·부상이면 0 */
  restStreak: number;
  /** 파견을 거부한 날(그날만 거부) */
  refusedOnDay: number | null;
  /** 급료 보너스를 쓴 날(하루 1회) */
  bonusDay: number | null;
  /** 최근 변동 요인(최신이 뒤) */
  recent: LoyaltyLogEntry[];
}

export interface LoyaltyLogEntry {
  day: number;
  reason: LoyaltyChangeKey;
  delta: number;
}

export function newLoyalty(tables: GameTables): LoyaltyState {
  return { value: tables.loyalty.start, dangerDays: 0, restStreak: 0, refusedOnDay: null, bonusDay: null, recent: [] };
}

/** 값이 속한 구간. tiers는 min이 큰 것부터 판정한다. */
export function loyaltyTier(tables: GameTables, value: number): LoyaltyTierRow {
  const tiers = [...tables.loyalty.tiers].sort((a, b) => b.min - a.min);
  return tiers.find((t) => value >= t.min) ?? tiers[tiers.length - 1];
}

/** 배경이 정하는 계약 성향(용병마다 저장하지 않고 매핑 표에서 읽는다) */
export function tendencyOf(tables: GameTables, backgroundId: string): TendencyRow | undefined {
  const id = tables.loyalty.backgroundTendency[backgroundId];
  return tables.loyalty.tendencies.find((t) => t.id === id);
}

/** 성향 가중치를 곱한 변동량. 상급 이상 리프트 승리는 victoryHard 가중치(없으면 victory)를 쓴다. */
export function loyaltyDelta(tables: GameTables, backgroundId: string, key: LoyaltyChangeKey, hardRift = false): number {
  // 외곽 임무(지시서 022): 성향별 고정 값(가중치가 아니라 값 자체)
  if (key === 'outerMission') {
    const o = tables.loyalty.outerMission;
    return o.byTendency[tendencyOf(tables, backgroundId)?.id ?? ''] ?? o.default;
  }
  const w = tendencyOf(tables, backgroundId)?.weights ?? {};
  const weightKey: LoyaltyWeightKey = key === 'victory' && hardRift && w.victoryHard !== undefined ? 'victoryHard' : key;
  return tables.loyalty.changes[key] * (w[weightKey] ?? 1);
}

/** 소수 둘째 자리까지 남기고(성향 가중치 ×0.25 같은 작은 변동도 반영) 범위 안으로 자른다. */
export function clampLoyalty(tables: GameTables, v: number): number {
  const [lo, hi] = tables.loyalty.range;
  return Math.min(hi, Math.max(lo, Math.round(v * 100) / 100));
}

/** 변동을 적용하고 최근 기록에 남긴다(상태를 직접 바꾼다). 실제로 바뀐 양을 돌려준다. */
export function applyLoyalty(
  tables: GameTables,
  loyalty: LoyaltyState,
  backgroundId: string,
  key: LoyaltyChangeKey,
  day: number,
  hardRift = false,
): number {
  const before = loyalty.value;
  loyalty.value = clampLoyalty(tables, before + loyaltyDelta(tables, backgroundId, key, hardRift));
  const delta = Math.round((loyalty.value - before) * 100) / 100;
  loyalty.recent = [...loyalty.recent, { day, reason: key, delta }].slice(-tables.loyalty.recentLogSize);
  return delta;
}

/** 충성도를 시뮬레이션하는 소속인가(데이터 simulatedAffiliations. 지금은 길드만) */
export function isLoyaltySimulated(tables: GameTables, affiliation: { kind: string; factionId?: string }): boolean {
  const key = affiliation.kind === 'guild' ? 'guild' : affiliation.kind === 'faction' ? affiliation.factionId : undefined;
  return key !== undefined && tables.loyalty.simulatedAffiliations.includes(key);
}

/** 화면 표시용 정수(구간 경계와 어긋나지 않게 내림) */
export const loyaltyDisplay = (v: number) => Math.floor(v);
