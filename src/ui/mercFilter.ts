/**
 * 용병 화면의 정렬·검색·필터(지시서 012). React에 의존하지 않는 순수 함수라 테스트한다.
 * 칩 목록은 데이터(역할 표, 속성 표, ui.json)에서 만들고, 정렬 비교만 id별로 코드가 정한다.
 */
import type { GameTables } from '../data';
import { assignedFacility } from '../engine/facilities';
import { loyaltyTier } from '../engine/loyalty';
import { canLevelUp, expToNextLevel, isAvailable, isOnExpedition, recruitInfo, type GameState, type MercenaryState } from '../engine/game';

const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 음절을 초성으로 바꾼다(그 밖의 글자는 그대로). "강태산" → "ㄱㅌㅅ" */
export function choseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}

/** 이름 부분 일치 또는 초성 검색. 공백은 무시한다. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.replace(/\s+/g, '').toLowerCase();
  if (!q) return true;
  const n = name.replace(/\s+/g, '').toLowerCase();
  return n.includes(q) || choseong(n).includes(q);
}

export type MercStatus = 'available' | 'injured' | 'expedition' | 'training' | 'levelup' | 'lowLoyalty';

/** 상태 필터용: 한 용병이 해당하는 상태들(레벨업 가능은 다른 상태와 겹칠 수 있다) */
export function mercStatuses(tables: GameTables, state: GameState, m: MercenaryState): MercStatus[] {
  const out: MercStatus[] = [];
  if (isAvailable(state, m.id)) out.push('available');
  if (m.injury) out.push('injured');
  if (isOnExpedition(state, m.id)) out.push('expedition');
  if (assignedFacility(state.facilities, m.id)) out.push('training');
  if (m.loyalty && loyaltyTier(tables, m.loyalty.value).warn) out.push('lowLoyalty');
  if (canLevelUp(tables, state, m.id) || (m.level < m.growth.cap && !isOnExpedition(state, m.id) && m.exp >= expToNextLevel(tables, m.level))) out.push('levelup');
  return out;
}

export interface MercListOptions {
  tab: 'guild' | 'recruit';
  sortId: string;
  query: string;
  /** 같은 축 안에서는 하나만(없으면 null). 축 사이는 AND */
  role: string | null;
  element: string | null;
  status: string | null;
  /** 영입 탭 세력 칩 */
  faction: string | null;
  /**
   * 017b 필터 시트: 축마다 여러 개를 고른다(축 안에서는 OR, 비었으면 조건 없음).
   * 축 사이와, 위의 단일 조건(칩 줄의 상태 등)과는 AND로 결합한다.
   */
  sheet?: MercSheetFilter;
}

export interface MercSheetFilter {
  roles: string[];
  elements: string[];
  statuses: string[];
}
export const emptySheetFilter = (): MercSheetFilter => ({ roles: [], elements: [], statuses: [] });
export const sheetFilterCount = (f: MercSheetFilter | undefined) => (f ? f.roles.length + f.elements.length + f.statuses.length : 0);

/** 필터 시트 조건에 맞는가(축 안 OR, 축 사이 AND) */
export function matchesSheet(tables: GameTables, state: GameState, m: MercenaryState, f: MercSheetFilter | undefined): boolean {
  if (!f) return true;
  if (f.roles.length && !f.roles.includes(m.role)) return false;
  if (f.elements.length && !f.elements.includes(m.element)) return false;
  if (f.statuses.length) {
    const st = mercStatuses(tables, state, m);
    if (!f.statuses.some((x) => st.includes(x as MercStatus))) return false;
  }
  return true;
}

const byId = (a: MercenaryState, b: MercenaryState) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function comparator(tables: GameTables, state: GameState, sortId: string): (a: MercenaryState, b: MercenaryState) => number {
  const roleIdx = (m: MercenaryState) => tables.roles.findIndex((r) => r.id === m.role);
  const elIdx = (m: MercenaryState) => tables.elements.findIndex((e) => e.id === m.element);
  const ratio = (m: MercenaryState) => (m.level >= m.growth.cap ? -1 : m.exp / expToNextLevel(tables, m.level));
  const cost = (m: MercenaryState) => recruitInfo(tables, state, m.id).cost;
  const home = (m: MercenaryState) => (m.profile.hometown === state.baseCityId ? 0 : 1);
  switch (sortId) {
    case 'capDesc':
      return (a, b) => b.growth.cap - a.growth.cap || b.level - a.level;
    case 'levelAsc':
      return (a, b) => a.level - b.level;
    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'ko');
    case 'role':
      return (a, b) => roleIdx(a) - roleIdx(b);
    case 'element':
      return (a, b) => elIdx(a) - elIdx(b);
    case 'loyaltyAsc':
      return (a, b) => (a.loyalty?.value ?? Infinity) - (b.loyalty?.value ?? Infinity);
    case 'availableFirst':
      return (a, b) => Number(isAvailable(state, b.id)) - Number(isAvailable(state, a.id));
    case 'levelUpSoon':
      return (a, b) => ratio(b) - ratio(a);
    case 'hometownFirst':
      return (a, b) => home(a) - home(b);
    case 'costAsc':
      return (a, b) => cost(a) - cost(b);
    case 'levelDesc':
    default:
      return (a, b) => b.level - a.level;
  }
}

/** 필터(축 사이 AND)와 정렬(같으면 id 순)을 적용한다. */
export function filterAndSort(tables: GameTables, state: GameState, list: MercenaryState[], o: MercListOptions): MercenaryState[] {
  const cmp = comparator(tables, state, o.sortId);
  return list
    .filter((m) => matchesQuery(m.name, o.query))
    .filter((m) => !o.role || m.role === o.role)
    .filter((m) => !o.element || m.element === o.element)
    .filter((m) => !o.status || mercStatuses(tables, state, m).includes(o.status as MercStatus))
    .filter((m) => !o.faction || (m.affiliation.kind === 'faction' && m.affiliation.factionId === o.faction))
    .filter((m) => matchesSheet(tables, state, m, o.sheet))
    .sort((a, b) => cmp(a, b) || byId(a, b));
}

/** 칩 목록(데이터에서 만든다): 역할(사용 중인 것), 속성, 상태 */
export function filterChips(tables: GameTables) {
  return {
    roles: tables.roles.filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.name })),
    elements: tables.elements.map((e) => ({ id: e.id, name: e.name })),
    statuses: tables.ui.mercStatusFilters,
  };
}
