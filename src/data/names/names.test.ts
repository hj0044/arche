import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cultures from './cultures.json';

type Surname = { text: string; tones: string[] };
type GivenName = Surname & { gender: string };
type NamePool = { id: string; surnames: Surname[]; names: GivenName[] };

const directory = new URL('./', import.meta.url);
const poolFiles = readdirSync(directory)
  .filter((file) => file.endsWith('.json') && file !== 'cultures.json');
const continents = [
  'east_asia', 'southeast_asia', 'south_asia', 'central_asia',
  'west_asia_north_africa', 'europe', 'sub_saharan_africa', 'americas', 'oceania',
];
const tones = ['modern', 'noble', 'rugged', 'gentle'];
const namePattern = /^[가-힣]{1,8}$/u;
const displayTextPattern = /^[가-힣\p{Punctuation} ]+$/u;
const excludedEntries = new Set([
  '똥', '보지치', '후세인', '알리예프', '무가베', '말고자타',
  '벤알리', '부메디엔', '에스코바르', '카스트로',
]);
const previouslyOverrepresentedNames = [
  '알렉스', '다니', '사라', '루카스', '샘', '아리', '로빈', '사샤', '미카', '카이', '누르',
  '크리스', '클라라', '노아', '니키', '파라', '빅토르', '소피아', '나심', '아리엘', '엘리',
];

function readNamePool(id: string): NamePool {
  return JSON.parse(readFileSync(new URL(`${id}.json`, directory), 'utf8'));
}

function validateEntries(entries: Surname[]) {
  expect(new Set(entries.map(({ text }) => text)).size).toBe(entries.length);
  expect(entries.filter(({ text }) => excludedEntries.has(text))).toEqual([]);
  for (const { text, tones: entryTones } of entries) {
    expect(text).toMatch(namePattern);
    expect(entryTones, text).toHaveLength(new Set(entryTones).size);
    expect(entryTones.length, text).toBeGreaterThanOrEqual(1);
    expect(entryTones.length, text).toBeLessThanOrEqual(2);
    for (const tone of entryTones) expect(tones, text).toContain(tone);
  }
}

describe('문화권 이름 풀', () => {
  it('문화권은 정확히 서른 곳이다', () => {
    expect(cultures).toHaveLength(30);
  });

  it('문화권 행과 이름 풀 파일은 일대일로 대응한다', () => {
    const ids = cultures.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(poolFiles.sort()).toEqual(ids.map((id) => `${id}.json`).sort());
  });

  it('기존 과다 중복 이름은 최대 세 문화권, 나머지는 최대 네 문화권에만 있다', () => {
    const counts = new Map<string, number>();
    for (const { id } of cultures) {
      const names = new Set(readNamePool(id).names.map(({ text }) => text));
      for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect([...counts].filter(([, count]) => count > 4)).toEqual([]);
    for (const name of previouslyOverrepresentedNames) {
      expect(counts.get(name) ?? 0, name).toBeLessThanOrEqual(3);
    }
  });

  it.each(cultures)('$name 메타데이터 형식이 맞다', (culture) => {
    const { id, name, continent, population, order, surnameCount } = culture;
    expect(id).toMatch(/^[a-z]+(?:_[a-z]+)*$/u);
    expect(name).toMatch(displayTextPattern);
    expect(continent).toBeOneOf(continents);
    expect(Number.isFinite(population)).toBe(true);
    expect(population).toBeGreaterThan(0);
    expect(order).toBeOneOf(['family_first', 'given_first']);
    const usesTwoSurnames = ['iberia', 'brazil', 'latin_spanish'].includes(id);
    expect(surnameCount).toEqual([1, usesTwoSurnames ? 2 : 1]);
    expect(Object.keys(culture).sort()).toEqual([
      'continent', 'id', 'name', ...('note' in culture ? ['note'] : []),
      'order', 'population', 'surnameCount',
    ]);
    if ('note' in culture) expect(culture.note).toMatch(displayTextPattern);
  });

  it.each(cultures)('$name 이름 풀의 수량, 중복, 표기, 분류가 맞다', ({ id }) => {
    const pool = readNamePool(id);
    expect(Object.keys(pool).sort()).toEqual(['id', 'names', 'surnames']);
    expect(pool.id).toBe(id);
    expect(pool.surnames).toHaveLength(60);
    expect(pool.names).toHaveLength(100);
    validateEntries(pool.surnames);
    validateEntries(pool.names);

    for (const surname of pool.surnames) {
      expect(Object.keys(surname).sort()).toEqual(['text', 'tones']);
    }
    for (const name of pool.names) {
      expect(Object.keys(name).sort()).toEqual(['gender', 'text', 'tones']);
    }
    for (const [gender, count] of [['m', 40], ['f', 40], ['n', 20]] as const) {
      expect(pool.names.filter((name) => name.gender === gender)).toHaveLength(count);
    }
    for (const tone of ['noble', 'rugged', 'gentle']) {
      const count = pool.names.filter((name) => name.tones.includes(tone)).length;
      expect(count, tone).toBeGreaterThanOrEqual(5);
    }
  });
});
