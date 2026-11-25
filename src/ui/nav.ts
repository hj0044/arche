import type { DayEvent, GameState } from '../engine/game';

export type Route =
  | { name: 'title' }
  | { name: 'newGame' }
  | { name: 'home' }
  /** 콘텐츠 화면. sub: 서브 탭(리프트·탑·보스·영입, 지시서 017) */
  | { name: 'rifts'; cityId?: string; sub?: ContentTab; /** 개발 픽스처(시안 RecruitSheet): 첫 영입 가능 카드의 시트를 열어 둔다 */ openRecruitSheet?: boolean }
  /** dragPreview: 개발 픽스처(시안 PartyDrag)에서 끌기 중 모습으로 연다 */
  | { name: 'party'; riftId: string; dragPreview?: boolean }
  | { name: 'mercs' }
  | { name: 'merc'; mercId: string }
  | { name: 'base' }
  /** 설정(톱니). back: 돌아갈 화면 */
  | { name: 'saves'; back?: Route }
  | { name: 'dayResult'; events: DayEvent[] }
  /** openStatus: 개발 픽스처(시안 HelpSheet)에서 상태 설명 시트를 열어 둔다 */
  | { name: 'replay'; expeditionId: string; back: Route; openStatus?: boolean }
  /** 도움말(지시서 020). topic: 처음 펼칠 항목 id */
  | { name: 'help'; topic?: string; back?: Route };

export type ContentTab = 'rifts' | 'tower' | 'boss' | 'recruit';

export interface Game {
  slotId: string;
  state: GameState;
}

/** 게임 중인 화면이 받는 공통 도구 */
export interface Ctx {
  game: Game;
  setState: (s: GameState) => void;
  go: (r: Route) => void;
  toast: (msg: string) => void;
  nextDay: () => void;
  busy: boolean;
}
