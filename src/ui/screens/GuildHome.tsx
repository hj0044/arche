import { tables } from '../../data';
import { guildUpkeepPerDay, isOnExpedition } from '../../engine/game';
import { AppShell } from '../AppShell';
import { ElementTag, LoyaltyBadge, OmenBadge, Panel, RoleTag } from '../components';
import { loyaltyTier } from '../../engine/loyalty';
import { cityName, materialName, num, outcomeName, severityName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';
import { assignedFacility, getFacility } from '../../engine/facilities';

export function GuildHome({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const recent = s.reports.slice(-tables.ui.recentReportsOnHome).reverse();
  const materials = Object.entries(s.resources.materials).filter(([, n]) => n > 0);
  const unpaid = guild.reduce((sum, m) => sum + (m.unpaidUpkeep?.zero ?? 0), 0);

  return (
    <AppShell
      title={s.guildName}
      subtitle={`${cityName(s.baseCityId)} 거점 · ${s.day}일차 · ${s.protagonist.mode === 'opener' ? '개방자' : '길드 마스터'} ${s.protagonist.name}`}
      footer={<MainTabs ctx={ctx} current="home" />}
    >
      <div className="resources">
        <div className="res">
          <span className="res-label">제로</span>
          <span className="res-value">{num(s.resources.zero)}</span>
        </div>
        <div className="res">
          <span className="res-label">아르케</span>
          <span className="res-value">{num(s.resources.arche)}</span>
        </div>
        <div className="res">
          <span className="res-label">하루 유지비</span>
          <span className="res-value">−{num(guildUpkeepPerDay(tables, s))}</span>
        </div>
        {materials.map(([id, n]) => (
          <div className="res" key={id}>
            <span className="res-label">{materialName(id)}</span>
            <span className="res-value">{num(n)}</span>
          </div>
        ))}
      </div>

      {unpaid > 0 && <p className="error small">유지비 미납 누적 제로 {num(unpaid)}. 지금은 기록만 남습니다.</p>}

      <Panel title={`진행 중인 파견 ${s.expeditions.length}`}>
        {s.expeditions.length === 0 ? (
          <p className="muted">
            보낸 파티가 없습니다.{' '}
            <button className="link" onClick={() => ctx.go({ name: 'rifts' })}>
              리프트 보기
            </button>
          </p>
        ) : (
          <ul className="rows">
            {s.expeditions.map((e) => (
              <li key={e.id} className="row-item">
                <div>
                  <div className="strong">
                    {e.rift.name} {e.rift.omen && <OmenBadge />}
                  </div>
                  <div className="muted small">
                    {e.party.map((p) => s.mercenaries.find((m) => m.id === p.mercId)?.name).join(', ')}
                  </div>
                </div>
                <span className="pill">{e.returnDay - s.day}일 뒤 복귀</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {recent.length > 0 && (
        <Panel title="최근 복귀">
          <ul className="rows">
            {recent.map((r) => (
              <li key={r.expeditionId}>
                <button
                  className="row-item row-button"
                  disabled={!r.events}
                  onClick={() => ctx.go({ name: 'replay', expeditionId: r.expeditionId, back: { name: 'home' } })}
                >
                  <div>
                    <div className="strong">
                      {r.rift.name} {r.rift.omen && <OmenBadge />}
                    </div>
                    <div className="muted small">{r.day}일차 복귀 · 제로 +{num(r.reward.zero)} · 아르케 +{num(r.reward.arche)}</div>
                  </div>
                  <span className={`pill outcome-${r.outcome}`}>{outcomeName[r.outcome]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`용병 ${guild.length}`} action={<button className="link" onClick={() => ctx.go({ name: 'mercs' })}>전체</button>}>
        <ul className="rows">
          {guild.map((m) => (
            <li key={m.id}>
              <button className="row-item row-button" onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
                <div>
                  <div className="strong">
                    {m.name} {m.isProtagonist && <span className="pill small">주인공</span>}
                  </div>
                  <div className="tags">
                    <ElementTag id={m.element} />
                    <RoleTag id={m.role} />
                    <span className="muted small">Lv{m.level}</span>
                    {m.loyalty && loyaltyTier(tables, m.loyalty.value).warn && <LoyaltyBadge value={m.loyalty.value} />}
                  </div>
                </div>
                {m.injury ? (
                  <span className="pill bad">
                    {severityName(m.injury.severity)} {m.injury.recoverDay - s.day}일
                  </span>
                ) : isOnExpedition(s, m.id) ? (
                  <span className="pill">파견 중</span>
                ) : assignedFacility(s.facilities, m.id) ? (
                  <span className="pill">{getFacility(tables, assignedFacility(s.facilities, m.id)!).name} 배치</span>
                ) : m.loyalty?.refusedOnDay === s.day ? (
                  <span className="pill bad">오늘 거부</span>
                ) : (
                  <span className="pill ok">대기</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
