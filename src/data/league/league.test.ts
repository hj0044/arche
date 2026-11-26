import { describe, expect, it } from 'vitest';
import backgrounds from '../backgrounds.json';
import elements from '../elements.json';
import cultures from '../names/cultures.json';
import roles from '../roles.json';
import roster from '../roster.json';
import featured from './featured.json';
import teams from './teams.json';

const factions = ['rrb', 'archon', 'bulwark', 'waypoint', 'indie', 'free'];
const cities = [
  'seoul', 'tokyo', 'newyork', 'london', 'lagos', 'saopaulo', 'mumbai', 'dubai', 'sydney',
];
const tiers = [1, 2, 3, 4, 5];
const hints = ['top', 'upper', 'mid', 'lower', 'any'];
const civilHints = ['mid', 'lower', 'any'];
const namedTeams = teams.filter(({ kind }) => kind === 'named');
const civilTeams = teams.filter(({ kind }) => kind === 'civil');
const teamNames = teams.map(({ name }) => name.replaceAll(' ', ''));
const cultureIds = cultures.map(({ id }) => id);
const roleIds = roles.map(({ id }) => id);
const elementIds = elements.map(({ id }) => id);
const backgroundIds = backgrounds.map(({ id }) => id);
const rosterNames = roster.map(({ name }) => name.replaceAll(' ', ''));
const teamIdPattern = /^[a-z]+(?:-[a-z]+)*$/u;
const hangulNamePattern = /^[가-힣]+(?: [가-힣]+)*$/u;
const forbiddenLore = /사망|전사|죽|아르케의 포식자|공허|흑막|징조/u;

function expectText(text: string, maxLength: number) {
  expect(text.trim()).not.toBe('');
  expect(text).not.toMatch(/[A-Za-z\r\n]/u);
  expect(text.length).toBeLessThanOrEqual(maxLength);
}

function sizeDistribution(entries: { sizeTier: number }[]) {
  return tiers.map((tier) => entries.filter(({ sizeTier }) => sizeTier === tier).length);
}

describe('리그 용병단', () => {
  it('설정 용병단 14곳과 민간 용병단 25곳의 식별자와 이름이 고유하다', () => {
    expect(teams).toHaveLength(39);
    expect(namedTeams).toHaveLength(14);
    expect(civilTeams).toHaveLength(25);
    expect(new Set(teams.map(({ id }) => id)).size).toBe(teams.length);
    expect(new Set(teamNames).size).toBe(teams.length);
  });

  it('전체 및 민간 용병단의 규모 분포가 맞다', () => {
    expect(sizeDistribution(teams)).toEqual([6, 11, 11, 8, 3]);
    expect(sizeDistribution(civilTeams)).toEqual([4, 6, 10, 4, 1]);
  });

  it('민간 용병단의 소속과 도시 분포가 맞다', () => {
    expect(civilTeams.filter(({ faction }) => faction === 'waypoint')).toHaveLength(8);
    expect(civilTeams.filter(({ faction }) => faction === 'free')).toHaveLength(17);
    for (const city of cities) {
      const count = civilTeams.filter(({ homeCity }) => homeCity === city).length;
      expect(count, city).toBeOneOf([2, 3]);
    }
  });

  it.each(teams)('$name 용병단의 분류와 문구가 형식에 맞다', (team) => {
    expect(team.id).toMatch(teamIdPattern);
    expect(team.name).toMatch(hangulNamePattern);
    expect(team.name.replaceAll(' ', '').length).toBeGreaterThanOrEqual(2);
    expectText(team.name, 10);
    expect(team.faction).toBeOneOf(factions);
    expect(team.sizeTier).toBeOneOf(tiers);
    expect(team.leagueHint).toBeOneOf(team.kind === 'civil' ? civilHints : hints);
    expect(team.homeCity).toBeOneOf([...cities, null]);

    if (team.id === 'observation-unit') {
      // 이름과 컨셉을 그대로 쓰라는 지시서 표의 유일한 영문 표기를 보존한다.
      expect(team.concept).toBe('정보·AI 업종 메가코프 계열, 정찰·분석·감시');
      expectText(team.concept.replace('AI', ''), 30);
      expect(team.concept.length).toBeLessThanOrEqual(30);
    } else {
      expectText(team.concept, 30);
    }
    expectText(team.intro, 100);
    expect(team.intro).not.toMatch(forbiddenLore);
  });
});

describe('대표 인물', () => {
  it('인물 수가 범위 안이고 식별자와 이름이 고유하다', () => {
    expect(featured.length).toBeGreaterThanOrEqual(30);
    expect(featured.length).toBeLessThanOrEqual(40);
    expect(new Set(featured.map(({ id }) => id)).size).toBe(featured.length);
    expect(new Set(featured.map(({ name }) => name.replaceAll(' ', ''))).size).toBe(featured.length);
  });

  it('모든 속성에 대표 인물이 네 명에서 일곱 명 있다', () => {
    for (const element of elementIds) {
      const count = featured.filter((person) => person.element === element).length;
      expect(count, element).toBeGreaterThanOrEqual(4);
      expect(count, element).toBeLessThanOrEqual(7);
    }
  });

  it('모든 고향 도시에 대표 인물이 두 명에서 여섯 명 있다', () => {
    for (const city of cities) {
      const count = featured.filter(({ hometown }) => hometown === city).length;
      expect(count, city).toBeGreaterThanOrEqual(2);
      expect(count, city).toBeLessThanOrEqual(6);
    }
  });

  it.each(namedTeams)('$name 팀에 역할이 겹치지 않는 대표 인물 두세 명이 있다', ({ id }) => {
    const members = featured.filter(({ teamId }) => teamId === id);
    expect(members.length).toBeOneOf([2, 3]);
    expect(new Set(members.map(({ role }) => role)).size).toBe(members.length);
    for (const element of elementIds) {
      expect(members.filter((member) => member.element === element).length).toBeLessThan(3);
    }
  });

  it.each(featured)('$name 인물의 참조와 문구가 형식에 맞다', (person) => {
    expect(namedTeams.map(({ id }) => id)).toContain(person.teamId);
    expect(person.id).toMatch(new RegExp(`^${person.teamId}-[0-9]{2}$`, 'u'));
    expect(person.name).toMatch(hangulNamePattern);
    expect(rosterNames).not.toContain(person.name.replaceAll(' ', ''));
    expect(person.cultureId).toBeOneOf(cultureIds);
    expect(person.gender).toBeOneOf(['m', 'f', 'n']);
    expect(Number.isInteger(person.age)).toBe(true);
    expect(person.age).toBeGreaterThanOrEqual(20);
    expect(person.age).toBeLessThanOrEqual(55);
    expect(person.role).toBeOneOf(roleIds);
    expect(person.element).toBeOneOf(elementIds);
    expect(person.hometown).toBeOneOf(cities);
    expect(person.background).toBeOneOf(backgroundIds);
    expectText(person.post, 12);
    expectText(person.oneLine, 60);
    expectText(person.voice, 30);
    expect([person.post, person.oneLine, person.voice].join(' ')).not.toMatch(forbiddenLore);
  });
});
