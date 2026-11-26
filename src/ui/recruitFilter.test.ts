// 지시서 023: 영입 화면 검색·필터·정렬·구역 나눔
import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { newGame, type GameState } from '../engine/game';
import { defaultRecruitView, emptyRecruitSheet, recruitChips, UNAFFILIATED_CHIP, matchesRecruit, recruitRows, recruitSections, type RecruitView } from './recruitFilter';

const base = (): GameState => newGame(tables, { seed: 'rec', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'm' } });
/** 총 승리 2번: m07·m17(5번 조건)은 진행 중, 관문 조건(m12·m18·m26)은 잠김 */
const played = (): GameState => ({ ...base(), records: { victories: 2, victoriesByTier: {} } });
const view = (p: Partial<RecruitView> = {}): RecruitView => ({ ...defaultRecruitView(tables), ...p, sheet: { ...emptyRecruitSheet(), ...p.sheet } });
const ids = (rows: { m: { id: string } }[]) => rows.map((r) => r.m.id);

describe('023 구역 나눔', () => {
  it('영입 가능·진행 중·잠김으로 나뉘고 상태 칩 숫자는 검색·필터 결과를 반영한다', () => {
    const rows = recruitRows(tables, played());
    const { counts, sections } = recruitSections(rows, view());
    expect(ids(sections.progress).sort()).toEqual(['m07', 'm17']);
    expect(ids(sections.locked).sort()).toEqual(['m12', 'm18', 'm26']);
    expect(counts.all).toBe(rows.length);
    expect(counts.ready + counts.progress + counts.locked).toBe(counts.all);
    for (const r of sections.progress) expect(r.ratio).toBeCloseTo(2 / 5);
  });

  it('상태 칩으로 하나를 고르면 그 구역만, 숫자는 그대로', () => {
    const rows = recruitRows(tables, played());
    const all = recruitSections(rows, view());
    const only = recruitSections(rows, view({ kind: 'progress' }));
    expect(only.counts).toEqual(all.counts);
    expect(only.sections.ready).toEqual([]);
    expect(only.sections.locked).toEqual([]);
    expect(only.sections.progress).toEqual(all.sections.progress);
  });
});

describe('023 검색과 필터', () => {
  const rows = recruitRows(tables, played());
  const find = (id: string) => rows.find((r) => r.m.id === id)!;

  it('이름 부분 일치와 초성 검색(잠김은 이름으로 걸리지 않음)', () => {
    expect(matchesRecruit(find('m05'), view({ query: '진석' }))).toBe(true);
    expect(matchesRecruit(find('m05'), view({ query: 'ㅇㅈㅅ' }))).toBe(true);
    expect(matchesRecruit(find('m05'), view({ query: '쿠로세' }))).toBe(false);
    const locked = find('m12');
    expect(locked.kind).toBe('locked');
    expect(matchesRecruit(locked, view({ query: locked.m.name }))).toBe(false);
  });

  it('역할·속성·소속 필터는 축 안 OR, 축 사이 AND이고 잠김은 빠진다', () => {
    const r = recruitSections(rows, view({ sheet: { ...emptyRecruitSheet(), roles: ['shield', 'warrior'] } }));
    const hit = [...r.sections.ready, ...r.sections.progress];
    expect(hit.length).toBeGreaterThan(0);
    for (const x of hit) expect(['shield', 'warrior']).toContain(x.m.role);
    expect(r.sections.locked).toEqual([]);
    const both = recruitSections(rows, view({ sheet: { ...emptyRecruitSheet(), roles: ['shield'], elements: ['earth'] } }));
    for (const x of both.sections.ready) expect([x.m.role, x.m.element]).toEqual(['shield', 'earth']);
    const fac = recruitSections(rows, view({ sheet: { ...emptyRecruitSheet(), factions: ['rrb'] } }));
    for (const x of [...fac.sections.ready, ...fac.sections.progress]) expect(x.m.affiliation).toEqual({ kind: 'faction', factionId: 'rrb' });
    expect(fac.sections.locked).toEqual([]);
  });

  it('도시 필터는 잠김에도 걸린다(공개 정보)', () => {
    const tokyo = recruitSections(rows, view({ sheet: { ...emptyRecruitSheet(), cities: ['tokyo'] } }));
    for (const k of ['ready', 'progress', 'locked'] as const) for (const x of tokyo.sections[k]) expect(x.m.profile.hometown).toBe('tokyo');
    expect(ids(tokyo.sections.locked).sort()).toEqual(['m12', 'm18'].filter((id) => find(id).m.profile.hometown === 'tokyo').sort());
    expect(tokyo.sections.locked.length).toBeGreaterThan(0);
  });
});

