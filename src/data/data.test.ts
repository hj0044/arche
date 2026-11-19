import { describe, expect, it } from 'vitest';
import { cities, findCity } from './index';

describe('도시 데이터 표', () => {
  it('1단계 도시는 2~3곳이고 id가 겹치지 않는다', () => {
    expect(cities.length).toBeGreaterThanOrEqual(2);
    expect(cities.length).toBeLessThanOrEqual(3);
    expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
  });

  it('id로 도시를 찾는다', () => {
    expect(findCity('seoul')?.name).toBe('서울');
    expect(findCity('nowhere')).toBeUndefined();
  });
});
