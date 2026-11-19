// 앱 층: 엔진과 저장소를 잇는다(엔진은 저장소를 모른다): 하루를 넘기고 자동 저장한다.
import type { GameTables } from '../data';
import type { SaveService } from '../storage/saveService';
import { advanceDay, type DayEvent, type GameState } from '../engine/game';

export async function advanceDayWithAutosave(
  tables: GameTables,
  saves: SaveService,
  slotId: string,
  state: GameState,
): Promise<{ state: GameState; events: DayEvent[] }> {
  const next = advanceDay(tables, state);
  await saves.saveAuto(slotId, next.state);
  return next;
}
