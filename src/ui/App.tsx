import { useCallback, useState } from 'react';
import { tables } from '../data';
import { advanceDayWithAutosave } from '../app/session';
import type { GameState } from '../engine/game';
import { Toast } from './components';
import type { Ctx, Game, Route } from './nav';
import { saves } from './saves';
import { BattleReplay } from './screens/BattleReplay';
import { DayResult } from './screens/DayResult';
import { GuildHome } from './screens/GuildHome';
import { MercDetail } from './screens/MercDetail';
import { MercList } from './screens/MercList';
import { NewGame } from './screens/NewGame';
import { PartyBuilder } from './screens/PartyBuilder';
import { RiftList } from './screens/RiftList';
import { SaveSlots } from './screens/SaveSlots';
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
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2500);
  }, []);

  const startGame = useCallback(
    (slotId: string, state: GameState) => {
      setGame({ slotId, state });
      go({ name: 'home' });
    },
    [go],
  );

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
      screen = <RiftList ctx={ctx} cityId={route.cityId} />;
      break;
    case 'party':
      screen = <PartyBuilder ctx={ctx} riftId={route.riftId} />;
      break;
    case 'mercs':
      screen = <MercList ctx={ctx} />;
      break;
    case 'merc':
      screen = <MercDetail ctx={ctx} mercId={route.mercId} />;
      break;
    case 'saves':
      screen = <SaveSlots ctx={ctx} onLoad={startGame} toast={toast} />;
      break;
    case 'dayResult':
      screen = <DayResult ctx={ctx} events={route.events} />;
      break;
    case 'replay':
      screen = <BattleReplay ctx={ctx} expeditionId={route.expeditionId} back={route.back} />;
      break;
  }
  return (
    <>
      {screen}
      {toastEl}
    </>
  );
}
