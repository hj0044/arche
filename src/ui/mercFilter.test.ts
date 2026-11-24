import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { assignToFacility, newGame, type GameState } from '../engine/game';
import { choseong, emptySheetFilter, filterAndSort, filterChips, matchesQuery, mercStatuses, sheetFilterCount, type MercListOptions } from './mercFilter';

const s0 = (): GameState => {
  const s = newGame(tables, { seed: 'flt', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
  return { ...s, mercenaries: s.mercenaries.map((m) => (['m05', 'm06', 'm07', 'm10'].includes(m.id) ? { ...m, affiliation: { kind: 'guild' as const } } : m)) };
};
const guild = (s: GameState) => s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
const opts = (o: Partial<MercListOptions> = {}): MercListOptions => ({ tab: 'guild', sortId: 'levelDesc', query: '', role: null, element: null, status: null, faction: null, ...o });

describe('검색', () => {
  it('초성 변환과 초성 검색', () => {
    expect(choseong('강태산')).toBe('ㄱㅌㅅ');
    expect(choseong('쿠로세 렌')).toBe('ㅋㄹㅅ ㄹ');
    expect(matchesQuery('강태산', 'ㄱㅌㅅ')).toBe(true);
    expect(matchesQuery('강태산', 'ㄱㅌ')).toBe(true);
    expect(matchesQuery('강태산', 'ㅎㅌ')).toBe(false);
  });
  it('이름 부분 일치(공백 무시)', () => {
    expect(matchesQuery('쿠로세 렌', '세렌')).toBe(true);
    expect(matchesQuery('쿠로세 렌', '로세')).toBe(true);
    expect(matchesQuery('쿠로세 렌', '마야')).toBe(false);
    expect(matchesQuery('아무개', '')).toBe(true);
  });
});

describe('정렬과 필터', () => {
  it('정렬이 같으면 id 순으로 흔들리지 않는다', () => {
    const s = s0();
    const sameLv = guild(s).map((m) => ({ ...m, level: 5 }));
    const out = filterAndSort(tables, s, sameLv, opts()).map((m) => m.id);
    expect(out).toEqual([...out].sort());
    const byLevel = filterAndSort(tables, s, guild(s), opts()).map((m) => m.level);
    expect(byLevel).toEqual([...byLevel].sort((a, b) => b - a));
  });

  it('필터는 축 사이 AND', () => {
    const s = s0();
    const shields = filterAndSort(tables, s, guild(s), opts({ role: 'shield' }));
    expect(shields.length).toBeGreaterThan(0);
    expect(shields.every((m) => m.role === 'shield')).toBe(true);
    const both = filterAndSort(tables, s, guild(s), opts({ role: 'shield', element: 'frost' }));
    expect(both.every((m) => m.role === 'shield' && m.element === 'frost')).toBe(true);
    expect(both.length).toBeLessThan(shields.length + 1);
    expect(filterAndSort(tables, s, guild(s), opts({ role: 'shield', element: 'void' }))).toEqual([]);
  });

  it('상태 필터(훈련 중, 부상, 출전 가능)', () => {
    let s = s0();
    s = { ...s, facilities: { ...s.facilities, levels: { ...s.facilities.levels, training: 1 } } };
    s = assignToFacility(tables, s, 'training', 'm02');
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 5 } } : m)) };
    expect(filterAndSort(tables, s, guild(s), opts({ status: 'training' })).map((m) => m.id)).toEqual(['m02']);
    expect(filterAndSort(tables, s, guild(s), opts({ status: 'injured' })).map((m) => m.id)).toEqual(['m03']);
    expect(mercStatuses(tables, s, s.mercenaries.find((m) => m.id === 'm01')!)).toContain('available');
  });

  it('새 역할·속성 행을 가진 합성 데이터에서 칩이 자동으로 생긴다', () => {
    const t: GameTables = {
      ...tables,
      roles: [...tables.roles, { id: 'bard', name: '음유시인', group: 'support', defaultRow: 'back', enabled: true, skills: [] }],
      elements: [...tables.elements, { id: 'time', name: '시간', loreName: '시류', strongAgainst: [] }],
    };
    const c = filterChips(t);
    expect(c.roles.map((r) => r.name)).toContain('음유시인');
    expect(c.elements.map((e) => e.name)).toContain('시간');
    expect(c.roles.map((r) => r.id)).not.toContain('assassin'); // 비활성 역할은 칩 없음
    expect(c.statuses.length).toBe(tables.ui.mercStatusFilters.length);
  });
});

describe('017b 필터 시트(역할·속성·상태 여러 개)', () => {
  it('축 안에서는 OR, 축 사이는 AND, 칩 줄 상태와도 AND', () => {
    let s = s0();
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 5 } } : m)) };
    const all = guild(s);
    const roles = [...new Set(all.map((m) => m.role))].slice(0, 2);
    const or = filterAndSort(tables, s, all, opts({ sheet: { ...emptySheetFilter(), roles } }));
    expect(or.length).toBe(all.filter((m) => roles.includes(m.role)).length);
    const el = or[0].element;
    const and = filterAndSort(tables, s, all, opts({ sheet: { ...emptySheetFilter(), roles, elements: [el] } }));
    expect(and.every((m) => roles.includes(m.role) && m.element === el)).toBe(true);
    // 상태 OR: 부상 또는 출전 가능 = 전원(이 상태에서는 파견·훈련 없음)
    expect(filterAndSort(tables, s, all, opts({ sheet: { ...emptySheetFilter(), statuses: ['injured', 'available'] } })).length).toBe(all.length);
    // 칩 줄의 '대기'(available)와 시트의 '부상'은 AND라 아무도 없다
    expect(filterAndSort(tables, s, all, opts({ status: 'available', sheet: { ...emptySheetFilter(), statuses: ['injured'] } }))).toEqual([]);
    expect(filterAndSort(tables, s, all, opts({ sheet: { ...emptySheetFilter(), statuses: ['injured'] } })).map((m) => m.id)).toEqual(['m03']);
  });
  it('빈 시트는 조건이 없고, 고른 개수를 센다', () => {
    const s = s0();
    expect(filterAndSort(tables, s, guild(s), opts({ sheet: emptySheetFilter() })).length).toBe(guild(s).length);
    expect(sheetFilterCount({ roles: ['shield'], elements: ['fire', 'frost'], statuses: [] })).toBe(3);
  });
});
