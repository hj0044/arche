import { useState } from 'react';
import { tables } from '../../data';
import { GameError, newGame, pickCandidateToLeave, type GameState, type ProtagonistSetup } from '../../engine/game';
import { newSlotId } from '../../storage/saveService';
import { AppShell } from '../AppShell';
import { ElementTag, RoleTag, Segmented } from '../components';
import { saves } from '../saves';

interface NewGameProps {
  onBack: () => void;
  onStart: (slotId: string, state: GameState) => void;
}

type Mode = 'opener' | 'guildMaster';

export function NewGame({ onBack, onStart }: NewGameProps) {
  const [mode, setMode] = useState<Mode>('opener');
  const [name, setName] = useState('');
  const [element, setElement] = useState(tables.elements[0].id);
  const [role, setRole] = useState(tables.roles.find((r) => r.enabled)!.id);
  const [background, setBackground] = useState(tables.backgrounds[0].id);
  const [guildName, setGuildName] = useState('');
  const [cityId, setCityId] = useState(tables.cities[0].id);
  const [error, setError] = useState('');

  const ready = name.trim() && guildName.trim();
  const leaving = mode === 'opener' ? pickCandidateToLeave(tables, role) : undefined;
  const leavingRow = tables.roster.find((r) => r.id === leaving);

  const start = async () => {
    const protagonist: ProtagonistSetup =
      mode === 'opener'
        ? { mode, name: name.trim(), element, role, background }
        : { mode, name: name.trim(), background };
    try {
      const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
      const state = newGame(tables, { seed, guildName, baseCityId: cityId, protagonist });
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
          {ready ? '길드 시작' : '이름과 길드 이름을 정하세요'}
        </button>
      }
    >
      <section className="field">
        <label>주인공 유형</label>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'opener', label: '개방자' },
            { value: 'guildMaster', label: '길드 마스터' },
          ]}
        />
        <p className="hint">
          {mode === 'opener'
            ? '아르케 능력이 열린 개방자. 파티에 들어가 직접 싸운다.'
            : '비개방자 길드 마스터. 전투에는 나가지 않고 길드를 운영한다.'}
        </p>
      </section>

      <section className="field">
        <label htmlFor="pname">주인공 이름</label>
        <input id="pname" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="예: 한서준" />
      </section>

      {mode === 'opener' && (
        <>
          <section className="field">
            <label>속성</label>
            <div className="chips">
              {tables.elements.map((el) => (
                <button key={el.id} className={`chip el-${el.id} ${element === el.id ? 'on' : ''}`} onClick={() => setElement(el.id)}>
                  {el.name}
                </button>
              ))}
            </div>
          </section>
          <section className="field">
            <label>역할</label>
            <div className="chips">
              {tables.roles
                .filter((r) => r.enabled)
                .map((r) => (
                  <button key={r.id} className={`chip ${role === r.id ? 'on' : ''}`} onClick={() => setRole(r.id)}>
                    {r.name}
                  </button>
                ))}
            </div>
            <p className="hint">세계는 지구, 종족은 인간이다(1단계).</p>
          </section>
        </>
      )}

      <section className="field">
        <label htmlFor="bg">배경</label>
        <select id="bg" value={background} onChange={(e) => setBackground(e.target.value)}>
          {tables.backgrounds.filter((b) => b.forProtagonist).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </section>

      <section className="field">
        <label>시작 용병</label>
        <ul className="rows">
          {tables.roster
            .filter((r) => r.startingCandidate && (mode === 'guildMaster' || r.id !== leaving))
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
        {mode === 'opener' && leavingRow && (
          <p className="hint">
            주인공({tables.roles.find((r) => r.id === role)?.name})과{' '}
            {leavingRow.role === role ? '역할이 겹치는' : '같은 분류(전위·딜러·지원)인'} {leavingRow.name}은(는) 합류하지 않습니다.
          </p>
        )}
      </section>

      <section className="field">
        <label htmlFor="gname">길드 이름</label>
        <input id="gname" value={guildName} maxLength={16} onChange={(e) => setGuildName(e.target.value)} placeholder="예: 새벽 용병단" />
      </section>

      <section className="field">
        <label>시작 도시</label>
        <div className="stack">
          {tables.cities.map((c) => (
            <button key={c.id} className={`card-button ${cityId === c.id ? 'selected' : ''}`} onClick={() => setCityId(c.id)}>
              <span className="card-title">{c.name}</span>
              <span className="card-desc">{c.summary}</span>
            </button>
          ))}
        </div>
      </section>
      {error && <p className="error">{error}</p>}
    </AppShell>
  );
}
