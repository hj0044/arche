import { useState } from 'react';
import { tables } from '../../data';
import { canLevelUp, GameError, isOnExpedition, recruit, recruitCost } from '../../engine/game';
import { AppShell } from '../AppShell';
import { ConfirmDialog, ElementTag, RoleTag, Segmented } from '../components';
import { factionName, num, severityName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

type Tab = 'guild' | 'recruit' | 'others';

export function MercList({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const [tab, setTab] = useState<Tab>('guild');
  const [confirm, setConfirm] = useState<string | null>(null);
  const poolIds = new Set(tables.factions.filter((f) => f.recruitPool).map((f) => f.id));
  const factionOf = (a: (typeof s.mercenaries)[number]['affiliation']) => (a.kind === 'faction' ? a.factionId : '');

  const lists: Record<Tab, typeof s.mercenaries> = {
    guild: s.mercenaries.filter((m) => m.affiliation.kind === 'guild'),
    recruit: s.mercenaries.filter((m) => poolIds.has(factionOf(m.affiliation))),
    others: s.mercenaries.filter((m) => m.affiliation.kind === 'faction' && !poolIds.has(factionOf(m.affiliation))),
  };
  const target = confirm ? s.mercenaries.find((m) => m.id === confirm) : undefined;

  const doRecruit = () => {
    if (!target) return;
    try {
      ctx.setState(recruit(tables, s, target.id));
      ctx.toast(`${target.name}을(를) 영입했습니다.`);
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
    setConfirm(null);
  };

  return (
    <AppShell title="용병" subtitle={`제로 ${num(s.resources.zero)} · 아르케 ${num(s.resources.arche)}`} footer={<MainTabs ctx={ctx} current="mercs" />}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'guild', label: `길드 ${lists.guild.length}` },
          { value: 'recruit', label: `영입 ${lists.recruit.length}` },
          { value: 'others', label: `타 세력 ${lists.others.length}` },
        ]}
      />
      {tab === 'recruit' && <p className="hint">무소속 개방자를 제로로 영입합니다.</p>}
      {lists[tab].length === 0 && <p className="muted">없습니다.</p>}
      <ul className="rows">
        {lists[tab].map((m) => {
          const cost = recruitCost(tables, m.level);
          return (
            <li key={m.id}>
              <button
                className="row-item row-button"
                onClick={() => (tab === 'recruit' ? setConfirm(m.id) : ctx.go({ name: 'merc', mercId: m.id }))}
              >
                <div>
                  <div className="strong">
                    {m.name} <span className="muted small">Lv{m.level} / 한계 {m.growth.cap}</span>
                  </div>
                  <div className="tags">
                    <ElementTag id={m.element} />
                    <RoleTag id={m.role} />
                    {tab === 'others' && <span className="muted small">{factionName(factionOf(m.affiliation))}</span>}
                  </div>
                </div>
                {tab === 'recruit' ? (
                  <span className={`pill ${s.resources.zero >= cost ? 'ok' : 'bad'}`}>제로 {num(cost)}</span>
                ) : tab === 'others' ? (
                  <span className="pill">타 세력</span>
                ) : m.injury ? (
                  <span className="pill bad">{severityName(m.injury.severity)}</span>
                ) : isOnExpedition(s, m.id) ? (
                  <span className="pill">파견 중</span>
                ) : canLevelUp(tables, s, m.id) ? (
                  <span className="pill ok">레벨업 가능</span>
                ) : (
                  <span className="pill">대기</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {target && (
        <ConfirmDialog
          title="영입"
          message={
            <p>
              {target.name}(Lv{target.level})을(를) 제로 {num(recruitCost(tables, target.level))}에 영입합니다.
              <br />
              보유 제로: {num(s.resources.zero)}
            </p>
          }
          confirmLabel="영입"
          onConfirm={doRecruit}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AppShell>
  );
}
