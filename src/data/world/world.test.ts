import { describe, expect, it } from 'vitest';
import currentCities from '../cities.json';
import riftTiers from '../rift-tiers.json';
import cities from './cities.json';
import influence from './influence.json';
import travel from './travel.json';

const cityIds = [
  'seoul', 'tokyo', 'newyork', 'london', 'lagos', 'saopaulo', 'mumbai', 'dubai', 'sydney',
];
const factionIds = [
  'rrb', 'archon', 'bulwark', 'indie', 'lantern', 'prism', 'rose', 'beacon', 'anchor', 'gray',
];
const tierIds = riftTiers.map(({ id }) => id);
const koreanText = /^[가-힣 .,!·?]+$/u;
const forbiddenText = /죽|사망|전사|흑막|공허|징조|아르케의 포식자/u;

function expectBetween(value: number, min: number, max: number, label: string) {
  expect(value, label).toBeGreaterThanOrEqual(min);
  expect(value, label).toBeLessThanOrEqual(max);
}

function expectKorean(text: string) {
  expect(text).toBe(text.trim());
  expect(text).toMatch(koreanText);
  expect(text).not.toMatch(forbiddenText);
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('/');
}

describe('확장 도시', () => {
  it('지정된 순서로 도시 아홉 곳을 담는다', () => {
    expect(cities.map(({ id }) => id)).toEqual(cityIds);
  });

  it('기존 도시에 설정과 개방자 비율만 덧붙인다', () => {
    const originalFields = cities.slice(0, 3).map(({ lore, openerRate, ...fields }) => fields);
    expect(originalFields).toEqual(currentCities);
    expect(cities.slice(0, 3).map(({ openerRate }) => openerRate)).toEqual([1, 0.8, 1.2]);
  });

  it.each(cities)('$name 도시의 생성 범위와 표기 형식이 맞다', (city) => {
    const { riftSpawn, recruitment, openerRate, name, summary, lore } = city;
    expect(name).toMatch(/^[가-힣]+$/u);
    expectKorean(summary);
    expect(summary.length).toBeLessThanOrEqual(40);
    expectKorean(lore);
    expectBetween(lore.match(/[.!?]/gu)?.length ?? 0, 2, 3, '도시 설정 문장 수');
    expectBetween(openerRate, 0.5, 2, '개방자 비율');
    expectBetween(recruitment.otherHometownCostMultiplier, 1, 1.5, '타향 영입 배율');

    expect(Number.isInteger(riftSpawn.maxActive)).toBe(true);
    expectBetween(riftSpawn.maxActive, 5, 9, '활성 리프트 한도');
    expectBetween(riftSpawn.dailySpawnChance, 0.35, 0.75, '일일 생성 확률');
    expect(Number.isInteger(riftSpawn.dailySpawnRolls)).toBe(true);
    expectBetween(riftSpawn.dailySpawnRolls, 1, 3, '일일 생성 시도 수');
    expectBetween(riftSpawn.levelSkew, 1.5, 3, '레벨 가중치');
    expect(Number.isInteger(riftSpawn.initialCount)).toBe(true);
    expectBetween(riftSpawn.initialCount, riftSpawn.initialGuaranteed.length, riftSpawn.maxActive, '시작 리프트 수');

    for (const { tier, grade } of riftSpawn.initialGuaranteed) {
      const validGrades = riftTiers.find(({ id }) => id === tier)?.monsterGrades ?? [];
      expect(validGrades, tier).toContain(grade);
    }

    expect(Object.keys(riftSpawn.tierWeights).sort()).toEqual([...tierIds].sort());
    const weights = Object.values(riftSpawn.tierWeights);
    for (const weight of weights) {
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(0);
    }
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeGreaterThan(0);
    expectBetween(riftSpawn.tierWeights.route, 0, 2, '항로 가중치');
  });
});

describe('도시 간 왕복 이동', () => {
  it('서로 다른 도시의 모든 쌍을 왕복 기준으로 한 번씩 담는다', () => {
    const expectedPairs = cityIds.flatMap((city, index) =>
      cityIds.slice(index + 1).map((other) => pairKey(city, other)),
    );
    expect(travel.unit).toBe('roundTrip');
    expect(travel.sameCityDays).toBe(0);
    expect(travel.defaultDays).toBeOneOf([0, 1]);
    expect(travel.routes).toHaveLength(36);

    for (const { between, days } of travel.routes) {
      expect(between).toHaveLength(2);
      expect(days).toBeOneOf([0, 1]);
    }
    const pairs = travel.routes.map(({ between: [a, b] }) => pairKey(a, b));
    expect(pairs.sort()).toEqual(expectedPairs.sort());
  });

  it('기존 세 노선의 숫자를 유지하고 하루 노선은 열두 쌍 이하로 둔다', () => {
    const daysByPair = new Map(travel.routes.map(({ between: [a, b], days }) => [pairKey(a, b), days]));
    expect(daysByPair.get(pairKey('seoul', 'tokyo'))).toBe(0);
    expect(daysByPair.get(pairKey('seoul', 'newyork'))).toBe(1);
    expect(daysByPair.get(pairKey('tokyo', 'newyork'))).toBe(1);
    expect(travel.routes.filter(({ days }) => days === 1).length).toBeLessThanOrEqual(12);
  });

  it('왕복 이동의 세계관 설명은 제안으로 표시한다', () => {
    const sentences = travel.rationale.split(/(?<=[.!?]) /u);
    expectBetween(sentences.length, 2, 3, '이동 설정 문장 수');
    for (const sentence of sentences) {
      expect(sentence.startsWith('[제안] ')).toBe(true);
      expect(sentence).toMatch(/[.!?]$/u);
      expectKorean(sentence.slice('[제안] '.length));
    }
  });
});

describe('세계관 세력 영향력', () => {
  it('세력 열 곳과 도시 아홉 곳의 가중치가 맞다', () => {
    expect(Object.keys(influence).sort()).toEqual([...factionIds].sort());
    for (const [faction, cities] of Object.entries(influence)) {
      expect(Object.keys(cities).sort(), faction).toEqual([...cityIds].sort());
      const weights = Object.values(cities);
      for (const weight of weights) {
        expect(weight, faction).toBeGreaterThanOrEqual(0.02);
      }
      const sum = weights.reduce((total, weight) => total + weight, 0);
      expect(Math.abs(sum - 1), faction).toBeLessThanOrEqual(0.001);
    }
  });
});
