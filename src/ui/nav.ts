import type { DayEvent, GameState } from '../engine/game';

export type Route =
  | { name: 'title' }
  | { name: 'newGame' }
  | { name: 'home' }
  /** 콘텐츠 화면. sub: 서브 탭(리프트·탑·보스·영입, 지시서 017) */
  | { name: 'rifts'; cityId?: string; sub?: ContentTab }
  | { name: 'party'; riftId: string }
  | { name: 'mercs' }
  | { name: 'merc'; mercId: string }
  | { name: 'base' }
  /** 설정(톱니). back: 돌아갈 화면 */
  | { name: 'saves'; back?: Route }
  | { name: 'dayResult'; events: DayEvent[] }
  | { name: 'replay'; expeditionId: string; back: Route };

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
