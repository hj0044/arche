import type { GameState } from '../engine/game';
import facilitiesJson from '../data/facilities.json';
import loyaltyJson from '../data/loyalty.json';
import { validate } from './saveSchema';
import { validateSemantics, type SemanticTables } from './saveSemantics';

/** 세이브 형식 식별자와 현재 버전. 형식이 바뀌면 버전을 올리고 MIGRATIONS에 변환을 추가한다. */
export const SAVE_FORMAT = 'arche-save';
export const SAVE_VERSION = 5;

export type SaveKind = 'manual' | 'auto';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  kind: SaveKind;
  /** 화면에 보이는 요약 */
  summary: { guildName: string; day: number; baseCityId: string };
  state: GameState;
}

export class SaveFormatError extends Error {
  constructor(
    message: string,
    /** 스키마 검사에서 나온 필드 경로별 문제 */
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

/** 마이그레이션에서 채우는 충성도 시작값(데이터 표) */
const LOYALTY_START_V3 = loyaltyJson.start;

/** 오류 문구에 보여 줄 문제 개수 */
const MAX_SHOWN_PROBLEMS = 3;

/**
 * version n → n+1 변환. 비어 있는 버전은 지원하지 않는다.
 * v1 → v2: 용병 30명 교체와 세력 id 변경(ironhound → waypoint)으로 호환하지 않고 폐기한다(사용자 결정).
 * v2 → v3: 충성도 필드 추가. 마이그레이션으로 시작값을 채운다.
 * v3 → v4: 주인공을 뺀 모든 용병이 충성도를 갖고(길드 밖은 시작값 보관), 연속 쉰 일수를 추가한다.
 * v4 → v5: 거점 시설 상태와 리프트 흐림 오프셋을 추가한다.
 * 예: 1: (raw) => ({ ...raw, version: 2, state: { ...raw.state, 새필드: 기본값 } }) */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v2 → v3: 충성도 추가. 길드 소속 용병(주인공 제외)에 시작값 충성도를 넣는다.
  2: (raw) => {
    const state = structuredClone(raw.state) as { mercenaries?: Record<string, unknown>[] };
    for (const m of state.mercenaries ?? []) {
      const aff = m.affiliation as { kind?: string } | undefined;
      if (aff?.kind === 'guild' && !m.isProtagonist && m.loyalty === undefined) {
        m.loyalty = { value: LOYALTY_START_V3, dangerDays: 0, refusedOnDay: null, bonusDay: null, recent: [] };
      }
    }
    return { ...raw, version: 3, state };
  },
  // v3 → v4: 충성도를 모든 세력 공통 틀로. 주인공을 뺀 모든 용병에 충성도를 두고, 연속 쉰 일수를 추가한다.
  3: (raw) => {
    const state = structuredClone(raw.state) as { mercenaries?: Record<string, unknown>[] };
    for (const m of state.mercenaries ?? []) {
      if (m.isProtagonist) continue;
      const loyalty = (m.loyalty as Record<string, unknown> | undefined) ?? {
        value: LOYALTY_START_V3,
        dangerDays: 0,
        refusedOnDay: null,
        bonusDay: null,
        recent: [],
      };
      m.loyalty = { ...loyalty, restStreak: (loyalty.restStreak as number | undefined) ?? 0 };
    }
    return { ...raw, version: 4, state };
  },
  // v4 → v5: 거점 시설. 시설 레벨은 데이터의 시작 레벨(탐지소 1, 나머지 0), 건설 없음, 배치 없음.
  // 리프트(목록·파견·보고)에 흐림 오프셋 0을 넣는다(범위의 아래 끝이 실제 값).
  4: (raw) => {
    const state = structuredClone(raw.state) as Record<string, unknown> & {
      rifts?: Record<string, unknown>[];
      expeditions?: { rift?: Record<string, unknown> }[];
      reports?: { rift?: Record<string, unknown> }[];
    };
    state.facilities ??= {
      levels: Object.fromEntries(facilitiesJson.facilities.map((f) => [f.id, f.startLevel])),
      construction: null,
      assignments: {},
    };
    const addFog = (r?: Record<string, unknown>) => {
      if (r && r.fog === undefined) r.fog = { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 };
    };
    for (const r of state.rifts ?? []) addFog(r);
    for (const e of state.expeditions ?? []) addFog(e.rift);
    for (const r of state.reports ?? []) addFog(r.rift);
    return { ...raw, version: 5, state };
  },
};

export function createSaveFile(state: GameState, kind: SaveKind, now: Date = new Date()): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    kind,
    summary: { guildName: state.guildName, day: state.day, baseCityId: state.baseCityId },
    state: structuredClone(state),
  };
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify(file);
}

/**
 * JSON 문자열이나 객체를 검사하고, 옛 버전이면 현재 버전으로 올린다.
 * semantic을 주면 형식 검사 뒤에 값 범위·참조 검사(saveSemantics)까지 한다.
 */
export function parseSave(input: string | unknown, semantic?: SemanticTables): SaveFile {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new SaveFormatError('JSON이 아니다');
    }
  }
  if (!raw || typeof raw !== 'object') throw new SaveFormatError('세이브 형식이 아니다');
  let obj = raw as Record<string, unknown>;
  if (obj.format !== SAVE_FORMAT) throw new SaveFormatError('Arche 세이브 파일이 아니다');
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) throw new SaveFormatError('버전 번호가 없다');
  if (obj.version > SAVE_VERSION) throw new SaveFormatError(`더 새로운 버전(${obj.version})의 세이브다`);
  while ((obj.version as number) < SAVE_VERSION) {
    const migrate = MIGRATIONS[obj.version as number];
    if (!migrate) throw new SaveFormatError(`이전 버전(${obj.version}) 세이브는 이 버전에서 불러올 수 없다`);
    obj = migrate(obj);
  }
  let problems = validate(obj);
  // 형식이 맞을 때만 의미 검사를 한다(형식이 틀리면 의미 검사가 엉뚱한 곳에서 실패한다).
  if (!problems.length && semantic) problems = validateSemantics((obj as unknown as SaveFile).state, semantic);
  if (problems.length) {
    const shown = problems.slice(0, MAX_SHOWN_PROBLEMS).join(', ');
    const more = problems.length > MAX_SHOWN_PROBLEMS ? ` 외 ${problems.length - MAX_SHOWN_PROBLEMS}건` : '';
    throw new SaveFormatError(`세이브가 손상됐다: ${shown}${more}`, problems);
  }
  return obj as unknown as SaveFile;
}

/** 이 버전에서 불러올 수 있는 세이브인가 */
export function isLoadable(file: { version?: unknown }, semantic?: SemanticTables): boolean {
  try {
    parseSave({ ...file, format: SAVE_FORMAT }, semantic);
    return true;
  } catch {
    return false;
  }
}
