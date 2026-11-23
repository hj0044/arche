// 개발 전용 UI 픽스처(지시서 017 A-2). 개발 서버에서 ?fixture=ui일 때만 쓴다. 프로덕션 빌드에는 들어가지 않는다.
// ?fixture=ui&screen=<화면>으로 화면을 바로 연다(ui:shots·ui:check용).
import { tables } from '../data';
import { advanceDay, type DayEvent, type GameState } from '../engine/game';
import { isUiFixture, parseSave, saves, UI_FIXTURE_SLOT } from './saves';
import { defaultSettings, deviceSettings, memorySettingsStore } from './settings';

export interface FixtureStart {
  slotId: string;
  state: GameState;
  /** 처음 열 화면 이름(home, rifts, party, dayResult, mercs, merc, replay, base, saves, recruit, tower, boss) */
  screen: string;
  /** dayResult용: 픽스처 상태에서 하루를 넘긴 결과 */
  dayResult?: { state: GameState; events: DayEvent[] };
}

export async function loadUiFixture(): Promise<FixtureStart | null> {
  if (!import.meta.env.DEV || !isUiFixture()) return null;
  // 기기 설정은 브라우저 값을 건드리지 않게 메모리로, 시안처럼 재생 속도 2x
  deviceSettings.useStore(memorySettingsStore({ ...defaultSettings(), replaySpeed: 2 }));
  const json = (await import('../ui/fixtures/ui-mock.json')).default;
  const file = parseSave(json, saves.semantic);
  // 시안처럼 수동 저장 1개와 자동 저장 3개(지난 날의 상태는 없어 같은 상태를 쓴다. 일차를 바꾸면 의미 검사에 걸린다)
  await saves.saveManual(UI_FIXTURE_SLOT, file.state, { overwrite: true });
  for (let i = 0; i < saves.policy.autoSavesPerSlot; i++) await saves.saveAuto(UI_FIXTURE_SLOT, file.state);
  const screen = new URLSearchParams(location.search).get('screen') ?? 'home';
  return {
    slotId: UI_FIXTURE_SLOT,
    state: file.state,
    screen,
    dayResult: screen === 'dayResult' ? advanceDay(tables, file.state) : undefined,
  };
}
