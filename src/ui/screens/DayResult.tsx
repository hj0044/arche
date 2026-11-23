/**
 * 하루 결과(시안 Result, 지시서 017). 구역 순서: header · events · report · levelup · upkeep · actions.
 * 사건은 종류마다 색 띠가 있는 카드로, 복귀 보고는 결과 배너(누르면 전투 재생)와 보고 카드로 보인다.
 */
import { tables } from '../../data';
import type { DayEvent } from '../../engine/game';
import { levelUpAll } from '../../engine/game';
import { levelUpCandidates } from '../../engine/status';
import { VICTORY_BANNER } from '../art/fallback';
import { Art, Avatar, Card, Icon, LogoRow, Screen, type IconName } from '../components';
import { factionName, josa, loyaltyTierName, materialName, num, outcomeName, severityName } from '../format';
import type { Ctx } from '../nav';

interface EventCard {
  key: string;
  color: string;
  icon: IconName;
  title: string;
  text: string;
}

export function DayResult({ ctx, events }: { ctx: Ctx; events: DayEvent[] }) {
  const s = ctx.game.state;
  const name = (id: string) => s.mercenaries.find((m) => m.id === id)?.name ?? id;
  const facName = (id: string) => tables.facilities.facilities.find((f) => f.id === id)?.name ?? id;
  const returned = events.flatMap((e) => (e.type === 'returned' ? [s.reports.find((r) => r.expeditionId === e.expeditionId)!] : []));
  const upkeep = events.find((e) => e.type === 'upkeep');

  // ── 사건 카드(종류마다 색)
  const cards: EventCard[] = [];
  for (const e of events) {
    if (e.type === 'preempted') {
      const who = e.factionId ? `${factionName(e.factionId)}` : '라이벌 세력';
      cards.push({ key: `p${e.riftId}`, color: 'var(--c-bad)', icon: 'rift', title: '선점당함', text: `${who}${josa(who, '이', '가')} '${e.name}'${josa(e.name, '을', '를')} 선점했습니다.` });
    }
    if (e.type === 'departed') cards.push({ key: `d${e.mercId}`, color: 'var(--c-bad)', icon: 'heart', title: '이탈', text: `${name(e.mercId)}${josa(name(e.mercId), '이', '가')} 길드를 떠났습니다. 영입 목록에서 다시 영입할 수 있습니다.` });
    if (e.type === 'refused') cards.push({ key: `r${e.mercId}`, color: 'var(--c-warn)', icon: 'heart', title: '파견 거부', text: `${name(e.mercId)}${josa(name(e.mercId), '이', '가')} 오늘 파견을 거부합니다.` });
    if (e.type === 'loyaltyTier') cards.push({ key: `l${e.mercId}`, color: 'var(--c-warn)', icon: 'heart', title: '충성도 변화', text: `${name(e.mercId)} ${loyaltyTierName(e.from)} → ${loyaltyTierName(e.to)}` });
    if (e.type === 'facilityBuilt') cards.push({ key: `f${e.facilityId}`, color: 'var(--c-info)', icon: 'plus', title: '완공', text: `${facName(e.facilityId)} Lv ${e.level}` });
    if (e.type === 'unassigned') cards.push({ key: `u${e.mercId}`, color: 'var(--c-warn)', icon: 'plus', title: '배치 해제', text: `${name(e.mercId)}(${e.reason})` });
    if (e.type === 'poached') cards.push({ key: `q${e.mercId}`, color: 'var(--c-info)', icon: 'users', title: '세력 이동', text: `${e.wasDeparted ? '이탈했던 ' : ''}${name(e.mercId)}${josa(name(e.mercId), '이', '가')} ${factionName(e.toFactionId)}에 합류했습니다.` });
    if (e.type === 'upkeep' && e.unpaid > 0) cards.push({ key: 'unpaid', color: 'var(--c-bad)', icon: 'zero', title: '유지비 미납', text: `${num(e.unpaid)} 제로 (${e.unpaidMercIds.map(name).join(', ')})` });
  }
  const trained = events.flatMap((e) => (e.type === 'trained' ? [e] : []));
  if (trained.length) cards.push({ key: 'trained', color: 'var(--c-ok)', icon: 'arrowUp', title: '훈련', text: trained.map((t) => `${name(t.mercId)} +${t.exp}`).join(', ') });
  const recovered = events.flatMap((e) => (e.type === 'recovered' ? [e.mercId] : []));
  if (recovered.length) cards.push({ key: 'recovered', color: 'var(--c-ok)', icon: 'plus', title: '회복', text: `${recovered.map(name).join(', ')} 출전 가능` });
  const spawned = events.flatMap((e) => (e.type === 'riftSpawned' ? [s.rifts.find((r) => r.id === e.riftId)] : [])).filter((r) => r !== undefined);
  if (spawned.length) cards.push({ key: 'spawned', color: 'var(--c-info)', icon: 'compass', title: '새 리프트', text: spawned.map((r) => r.name).join(', ') });
  const expired = events.flatMap((e) => (e.type === 'riftExpired' ? [e.name] : []));
  if (expired.length) cards.push({ key: 'expired', color: 'var(--c-text-sub)', icon: 'clock', title: '사라진 리프트', text: expired.join(', ') });

  // ── 레벨업(오늘 경험치를 받은 계약자 기준이 아니라 지금 가능한 전원: 시안 "레벨업 가능 N명")
  const ready = levelUpCandidates(tables, s);
  const need = ready.reduce((a, c) => a + c.cost, 0);
  const bulk = () => {
    const { state, steps } = levelUpAll(tables, s);
    if (!steps.length) return ctx.toast('아르케가 부족합니다');
    ctx.setState(state);
    ctx.toast(`${new Set(steps.map((x) => x.mercId)).size}명 총 ${steps.length}레벨, 아르케 −${num(steps.reduce((a, x) => a + x.cost, 0))}`);
  };

  return (
    <Screen
      footer={
        <div className="foot" style={{ paddingBottom: 18 }} data-ui="Result.actions">
          <button className="btn-act" style={{ width: 128, flex: 'none', height: 52, fontSize: 15, fontWeight: 500 }} onClick={() => ctx.go({ name: 'rifts' })}>
            리프트 보기
          </button>
          <button className="btn-big" onClick={() => ctx.go({ name: 'home' })}>
            {s.day}일차 시작
          </button>
        </div>
      }
    >
      <div className="pg top-16" data-role="page">
        <div data-ui="Result.header">
          <LogoRow ctx={ctx} back={{ name: 'dayResult', events }} right={<span className="logo-meta">{s.day - 1}일차 결과</span>} />
        </div>
        <div className="col" style={{ gap: 10 }} data-ui="Result.events">
          {cards.map((c) => (
            <div key={c.key} className="event-card" style={{ ['--ev' as string]: c.color }}>
              <span className="event-icon">
                <Icon name={c.icon} />
              </span>
              <span className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="event-title">{c.title}</span>
                <span className="event-text">{c.text}</span>
              </span>
            </div>
          ))}
        </div>
        {returned.length > 0 && (
          <div className="col" style={{ gap: 10 }} data-ui="Result.report">
            {returned.map((r) => (
              <div key={r.expeditionId} className="col" style={{ gap: 10 }}>
                <button
                  className={`outcome-banner outcome-${r.outcome}`}
                  aria-label={`${outcomeName[r.outcome]} · 전투 보기`}
                  disabled={!r.events}
                  onClick={() => ctx.go({ name: 'replay', expeditionId: r.expeditionId, back: { name: 'dayResult', events } })}
                >
                  <Art kind="banner" id="victory" fallback={VICTORY_BANNER} fill />
                  <span className="outcome-label">{outcomeName[r.outcome]}</span>
                </button>
                <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="row between">
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="t13 dim">복귀 보고</span>
                      <span style={{ fontSize: 16, fontWeight: 500 }} className="ellipsis">
                        {r.rift.name}
                      </span>
                    </div>
                    <span className="avatars">
                      {r.party.map((p) => {
                        const m = s.mercenaries.find((x) => x.id === p.mercId)!;
                        return <Avatar key={p.mercId} id={m.id} element={m.element} role={m.role} large />;
                      })}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <Gain icon="zero" label="제로" value={r.reward.zero} />
                    <Gain icon="arche" label="아르케" value={r.reward.arche} />
                    <Gain
                      icon="material"
                      label={Object.keys(r.reward.materials).length === 1 ? materialName(Object.keys(r.reward.materials)[0]) : '고유 재료'}
                      value={Object.values(r.reward.materials).reduce((a, n) => a + n, 0)}
                    />
                  </div>
                  <div className="row between t13 dim">
                    <span>
                      파티 {r.party.length}명
                      {r.injuries.length > 0 &&
                        ` · ${Object.entries(r.injuries.reduce<Record<string, number>>((a, i) => ({ ...a, [i.severity]: (a[i.severity] ?? 0) + 1 }), {}))
                          .map(([sev, n]) => `${severityName(sev)} ${n}명`)
                          .join(' · ')}`}
                    </span>
                    {r.injuries[0] && (
                      <span>
                        {name(r.injuries[0].unitId)} {s.mercenaries.find((m) => m.id === r.injuries[0].unitId)?.injury?.recoverDay ?? r.day + r.injuries[0].days + 1}일차부터 출전
                      </span>
                    )}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
        {ready.length > 0 && (
          <Card data-ui="Result.levelup" className="levelup-card">
            <div className="col" style={{ minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>레벨업 가능 {ready.length}명</span>
              <span className="t13 dim">
                필요 아르케 {num(need)} · 보유 {num(s.resources.arche)}
              </span>
            </div>
            <button className="btn-big" style={{ width: 128, height: 44, fontSize: 15, flex: 'none' }} onClick={bulk}>
              일괄 레벨업
            </button>
          </Card>
        )}
        <div className="row between t13 dim" style={{ padding: '0 4px' }} data-ui="Result.upkeep">
          <span>오늘 유지비 -{num(upkeep?.type === 'upkeep' ? upkeep.paid : 0)} 제로</span>
          <span>
            남은 제로 <b style={{ color: 'var(--c-text)' }}>{num(s.resources.zero)}</b>
          </span>
        </div>
      </div>
      <div className="grow" />
    </Screen>
  );
}

function Gain({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="gain">
      <Icon name={icon} />
      <div className="col">
        <span className="sub">{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>+{num(value)}</span>
      </div>
    </div>
  );
}
