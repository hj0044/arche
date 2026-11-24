/**
 * 홈(시안 Main, 지시서 017). 구역 순서: header · hero · resources · counts · todo · dispatch · report · cta.
 * 하루 넘기기 버튼은 이 화면에만 있다. 017b: 파견 현황 아래 '최근 보고' 한 줄 카드(재생 버튼).
 */
import { tables } from '../../data';
import { getFacility } from '../../engine/facilities';
import { levelUpAll } from '../../engine/game';
import { loyaltyTier } from '../../engine/loyalty';
import { guildStatusSummary, levelUpOverview } from '../../engine/status';
import { GUILD_BANNER } from '../art/fallback';
import { Art, Avatar, Card, Gauge, Icon, LogoRow, Screen, Section, type IconName } from '../components';
import { cityName, num, reportOutcomeName, severityName } from '../format';
import type { Ctx } from '../nav';
import { isUrgent, daysLeft } from '../riftFilter';

interface Todo {
  key: string;
  icon: IconName;
  color: string;
  title: string;
  sub: string;
  right: string;
  onClick: () => void;
}

export function GuildHome({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const sum = guildStatusSummary(tables, s);
  const o = levelUpOverview(tables, s);
  const materials = Object.values(s.resources.materials).reduce((a, n) => a + n, 0);
  // 가장 최근 하루 결과(복귀 보고). 없으면 '최근 보고' 구역을 숨긴다
  const last = s.reports.at(-1);

  // 오늘 할 일(해당하는 것만, 최대 4종)
  const todos: Todo[] = [];
  const urgent = s.rifts.filter((r) => isUrgent(tables, s.facilities, r, s.day)).sort((a, b) => (daysLeft(tables, s.facilities, a, s.day)?.[0] ?? 99) - (daysLeft(tables, s.facilities, b, s.day)?.[0] ?? 99));
  if (urgent.length) {
    const left = daysLeft(tables, s.facilities, urgent[0], s.day)?.[0] ?? 0;
    todos.push({
      key: 'urgent',
      icon: 'clock',
      color: 'var(--c-bad)',
      title: `마감 임박 리프트 ${urgent.length}개`,
      sub: `${shortName(urgent[0].name, urgent[0].cityId)} · ${left === 0 ? '오늘 마감' : left === 1 ? '내일 마감' : `${left}일 뒤 마감`}`,
      right: `D-${left}`,
      onClick: () => ctx.go({ name: 'rifts', cityId: urgent[0].cityId }),
    });
  }
  if (o.readyCount > 0)
    todos.push({
      key: 'levelup',
      icon: 'arrowUp',
      color: 'var(--c-gold)',
      title: `레벨업 가능 ${o.readyCount}명`,
      sub: `필요 아르케 ${num(o.totalCostOneEach)} · 보유 ${num(s.resources.arche)}`,
      right: '일괄',
      onClick: () => {
        const { state, steps } = levelUpAll(tables, s);
        if (!steps.length) return ctx.toast('아르케가 부족합니다');
        ctx.setState(state);
        ctx.toast(`${new Set(steps.map((x) => x.mercId)).size}명 총 ${steps.length}레벨, 아르케 −${num(steps.reduce((a, x) => a + x.cost, 0))}`);
      },
    });
  const danger = s.mercenaries.filter((m) => m.affiliation.kind === 'guild' && m.loyalty && loyaltyTier(tables, m.loyalty.value).warn);
  if (danger.length)
    todos.push({
      key: 'loyalty',
      icon: 'heart',
      color: 'var(--c-warn)',
      title: `충성 위험 ${danger.length}명`,
      sub: `${danger[0].name} · 급료 보너스나 휴식 필요`,
      right: '주의',
      onClick: () => ctx.go({ name: 'merc', mercId: danger[0].id }),
    });
  const job = s.facilities.construction;
  if (job) {
    const fac = getFacility(tables, job.facilityId);
    const recover = s.mercenaries.filter((m) => m.affiliation.kind === 'guild' && m.injury).sort((a, b) => a.injury!.recoverDay - b.injury!.recoverDay)[0];
    todos.push({
      key: 'facility',
      icon: 'plus',
      color: 'var(--c-info)',
      title: `${fac.name} Lv ${job.targetLevel} 공사 중`,
      sub: `${job.completeDay}일차 완공${recover ? ` · ${recover.name} ${recover.injury!.recoverDay}일차 복귀` : ''}`,
      right: `${Math.max(0, job.completeDay - s.day)}일`,
      onClick: () => ctx.go({ name: 'base' }),
    });
  }

  return (
    <Screen
      ctx={ctx}
      tab="home"
      footer={
        <div className="foot" data-ui="Main.cta">
          <button className="btn-big" onClick={ctx.nextDay} disabled={ctx.busy}>
            {ctx.busy ? '진행 중…' : `하루 넘기기 · 유지비 ${num(sum.dailyUpkeep)}`}
          </button>
        </div>
      }
    >
      <div className="pg top" data-role="page">
        <div data-ui="Main.header">
          <LogoRow ctx={ctx} back={{ name: 'home' }} right={<span className="day-pill">{s.day}일차</span>} />
        </div>
        <div className="card" data-role="card" data-ui="Main.hero" style={{ position: 'relative', height: 50, overflow: 'hidden' }}>
          <Art kind="banner" id="guild" fallback={GUILD_BANNER} fill />
          <div style={{ position: 'absolute', left: 14, bottom: 8 }} className="col">
            <span style={{ fontSize: 17, fontWeight: 700 }}>{s.guildName}</span>
            <span style={{ fontSize: 12, color: 'var(--c-text-banner)' }}>
              {cityName(s.baseCityId)} 거점 · 리프트 {s.rifts.filter((r) => r.cityId === s.baseCityId).length}
            </span>
          </div>
        </div>
        <div className="row" data-ui="Main.resources" style={{ gap: 8 }}>
          <Res icon="zero" label="제로" value={num(s.resources.zero)} />
          <Res icon="arche" label="아르케" value={num(s.resources.arche)} />
          <Res icon="material" label="고유 재료" value={num(materials)} />
        </div>
        <div className="row" data-ui="Main.counts" style={{ gap: 6 }}>
          <Count value={sum.available} label="대기" color="var(--c-ok)" />
          <Count value={sum.blocked.expedition} label="파견" color="var(--c-gold)" />
          <Count value={sum.blocked.training} label="훈련" color="var(--c-info)" />
          <Count value={sum.blocked.injured} label="부상" color="var(--c-warn)" />
          <Count value={`-${num(sum.dailyUpkeep)}`} label="유지비/일" color="var(--c-text-sub)" />
        </div>
      </div>
      {todos.length > 0 && (
        <Section title="오늘 할 일" data-ui="Main.todo">
          {todos.map((t) => (
            <Card key={t.key} onClick={t.onClick} label={t.title} className="todo">
              <span className="todo-icon" style={{ borderColor: t.color, color: t.color }}>
                <Icon name={t.icon} />
              </span>
              <span className="col grow" style={{ minWidth: 0 }}>
                <span className="t14 m ellipsis">{t.title}</span>
                <span className="sub ellipsis">{t.sub}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.color, flex: 'none' }}>{t.right}</span>
            </Card>
          ))}
        </Section>
      )}
      <Section title="파견 현황" data-ui="Main.dispatch">
        {s.expeditions.map((e) => {
          const left = e.returnDay - s.day;
          const total = Math.max(1, e.returnDay - e.departDay);
          const ratio = (s.day - e.departDay) / total;
          return (
            <Card key={e.id} className="dispatch">
              <span className="avatars">
                {e.party.map((p) => {
                  const m = s.mercenaries.find((x) => x.id === p.mercId)!;
                  return <Avatar key={p.mercId} id={m.id} element={m.element} role={m.role} />;
                })}
              </span>
              <span className="col grow" style={{ gap: 5, minWidth: 0 }}>
                <span className="row between t13">
                  <span className="m ellipsis">{shortName(e.rift.name, e.rift.cityId)}</span>
                  <span className="dim" style={{ flex: 'none' }}>
                    {left <= 1 ? '내일 복귀' : `${left}일 남음`}
                  </span>
                </span>
                <Gauge ratio={ratio} color={left <= 1 ? 'var(--c-ok)' : 'var(--c-gold)'} />
              </span>
            </Card>
          );
        })}
      </Section>
      {last && (
        <div className="pg" data-role="page">
          <div className="card report-line" data-role="card" data-ui="Main.report" style={{ borderLeftColor: last.outcome === 'victory' ? 'var(--risk-crush)' : last.outcome === 'retreat' ? 'var(--c-warn)' : 'var(--c-bad)' }}>
            <span className="col grow" style={{ minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 13, fontWeight: 500 }}>
                최근 보고 · {last.day}일차 {shortName(last.rift.name, last.rift.cityId)} {reportOutcomeName[last.outcome]}
              </span>
              <span className="sub ellipsis">
                {[
                  `제로 ${last.reward.zero >= 0 ? '+' : ''}${num(last.reward.zero)}`,
                  ...Object.entries(last.injuries.reduce<Record<string, number>>((a, i) => ({ ...a, [i.severity]: (a[i.severity] ?? 0) + 1 }), {})).map(([sev, n]) => `${severityName(sev)} ${n}명`),
                ].join(' · ')}
              </span>
            </span>
            <button
              className="report-play"
              aria-label={`${last.rift.name} 전투 재생`}
              disabled={!last.events}
              onClick={() => ctx.go({ name: 'replay', expeditionId: last.expeditionId, back: { name: 'home' } })}
            >
              재생
            </button>
          </div>
        </div>
      )}
      <div className="grow" />
    </Screen>
  );
}

/** 리프트 이름에서 앞의 도시 이름을 뺀 것(시안 표기) */
function shortName(name: string, cityId: string) {
  const prefix = `${cityName(cityId)} `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function Res({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="box row grow" style={{ padding: '8px 12px', gap: 8 }}>
      <Icon name={icon} />
      <div className="col">
        <span className="sub">{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{value}</span>
      </div>
    </div>
  );
}

function Count({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="box col grow" style={{ borderRadius: 'var(--r-btn)', padding: '5px 0', alignItems: 'center' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
      <span className="sub">{label}</span>
    </div>
  );
}
