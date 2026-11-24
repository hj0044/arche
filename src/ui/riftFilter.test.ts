import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { newGame, type GameState } from '../engine/game';
import type { Rift } from '../engine/rift';
import type { RiftAutoRisk } from '../engine/status';
import { cityChips, citySummary, filterAndSortRifts, isPlayable, isUrgent, needsAllRisks, urgentRiftCount, type RiftListOptions } from './riftFilter';

const rift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  deadlineDay: 10,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 5, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  territoryFactionId: null,
  ...patch,
});

/** 탐지소 Lv3(정확한 값)으로 고정한 상태 */
const state = (rifts: Rift[], day = 5): GameState => {
  const s = newGame(tables, { seed: 'rf', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'g' } });
  return { ...s, day, rifts, facilities: { ...s.facilities, levels: { ...s.facilities.levels, scout: 3 } } };
};
const tier = (id: string) => tables.combatPower.riskTiers.find((t) => t.id === id)!;
const risk = (best: string, worst = best): RiftAutoRisk => ({ partySize: 3, estimate: { best: tier(best), worst: tier(worst), estimated: false, enemyPower: [1, 1] } });
const opts = (o: Partial<RiftListOptions> = {}): RiftListOptions => ({ cityId: 'seoul', sortId: 'deadline', tier: null, playableOnly: false, ...o });

const rifts = [
  rift('A', { deadlineDay: 9, tier: 'gate', reward: { zero: 300, arche: 30, materials: {} } }),
  rift('B', { deadlineDay: 5 }), // 오늘 마감(임박)
  rift('C', { deadlineDay: 6, tier: 'route', reward: { zero: 600, arche: 30, materials: {} } }), // D-1(임박)
  rift('D', { deadlineDay: null, stable: true, tier: 'route' }),
  rift('T', { cityId: 'tokyo', deadlineDay: 6 }),
];
const risks = new Map<string, RiftAutoRisk | null>([
  ['A', risk('crush')],
  ['B', risk('risky', 'hopeless')],
  ['C', risk('crush', 'fair')],
  ['D', null],
]);
const look = (id: string) => risks.get(id);
const ids = (rs: Rift[]) => rs.map((r) => r.id);

describe('리프트 정렬·필터', () => {
  const s = state(rifts);
  it('기본은 마감 임박순, 마감 없음은 뒤, 다른 도시는 빠진다', () => {
    expect(ids(filterAndSortRifts(tables, s, opts(), look))).toEqual(['B', 'C', 'A', 'D']);
  });
  it('위험도순: 나쁜 쪽 끝 → 좋은 쪽 끝, 인원 없음(null)은 뒤, 계산 전은 맨 뒤', () => {
    expect(ids(filterAndSortRifts(tables, s, opts({ sortId: 'risk' }), look))).toEqual(['A', 'C', 'B', 'D']);
    const partial = (id: string) => (id === 'A' ? undefined : look(id));
    expect(ids(filterAndSortRifts(tables, s, opts({ sortId: 'risk' }), partial)).at(-1)).toBe('A');
  });
  it('보상순과 등급순(높은 것 먼저, 같으면 마감순)', () => {
    expect(ids(filterAndSortRifts(tables, s, opts({ sortId: 'reward' }), look)).slice(0, 2)).toEqual(['C', 'A']);
    expect(ids(filterAndSortRifts(tables, s, opts({ sortId: 'tier' }), look))).toEqual(['C', 'D', 'A', 'B']);
  });
  it('등급 필터와 "접전 이상만"(나쁜 쪽 끝 기준)', () => {
    expect(ids(filterAndSortRifts(tables, s, opts({ tier: 'route' }), look))).toEqual(['C', 'D']);
    expect(ids(filterAndSortRifts(tables, s, opts({ playableOnly: true }), look))).toEqual(['C', 'A']);
    expect(isPlayable(tables, risk('crush', 'risky'))).toBe(false);
    expect(isPlayable(tables, risk('fair'))).toBe(true);
    expect(isPlayable(tables, null)).toBe(false);
    expect(needsAllRisks(opts({ playableOnly: true }))).toBe(true);
    expect(needsAllRisks(opts({ sortId: 'risk' }))).toBe(true);
    expect(needsAllRisks(opts())).toBe(false);
  });
  it('정렬 항목과 공략 가능 단계는 데이터(ui.json)를 따른다', () => {
    const t: GameTables = { ...tables, ui: { ...tables.ui, riftPlayableRiskTiers: ['crush'] } };
    expect(ids(filterAndSortRifts(t, s, opts({ playableOnly: true }), look))).toEqual(['A']);
    expect(tables.ui.riftSort[0].id).toBe('deadline');
  });
});

describe('도시 칩·요약·홈 한 줄', () => {
  const s = state(rifts);
  it('도시별 리프트 수와 마감 임박 수', () => {
    expect(isUrgent(tables, s.facilities, rifts[1], s.day)).toBe(true);
    expect(isUrgent(tables, s.facilities, rifts[0], s.day)).toBe(false);
    expect(cityChips(tables, s)).toEqual([
      { cityId: 'seoul', count: 4, urgent: 2 },
      { cityId: 'tokyo', count: 1, urgent: 1 },
      { cityId: 'newyork', count: 0, urgent: 0 },
    ]);
    expect(urgentRiftCount(tables, s)).toBe(3);
  });
  it('요약: 마감 임박, 공략 가능, 계산 전 여부', () => {
    expect(citySummary(tables, s, 'seoul', look)).toEqual({ urgent: 2, playable: 2, pending: false });
    expect(citySummary(tables, s, 'seoul', (id) => (id === 'D' ? undefined : look(id))).pending).toBe(true);
  });
  it('탐지소 흐림이면 보이는 마감(작은 쪽)으로 임박을 판정한다', () => {
    const fogged = { ...state([rift('F', { deadlineDay: 8, fog: { deadlineOffset: 2, levelOffset: 0, countOffset: 0, rewardU: 0 } })]) };
    const lv1 = { ...fogged, facilities: { ...fogged.facilities, levels: { ...fogged.facilities.levels, scout: 1 } } };
    // 실제 D-3, 보이는 범위 D-1~3 → 임박
    expect(isUrgent(tables, lv1.facilities, lv1.rifts[0], 5)).toBe(true);
    expect(isUrgent(tables, fogged.facilities, fogged.rifts[0], 5)).toBe(false);
  });
});
