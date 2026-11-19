// 데이터 표 진입점. 수치와 목록은 JSON에 두고 코드는 이 모듈을 통해서만 읽는다.
import citiesJson from './cities.json';

export interface CityRow {
  id: string;
  name: string;
  summary: string;
}

export const cities: readonly CityRow[] = citiesJson;

export function findCity(id: string): CityRow | undefined {
  return cities.find((c) => c.id === id);
}
