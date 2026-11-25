import { useCallback, useEffect, useState } from 'react';
import { loadUiFixture } from '../app/fixture';
import { tables } from '../data';
import { advanceDayWithAutosave } from '../app/session';
import type { DayEvent, GameState } from '../engine/game';
import { Toast } from './components';
import type { Ctx, Game, Route } from './nav';
import { saves } from '../app/saves';
import { BattleReplay } from './screens/BattleReplay';
import { Help } from './screens/Help';
import { Base } from './screens/Base';
import { DayResult } from './screens/DayResult';
import { GuildHome } from './screens/GuildHome';
import { MercDetail } from './screens/MercDetail';
import { MercList } from './screens/MercList';
import { NewGame } from './screens/NewGame';
import { PartyBuilder } from './screens/PartyBuilder';
import { Content } from './screens/Content';
import { SaveSlots } from './screens/SaveSlots';
import { Settings } from './screens/Settings';
import { Title } from './screens/Title';

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'title' });
  const [game, setGame] = useState<Game | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = useCallback((r: Route) => {
    setRoute(r);
    document.querySelector('.shell-body')?.scrollTo(0, 0);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), tables.ui.toastMs);
  }, []);

  const startGame = useCallback(
    (slotId: string, state: GameState) => {
      setGame({ slotId, state });
      go({ name: 'home' });
    },
    [go],
  );

  // 개발 전용: ?fixture=ui면 UI 픽스처로 바로 시작하고 screen 파라미터의 화면을 연다(지시서 017 A-2)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    loadUiFixture().then((fx) => {
      if (!alive || !fx) return;
      const st = fx.dayResult?.state ?? fx.state;
      setGame({ slotId: fx.slotId, state: st });
      setRoute(fixtureRoute(fx.screen, fx.state, fx.dayResult?.events));
    });
    return () => {
      alive = false;
    };
  }, []);

  const toastEl = toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />;

  if (!game || route.name === 'title' || route.name === 'newGame') {
    return (
      <>
        {route.name === 'newGame' ? (
          <NewGame onBack={() => go({ name: 'title' })} onStart={startGame} />
        ) : route.name === 'saves' ? (
          <SaveSlots ctx={null} onLoad={startGame} onBack={() => go({ name: 'title' })} toast={toast} />
        ) : (
          <Title onNew={() => go({ name: 'newGame' })} onLoad={startGame} onOpenSaves={() => go({ name: 'saves' })} />
        )}
        {toastEl}
      </>
    );
  }

  const ctx: Ctx = {
    game,
    busy,
    go,
    toast,
    setState: (state) => setGame((g) => (g ? { ...g, state } : g)),
    nextDay: async () => {
      if (busy) return;
      setBusy(true);
      try {
        const { state, events } = await advanceDayWithAutosave(tables, saves, game.slotId, game.state);
        setGame({ ...game, state });
        go({ name: 'dayResult', events });
      } catch (e) {
        toast(`진행 실패: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
  };

  let screen;
  switch (route.name) {
    case 'home':
      screen = <GuildHome ctx={ctx} />;
      break;
    case 'rifts':
      screen = <Content ctx={ctx} cityId={route.cityId} sub={route.sub} openRecruitSheet={route.openRecruitSheet} />;
      break;
    case 'party':
      screen = <PartyBuilder ctx={ctx} riftId={route.riftId} dragPreview={route.dragPreview} />;
      break;
    case 'mercs':
      screen = <MercList ctx={ctx} />;
      break;
    case 'merc':
      screen = <MercDetail ctx={ctx} mercId={route.mercId} />;
      break;
    case 'base':
      screen = <Base ctx={ctx} />;
      break;
    case 'saves':
      screen = <Settings ctx={ctx} back={route.back} onLoad={startGame} onNewGame={() => go({ name: 'newGame' })} />;
      break;
    case 'dayResult':
      screen = <DayResult ctx={ctx} events={route.events} />;
      break;
    case 'replay':
      screen = <BattleReplay ctx={ctx} expeditionId={route.expeditionId} back={route.back} openStatus={route.openStatus} />;
      break;
    case 'help':
      screen = <Help ctx={ctx} topic={route.topic} back={route.back} />;
      break;
  }
  return (
    <>
      {screen}
      {toastEl}
    </>
  );
}

/** 픽스처 화면 이름 → 경로(개발 전용) */
function fixtureRoute(screen: string, s: GameState, events?: DayEvent[]): Route {
  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const baseRifts = s.rifts.filter((r) => r.cityId === s.baseCityId);
  switch (screen) {
    case 'rifts':
      return { name: 'rifts', sub: 'rifts' };
    case 'tower':
    case 'boss':
    case 'recruit':
      return { name: 'rifts', sub: screen };
    case 'recruitSheet':
      return { name: 'rifts', sub: 'recruit', openRecruitSheet: true };
    case 'party':
    case 'partyDrag':
      return { name: 'party', riftId: (baseRifts[2] ?? baseRifts[0]).id, ...(screen === 'partyDrag' ? { dragPreview: true } : {}) };
    case 'dayResult':
      return { name: 'dayResult', events: events ?? [] };
    case 'mercs':
      return { name: 'mercs' };
    case 'merc':
      return { name: 'merc', mercId: guild[0].id };
    case 'replay':
    case 'helpSheet':
      return { name: 'replay', expeditionId: s.reports.at(-1)?.expeditionId ?? '', back: { name: 'home' }, ...(screen === 'helpSheet' ? { openStatus: true } : {}) };
    case 'help':
      return { name: 'help', topic: 'status', back: { name: 'saves' } };
    case 'base':
      return { name: 'base' };
    case 'saves':
      return { name: 'saves' };
    default:
      return { name: 'home' };
  }
}