describe('023 정렬(구역 안)', () => {
  const rows = recruitRows(tables, played());
  const ready = (sort: string) => recruitSections(rows, view({ sort })).sections.ready;
  it('영입순: 진행 중은 가까운 순, 같으면 비용 낮은 순', () => {
    const s = { ...played(), records: { victories: 2, victoriesByTier: { gate: 2 } } };
    const prog = recruitSections(recruitRows(tables, s), view()).sections.progress;
    for (let i = 1; i < prog.length; i++) {
      expect(prog[i - 1].ratio >= prog[i].ratio).toBe(true);
      if (prog[i - 1].ratio === prog[i].ratio) expect(prog[i - 1].info.cost).toBeLessThanOrEqual(prog[i].info.cost);
    }
    const r = ready('recruit');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].info.cost).toBeLessThanOrEqual(r[i].info.cost);
  });
  it('비용순·레벨순·한계순', () => {
    const c = ready('costAsc');
    for (let i = 1; i < c.length; i++) expect(c[i - 1].info.cost).toBeLessThanOrEqual(c[i].info.cost);
    const l = ready('levelDesc');
    for (let i = 1; i < l.length; i++) expect(l[i - 1].m.level).toBeGreaterThanOrEqual(l[i].m.level);
    const g = ready('capDesc');
    for (let i = 1; i < g.length; i++) expect(g[i - 1].m.growth.cap).toBeGreaterThanOrEqual(g[i].m.growth.cap);
    expect(tables.ui.recruitSort.map((x) => x.id)).toEqual(['recruit', 'costAsc', 'levelDesc', 'capDesc']);
  });
});

describe('026b 세력 칩은 소속 계약자가 있는 세력만', () => {
  it('지금 로스터: 불워크만 빠지고 세력 9개, 그 뒤에 무소속 칩이 따로 있다(026c)', () => {
    expect(recruitChips(tables).factions.map((f) => f.id)).toEqual(['rrb', 'archon', 'indie', 'lantern', 'prism', 'rose', 'beacon', 'anchor', 'gray', UNAFFILIATED_CHIP]);
    expect(recruitChips(tables).factions.at(-1)!.name).toBe('무소속');
  });
  // recruitChips는 게임 상태를 받지 않는다: 영입·잠김 같은 진행 상태와 무관하게 로스터 데이터로만 정한다
  it('소속 0명인 세력은 칩에 없고, 한 명이라도 생기면 코드 수정 없이 나온다', () => {
    const roster = tables.roster.map((r, i) => (i === tables.roster.findIndex((x) => x.faction === 'rrb') ? { ...r, faction: 'bulwark' } : r));
    const withBulwark = recruitChips({ ...tables, roster }).factions.map((f) => f.id);
    expect(withBulwark).toContain('bulwark');
    const none = recruitChips({ ...tables, roster: tables.roster.map((r) => (r.faction === 'archon' ? { ...r, faction: null } : r)) }).factions.map((f) => f.id);
    expect(none).not.toContain('archon');
    // 무소속 칩은 무소속 계약자가 없어도 늘 있다
    expect(recruitChips({ ...tables, roster: tables.roster.map((r) => (r.faction === null ? { ...r, faction: 'rrb' } : r)) }).factions.at(-1)!.id).toBe(UNAFFILIATED_CHIP);
  });
});

describe('026c 무소속 필터', () => {
  it('무소속 칩을 고르면 무소속 계약자만 남는다', () => {
    const rows = recruitRows(tables, played());
    const { sections } = recruitSections(rows, view({ sheet: { ...emptyRecruitSheet(), factions: [UNAFFILIATED_CHIP] } }));
    const shown = [...sections.ready, ...sections.progress];
    expect(shown.length).toBeGreaterThan(0);
    for (const r of shown) expect(r.m.affiliation.kind).toBe('unaffiliated');
  });
});
