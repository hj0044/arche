import { useState } from 'react';
import { tables } from '../../data';
import { canLevelUp, isOnExpedition, recruitInfo, type MercenaryState } from '../../engine/game';
import { AppShell } from '../AppShell';
import { ElementTag, LoyaltyBadge, RoleTag, Segmented } from '../components';
import { cityName, factionName, growthSpeedName, num, severityName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

type Tab = 'guild' | 'recruit';

export function MercList({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const [tab, setTab] = useState<Tab>('guild');
  const [faction, setFaction] = useState<string>('all');

  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const factionOf = (m: MercenaryState) => (m.affiliation.kind === 'faction' ? m.affiliation.factionId : '');
  // 고향이 거점 도시인 용병을 먼저 보여준다(임시 규칙).
  const recruitable = s.mercenaries
    .filter((m) => recruitInfo(tables, s, m.id).eligible)
    .filter((m) => faction === 'all' || factionOf(m) === faction)
    .sort((a, b) => Number(b.profile.hometown === s.baseCityId) - Number(a.profile.hometown === s.baseCityId));

  const list = tab === 'guild' ? guild : recruitable;

  return (
    <AppShell title="용병" subtitle={`제로 ${num(s.resources.zero)} · 아르케 ${num(s.resources.arche)}`} footer={<MainTabs ctx={ctx} current="mercs" />}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'guild', label: `길드 ${guild.length}` },
          { value: 'recruit', label: `영입 ${s.mercenaries.length - guild.length}` },
        ]}
      />
      {tab === 'recruit' && (
        <>
          <div className="chips scroll">
            {[{ id: 'all', name: '전체' }, ...tables.factions].map((f) => (
              <button key={f.id} className={`chip small ${faction === f.id ? 'on' : ''}`} onClick={() => setFaction(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
          <p className="hint">고향이 {cityName(s.baseCityId)}인 용병이 먼저 보이고, 다른 도시 출신은 영입비가 더 들 수 있습니다.</p>
        </>
      )}
      {list.length === 0 && <p className="muted">없습니다.</p>}
      <ul className="rows">
        {list.map((m) => {
          const info = tab === 'recruit' ? recruitInfo(tables, s, m.id) : undefined;
          return (
            <li key={m.id}>
              <button className="row-item row-button" onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
                <div>
                  <div className="strong">
                    {m.name} <span className="muted small">Lv{m.level}</span>
                  </div>
                  <div className="tags">
                    <ElementTag id={m.element} />
                    <RoleTag id={m.role} />
                    <span className="muted small">
                      한계 {m.growth.cap} · {growthSpeedName(m.growth.speed)}
                    </span>
                  </div>
                  {m.loyalty && m.affiliation.kind === 'guild' && (
                    <div className="tags">
                      <LoyaltyBadge value={m.loyalty.value} />
                      {m.loyalty.refusedOnDay === s.day && <span className="small warn">오늘 거부</span>}
                    </div>
                  )}
                  {info && (
                    <div className="muted tiny">
                      {factionName(factionOf(m))} · {m.profile.hometown ? cityName(m.profile.hometown) : ''}
                    </div>
                  )}
                </div>
                {info ? (
                  !info.unlocked ? (
                    <span className="pill">
                      잠김 {info.progress?.current}/{info.progress?.required}
                    </span>
                  ) : (
                    <span className={`pill ${s.resources.zero >= info.cost ? 'ok' : 'bad'}`}>제로 {num(info.cost)}</span>
                  )
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
    </AppShell>
  );
}
