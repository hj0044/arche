import type { GameState } from '../engine/game';
import { validate } from './saveSchema';

/** 세이브 형식 식별자와 현재 버전. 형식이 바뀌면 버전을 올리고 MIGRATIONS에 변환을 추가한다. */
export const SAVE_FORMAT = 'arche-save';
export const SAVE_VERSION = 2;

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

/** 오류 문구에 보여 줄 문제 개수 */
const MAX_SHOWN_PROBLEMS = 3;

/**
 * version n → n+1 변환. 비어 있는 버전은 지원하지 않는다.
 * v1 → v2: 용병 30명 교체와 세력 id 변경(ironhound → waypoint)으로 호환하지 않고 폐기한다(사용자 결정).
 * 예: 1: (raw) => ({ ...raw, version: 2, state: { ...raw.state, 새필드: 기본값 } }) */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

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

/** JSON 문자열이나 객체를 검사하고, 옛 버전이면 현재 버전으로 올린다. */
export function parseSave(input: string | unknown): SaveFile {
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
  const problems = validate(obj);
  if (problems.length) {
    const shown = problems.slice(0, MAX_SHOWN_PROBLEMS).join(', ');
    const more = problems.length > MAX_SHOWN_PROBLEMS ? ` 외 ${problems.length - MAX_SHOWN_PROBLEMS}건` : '';
    throw new SaveFormatError(`세이브가 손상됐다: ${shown}${more}`, problems);
  }
  return obj as unknown as SaveFile;
}

/** 이 버전에서 불러올 수 있는 세이브인가 */
export function isLoadable(file: { version?: unknown }): boolean {
  try {
    parseSave({ ...file, format: SAVE_FORMAT });
    return true;
  } catch {
    return false;
  }
}
