/**
 * 영입 화면의 검색·필터·정렬·구역 나눔(지시서 023). React에 의존하지 않는 순수 함수라 단위 테스트한다(riftFilter 방식).
 * 엔진(recruitInfo, 영입 규칙·비용·해금)은 그대로 쓰고 바꾸지 않는다.
 * 잠김 계약자는 정체를 모르므로 이름 검색과 역할·속성·소속 필터에 걸리지 않고, 도시(공개 정보)로만 걸린다.
 */
import type { GameTables } from '../data';
import { recruitInfo, type GameState, type MercenaryState, type RecruitInfo } from '../engine/game';
import { matchesQuery } from './mercFilter';

export type RecruitKind = 'ready' | 'progress' | 'locked';
export const RECRUIT_KINDS: RecruitKind[] = ['ready', 'progress', 'locked'];

export interface RecruitSheetFilter {
  roles: string[];
  elements: string[];
  cities: string[];
  factions: string[];
}
export const emptyRecruitSheet = (): RecruitSheetFilter => ({ roles: [], elements: [], cities: [], factions: [] });
export const recruitSheetCount = (f: RecruitSheetFilter) => f.roles.length + f.elements.length + f.cities.length + f.factions.length;

/** 화면 상태 한 묶음(탭을 바꿔도 유지, 세이브에는 넣지 않는다) */
export interface RecruitView {
  query: string;
  /** ui.json recruitSort id */
  sort: string;
  /** 상태 칩: null이면 전체 */
  kind: RecruitKind | null;
  sheet: RecruitSheetFilter;
}
export const defaultRecruitView = (tables: GameTables): RecruitView => ({ query: '', sort: tables.ui.recruitSort[0].id, kind: null, sheet: emptyRecruitSheet() });

export interface RecruitRow {
  m: MercenaryState;
  info: RecruitInfo;
  kind: RecruitKind;
  /** 조건 진행률 0~1(영입 가능은 1, 잠김은 0) */
  ratio: number;
}

/** 영입 후보(세력 소속으로 영입 대상인 계약자)와 상태. 진행 중 = 해금 조건이 1 이상 진행된 것 */
export function recruitRows(tables: GameTables, state: GameState): RecruitRow[] {
  return state.mercenaries
    .map((m) => ({ m, info: recruitInfo(tables, state, m.id) }))
    .filter((x) => x.info.eligible)
    .map(({ m, info }) => {
      const p = info.progress;
      const kind: RecruitKind = info.unlocked ? 'ready' : (p?.current ?? 0) > 0 ? 'progress' : 'locked';
      const ratio = info.unlocked ? 1 : kind === 'progress' && p ? p.current / p.required : 0;
      return { m, info, kind, ratio };
    });
}

/** 검색·필터 시트에 맞는가. 잠김은 이름·역할·속성·소속 조건이 있으면 빠지고 도시로만 걸린다 */
export function matchesRecruit(row: RecruitRow, view: Pick<RecruitView, 'query' | 'sheet'>): boolean {
  const f = view.sheet;
  const city = row.m.profile.hometown ?? '';
  if (f.cities.length && !f.cities.includes(city)) return false;
  const hidden = row.kind === 'locked';
  if (view.query.trim()) {
    if (hidden || !matchesQuery(row.m.name, view.query)) return false;
  }
  if (f.roles.length && (hidden || !f.roles.includes(row.m.role))) return false;
  if (f.elements.length && (hidden || !f.elements.includes(row.m.element))) return false;
  const aff = row.m.affiliation;
  const faction = aff.kind === 'faction' ? aff.factionId : aff.kind === 'unaffiliated' ? UNAFFILIATED_CHIP : '';
  if (f.factions.length && (hidden || !f.factions.includes(faction))) return false;
  return true;
}

const byId = (a: RecruitRow, b: RecruitRow) => (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0);

/** 구역 안 정렬. 영입순: 진행 중은 가까운(진행률 높은) 순, 같으면 비용 낮은 순 */
export function recruitComparator(sortId: string): (a: RecruitRow, b: RecruitRow) => number {
  switch (sortId) {
    case 'costAsc':
      return (a, b) => a.info.cost - b.info.cost || byId(a, b);
    case 'levelDesc':
      return (a, b) => b.m.level - a.m.level || byId(a, b);
    case 'capDesc':
      return (a, b) => b.m.growth.cap - a.m.growth.cap || byId(a, b);
    default:
      return (a, b) => b.ratio - a.ratio || a.info.cost - b.info.cost || byId(a, b);
  }
}

export interface RecruitSections {
  /** 상태 칩 숫자(검색·필터 반영, 상태 칩 선택 전) */
  counts: Record<RecruitKind, number> & { all: number };
  /** 상태 칩까지 반영한 구역별 목록(비면 구역을 숨긴다) */
  sections: Record<RecruitKind, RecruitRow[]>;
}

export function recruitSections(rows: RecruitRow[], view: RecruitView): RecruitSections {
  const hit = rows.filter((r) => matchesRecruit(r, view));
  const cmp = recruitComparator(view.sort);
  const of = (k: RecruitKind) => hit.filter((r) => r.kind === k).sort(cmp);
  const sections = { ready: of('ready'), progress: of('progress'), locked: of('locked') };
  const counts = { all: hit.length, ready: sections.ready.length, progress: sections.progress.length, locked: sections.locked.length };
  if (view.kind) for (const k of RECRUIT_KINDS) if (k !== view.kind) sections[k] = [];
  return { counts, sections };
}

/** 소속 필터의 '무소속' 칩 id. 무소속은 세력이 아니라 상태다(지시서 026c) */
export const UNAFFILIATED_CHIP = 'unaffiliated';

/** 필터 시트 칩: 역할·속성은 표에서, 도시는 도시 표, 소속은 세력 표 중 로스터에 소속 계약자가 한 명 이상 있는 세력(지시서 026b)
 * 뒤에 '무소속' 칩을 늘 따로 둔다(지시서 026c, 소속 계약자 규칙은 세력 칩에만).
 * 진행 상태(영입·잠김)와 무관하게 로스터 데이터 기준이라 칩이 생기거나 사라지지 않는다. */
export function recruitChips(tables: GameTables) {
  return {
    roles: tables.roles.filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.name })),
    elements: tables.elements.map((e) => ({ id: e.id, name: e.name })),
    cities: tables.cities.map((c) => ({ id: c.id, name: c.name })),
    factions: [
      ...tables.factions.filter((f) => tables.roster.some((r) => r.faction === f.id)).map((f) => ({ id: f.id, name: f.name })),
      { id: UNAFFILIATED_CHIP, name: '무소속' },
    ],
  };
}

/** 해금 조건 한 줄(시안: '관문 공략 1/2') */
export function unlockLabel(tables: GameTables, info: RecruitInfo): string {
  if (!info.unlock) return '조건 없음';
  const what = info.unlock.type === 'totalVictories' ? '리프트 공략' : `${tables.riftTiers.find((t) => t.id === (info.unlock as { tier: string }).tier)?.name ?? ''} 공략`;
  return `${what} ${info.progress?.current ?? 0}/${info.progress?.required ?? 0}`;
}
