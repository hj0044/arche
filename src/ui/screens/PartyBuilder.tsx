import { useState } from 'react';
import { getRole, tables, travelDays, type Row } from '../../data';
import { compositionMultiplier, elementMultiplier } from '../../engine/combat';
import { dispatch, GameError, isAvailable, type PartyMember } from '../../engine/game';
import { AppShell } from '../AppShell';
import { ElementTag, Panel, RoleTag } from '../components';
import { pct, rowName } from '../format';
import type { Ctx } from '../nav';
import { RiftCard } from './RiftList';

const GROUP_NAME: Record<string, string> = { vanguard: '전위', damage: '딜러', support: '지원' };

export function PartyBuilder({ ctx, riftId }: { ctx: Ctx; riftId: string }) {
  const s = ctx.game.state;
  const rift = s.rifts.find((r) => r.id === riftId);
  const [party, setParty] = useState<PartyMember[]>([]);
  const [error, setError] = useState('');
  const { maxSize } = tables.combat.party;

  if (!rift) {
    return (
      <AppShell title="파티 편성" onBack={() => ctx.go({ name: 'rifts' })}>
        <p className="muted">리프트가 사라졌습니다.</p>
      </AppShell>
    );
  }

  const merc = (id: string) => s.mercenaries.find((m) => m.id === id)!;
  const candidates = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const inParty = (id: string) => party.some((p) => p.mercId === id);

  const toggle = (id: string) => {
    setError('');
    if (inParty(id)) setParty(party.filter((p) => p.mercId !== id));
    else if (party.length < maxSize) setParty([...party, { mercId: id, row: getRole(tables, merc(id).role).defaultRow }]);
  };
  const flip = (id: string) =>
    setParty(party.map((p) => (p.mercId === id ? { ...p, row: p.row === 'front' ? 'back' : 'front' } : p)));

  const roles = party.map((p) => merc(p.mercId).role);
  const comp = compositionMultiplier(tables, roles);
  const groups = new Set(roles.map((r) => getRole(tables, r).group));
  const missing = tables.combat.composition.groups.filter((g) => !groups.has(g));
  const travel = travelDays(tables, s.baseCityId, rift.cityId);
  const returnDay = s.day + travel * 2 + rift.durationDays;

  const send = () => {
    try {
      ctx.setState(dispatch(tables, s, rift.id, party));
      ctx.toast(`${rift.name}에 파견했습니다. ${returnDay}일차에 복귀합니다.`);
      ctx.go({ name: 'home' });
    } catch (e) {
      setError(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const RowBox = ({ row }: { row: Row }) => {
    const members = party.filter((p) => p.row === row);
    return (
      <div className="formation-row">
        <div className="formation-label">{rowName[row]}</div>
        <div className="formation-slots">
          {members.length === 0 && <span className="muted small">비어 있음</span>}
          {members.map((p) => {
            const m = merc(p.mercId);
            const off = getRole(tables, m.role).defaultRow !== row;
            return (
              <div key={p.mercId} className={`member ${off ? 'off' : ''}`}>
                <div className="member-info">
                  <div className="strong small">
                    {m.name} {off && <span className="warn tiny">기본 위치 아님</span>}
                  </div>
                  <div className="tags">
                    <ElementTag id={m.element} />
                    <RoleTag id={m.role} />
                  </div>
                </div>
                <button className="btn small" onClick={() => flip(p.mercId)} aria-label={`${m.name} ${row === 'front' ? '후열' : '전열'}로`}>
                  {row === 'front' ? '후열로' : '전열로'}
                </button>
                <button className="btn small" onClick={() => toggle(p.mercId)} aria-label={`${m.name} 빼기`}>
                  빼기
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AppShell
      title="파티 편성"
      subtitle={`${party.length}/${maxSize}명 · ${returnDay}일차 복귀 예정`}
      onBack={() => ctx.go({ name: 'rifts', cityId: rift.cityId })}
      footer={
        <button className="btn primary block" disabled={party.length === 0} onClick={send}>
          {party.length ? `파견 (${party.length}명)` : '용병을 고르세요'}
        </button>
      }
    >
      <RiftCard rift={rift} day={s.day} baseCityId={s.baseCityId} />

      <Panel title="배치">
        <RowBox row="front" />
        <RowBox row="back" />
        {party.length > 0 && (
          <p className={`small ${comp >= 1 ? 'ok' : 'warn'}`}>
            구성 {pct(comp - 1)}
            {missing.length ? ` · 없음: ${missing.map((g) => GROUP_NAME[g] ?? g).join(', ')}` : ' · 전위·딜러·지원 모두 있음'}
          </p>
        )}
        <p className="hint">적은 전열부터 노립니다. 기본 위치가 아닌 열에 두면 주는 피해가 줄고 받는 피해가 늡니다.</p>
      </Panel>

      <Panel title="용병">
        <ul className="rows">
          {candidates.map((m) => {
            const free = isAvailable(s, m.id);
            const selected = inParty(m.id);
            const vsVoid = elementMultiplier(tables, m.element, 'void');
            return (
              <li key={m.id}>
                <button
                  className={`row-item row-button ${selected ? 'selected' : ''}`}
                  disabled={!free || (!selected && party.length >= maxSize)}
                  onClick={() => toggle(m.id)}
                  aria-pressed={selected}
                >
                  <div>
                    <div className="strong">
                      {m.name} <span className="muted small">Lv{m.level}</span>
                    </div>
                    <div className="tags">
                      <ElementTag id={m.element} />
                      <RoleTag id={m.role} />
                      {vsVoid > 1 && <span className="small ok">어둠과 상극</span>}
                    </div>
                  </div>
                  <span className={`pill ${selected ? 'ok' : ''}`}>
                    {selected ? '편성됨' : m.injury ? '부상' : free ? '추가' : '파견 중'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
      {error && <p className="error">{error}</p>}
    </AppShell>
  );
}
