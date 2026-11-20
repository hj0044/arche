import type { DayEvent } from '../../engine/game';
import { AppShell } from '../AppShell';
import { Panel } from '../components';
import { cityName, loyaltyTierName, materialName, num, omenText, outcomeName, severityName } from '../format';
import type { Ctx } from '../nav';

export function DayResult({ ctx, events }: { ctx: Ctx; events: DayEvent[] }) {
  const s = ctx.game.state;
  const name = (id: string) => s.mercenaries.find((m) => m.id === id)?.name ?? id;
  const returned = events.flatMap((e) => (e.type === 'returned' ? [s.reports.find((r) => r.expeditionId === e.expeditionId)!] : []));
  const recovered = events.flatMap((e) => (e.type === 'recovered' ? [e.mercId] : []));
  const expired = events.flatMap((e) => (e.type === 'riftExpired' ? [e.name] : []));
  const spawned = events.flatMap((e) => (e.type === 'riftSpawned' ? [s.rifts.find((r) => r.id === e.riftId)] : [])).filter((r) => r !== undefined);
  const upkeep = events.find((e) => e.type === 'upkeep');
  const departed = events.flatMap((e) => (e.type === 'departed' ? [e.mercId] : []));
  const refused = events.flatMap((e) => (e.type === 'refused' ? [e.mercId] : []));
  const tierChanges = events.flatMap((e) => (e.type === 'loyaltyTier' && !departed.includes(e.mercId) ? [e] : []));
  const quiet = !departed.length && !refused.length && !tierChanges.length && !returned.length && !recovered.length && !expired.length && !spawned.length;

  return (
    <AppShell
      title={`${s.day}일차`}
      subtitle="하루가 지났습니다 · 자동 저장됨"
      footer={
        <button className="btn primary block" onClick={() => ctx.go({ name: 'home' })}>
          길드 홈으로
        </button>
      }
    >
      {upkeep?.type === 'upkeep' && (
        <p className={`small ${upkeep.unpaid ? 'warn' : 'muted'}`}>
          {upkeep.paid > 0 && `유지비 제로 −${num(upkeep.paid)}`}
          {upkeep.paid > 0 && upkeep.unpaid > 0 && ' · '}
          {upkeep.unpaid > 0 && `유지비 미납 ${num(upkeep.unpaid)} (${upkeep.unpaidMercIds.map(name).join(', ')})`}
        </p>
      )}
      {quiet && <p className="muted">조용한 하루였습니다.</p>}
      {(departed.length > 0 || refused.length > 0 || tierChanges.length > 0) && (
        <Panel title="충성도">
          {departed.length > 0 && (
            <p className="bad small">
              ⚠ {departed.map(name).join(', ')}이(가) 길드를 떠나 무소속이 됐습니다. 영입 목록에서 다시 영입할 수 있습니다.
            </p>
          )}
          {refused.length > 0 && <p className="warn small">오늘 파견 거부: {refused.map(name).join(', ')}</p>}
          {tierChanges.length > 0 && (
            <p className="small">
              {tierChanges.map((c) => `${name(c.mercId)} ${loyaltyTierName(c.from)} → ${loyaltyTierName(c.to)}`).join(', ')}
            </p>
          )}
        </Panel>
      )}
      {returned.map((r) => (
        <Panel
          key={r.expeditionId}
          title={
            <>
              {r.rift.name} <span className={`pill outcome-${r.outcome}`}>{outcomeName[r.outcome]}</span>
            </>
          }
        >
          <p className="small">
            {r.rounds}라운드 · 제로 +{num(r.reward.zero)} · 아르케 +{num(r.reward.arche)}
            {Object.entries(r.reward.materials).map(([id, n]) => ` · ${materialName(id)} +${n}`)}
          </p>
          {r.rift.omen && <p className="omen-text small">◈ 징조 표식이 있던 리프트였다. {omenText(r.rift.omen.textId)}</p>}
          {r.stabilized && <p className="small ok">항로를 안정화했습니다. 이제 마감 없이 다시 공략할 수 있습니다.</p>}
          <p className="small muted">경험치: {r.expGains.map((g) => `${name(g.mercId)} +${g.exp}`).join(', ')}</p>
          {r.injuries.length > 0 && (
            <p className="small warn">부상: {r.injuries.map((i) => `${name(i.unitId)} ${severityName(i.severity)} ${i.days}일`).join(', ')}</p>
          )}
          <button
            className="btn block"
            onClick={() => ctx.go({ name: 'replay', expeditionId: r.expeditionId, back: { name: 'dayResult', events } })}
          >
            전투 보기
          </button>
        </Panel>
      ))}
      {recovered.length > 0 && (
        <Panel title="회복">
          <p className="small">{recovered.map(name).join(', ')}이(가) 부상에서 회복했습니다.</p>
        </Panel>
      )}
      {spawned.length > 0 && (
        <Panel title="새 리프트">
          <ul className="rows">
            {spawned.map((r) => (
              <li key={r.id}>
                <button className="row-item row-button" onClick={() => ctx.go({ name: 'rifts', cityId: r.cityId })}>
                  <span>{r.name}</span>
                  <span className="muted small">{cityName(r.cityId)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {expired.length > 0 && (
        <Panel title="사라진 리프트">
          <p className="small muted">{expired.join(', ')}</p>
        </Panel>
      )}
    </AppShell>
  );
}
