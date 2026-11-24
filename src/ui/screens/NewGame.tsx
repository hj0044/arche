// 새 게임(지시서 022): 플레이어는 길드 마스터 전용이다. 입력은 길드 이름, 마스터 이름, 거점 도시뿐이고
// 시작 계약자 후보 4명은 모두 길드에 합류한다(모드 선택·속성·역할·이탈 후보 없음).
import { useState } from 'react';
import { tables } from '../../data';
import { GameError, newGame, type GameState } from '../../engine/game';
import { newSlotId } from '../../app/saves';
import { AppShell } from '../AppShell';
import { ElementTag, RoleTag, Segmented } from '../components';
import { term } from '../format';
import { saves } from '../../app/saves';

interface NewGameProps {
  onBack: () => void;
  onStart: (slotId: string, state: GameState) => void;
}

export function NewGame({ onBack, onStart }: NewGameProps) {
  const [name, setName] = useState('');
  const [guildName, setGuildName] = useState('');
  const [cityId, setCityId] = useState(tables.cities[0].id);
  const [error, setError] = useState('');

  const ready = name.trim() && guildName.trim();

  const start = async () => {
    try {
      const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
      const state = newGame(tables, { seed, guildName, baseCityId: cityId, protagonist: { name: name.trim() } });
      const slotId = newSlotId();
      await saves.saveAuto(slotId, state);
      onStart(slotId, state);
    } catch (e) {
      setError(e instanceof GameError ? e.message : `시작 실패: ${(e as Error).message}`);
    }
  };

  return (
    <AppShell
      title="새 게임"
      onBack={onBack}
      footer={
        <button className="btn primary block" disabled={!ready} onClick={start}>
          {ready ? '길드 시작' : '길드 이름과 마스터 이름을 정하세요'}
        </button>
      }
    >
      <section className="field">
        <label htmlFor="gname">길드 이름</label>
        <input id="gname" value={guildName} onChange={(e) => setGuildName(e.target.value)} placeholder="예: 새벽 용병단" />
      </section>
      <section className="field">
        <label htmlFor="pname">마스터 이름</label>
        <input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 한서준" />
        <p className="hint">길드 마스터는 전투에 나가지 않고 길드를 운영한다.</p>
      </section>
      <section className="field">
        <label>거점 도시</label>
        <Segmented value={cityId} onChange={setCityId} options={tables.cities.map((c) => ({ value: c.id, label: c.name }))} />
        <p className="hint">{tables.cities.find((c) => c.id === cityId)?.summary}</p>
      </section>
      <section className="field">
        <label>시작 {term.merc}</label>
        <ul className="rows">
          {tables.roster
            .filter((r) => r.startingCandidate)
            .map((r) => (
              <li key={r.id} className="row-item">
                <span className="strong">{r.name}</span>
                <span className="tags">
                  <ElementTag id={r.element} />
                  <RoleTag id={r.role} />
                  <span className="muted small">Lv{r.initialLevel}</span>
                </span>
              </li>
            ))}
        </ul>
      </section>
      {error && <p className="error">{error}</p>}
    </AppShell>
  );
}
