import type { DayEvent, GameState } from '../engine/game';

export type Route =
  | { name: 'title' }
  | { name: 'newGame' }
  | { name: 'home' }
  | { name: 'rifts'; cityId?: string }
  | { name: 'party'; riftId: string }
  | { name: 'mercs' }
  | { name: 'merc'; mercId: string }
  | { name: 'base' }
  | { name: 'saves' }
  | { name: 'dayResult'; events: DayEvent[] }
  | { name: 'replay'; expeditionId: string; back: Route };

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
