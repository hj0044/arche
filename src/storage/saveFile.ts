import type { GameState } from '../engine/game';
import { validate } from './saveSchema';
import { validateSemantics, type SemanticTables } from './saveSemantics';

/**
 * 세이브 형식 식별자와 현재 버전. 형식이 바뀌면 버전만 올린다.
 * 개발 초기라 옛 버전 세이브는 지원하지 않는다(AGENTS.md 세이브 규칙): 마이그레이션 없이 "지원하지 않는 세이브"로 거절한다.
 * v6: 리프트 영역 세력(territoryFactionId, 지시서 013).
 * v7: 리프트 등급 변형(variant, 지시서 015).
 * v8: 스탯 세분화·특성(지시서 016). 계약자 특성 단계(traitRanks).
 * v9: 스킬 구조(기본 공격 + 액티브 3)·자객·기만자·계약자 36명(지시서 020). 전투 안의 상태 효과는 저장하지 않는다.
 * v10: 성장 속도 삭제(growth.speed 없음)·계약자별 성장률(지시서 021).
 * v11: 주인공 캐릭터·개방자 모드 폐지(protagonist는 이름·배경만), 외곽 임무·자동 배치 설정(지시서 022). v10은 불러오지 않는다(마이그레이션 없음).
 * v15: 세력 10개(웨이포인트·무소속 행 삭제, 랜턴·프리즘·장미·비컨·앵커·그레이 추가, indie는 '에지 서클'), 무소속은 세력이 아닌 상태(affiliation.kind 'unaffiliated'), NPC 팀 세력은 id 또는 null(지시서 026c). v14는 불러오지 않는다(마이그레이션 없음).
 * v14: 리그 세계(league: NPC 용병단 39팀·명단·시즌 곡선 파라미터·간이 정산·최근 5시즌 이력, 지시서 028a). v13은 불러오지 않는다(마이그레이션 없음).
 * v13: 계약자 활약도 기록(activity: 시즌·통산 합계, 지난 시즌, 최근 공략, 지시서 027). v12는 불러오지 않는다(마이그레이션 없음).
 * v12: 세력 정리(지시서 026). 옛 소수 용병단 세력 삭제(소속 계약자는 indie), 불워크 시스템즈 추가, 무소속 스카우트 이동 폐지. v11은 불러오지 않는다(마이그레이션 없음).
 */
export const SAVE_FORMAT = 'arche-save';
export const SAVE_VERSION = 15;

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
 * JSON 문자열이나 객체를 검사한다. 현재 버전이 아니면 거절한다(옛 버전은 지원하지 않음).
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
  const obj = raw as Record<string, unknown>;
  if (obj.format !== SAVE_FORMAT) throw new SaveFormatError('Arche 세이브 파일이 아니다');
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) throw new SaveFormatError('버전 번호가 없다');
  if (obj.version > SAVE_VERSION) throw new SaveFormatError(`더 새로운 버전(${obj.version})의 세이브다`);
  if (obj.version < SAVE_VERSION) throw new SaveFormatError(`지원하지 않는 세이브다(이전 버전 v${obj.version}). 개발 중에는 옛 세이브를 불러올 수 없다`);
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
