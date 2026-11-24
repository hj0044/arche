/**
 * 콘텐츠(시안 Content·Recruit·Tower·Boss, 지시서 017). 구역 순서: header · subtabs · cities · riskSummary · list.
 * 서브 탭은 탭으로만 이동한다. 탑·보스는 엔진에 없어 "준비 중", 영입은 엔진의 영입 기능에 연결한다.
 */
import { useEffect, useReducer, useState } from 'react';
import { tables, travelDays } from '../../data';
import { visibleRift } from '../../engine/facilities';
import { recruit, recruitInfo, type MercenaryState } from '../../engine/game';
import { riftVariant, type Rift } from '../../engine/rift';
import { guildStatusSummary, riftAutoRisk, type RiftAutoRisk } from '../../engine/status';
import { Banner, Card, Chip, ChipRow, Gauge, Icon, LevelBadge, LogoRow, Portrait, RiskPill, Screen } from '../components';
import { cityName, factionName, num, roleName, tierName } from '../format';
import type { ContentTab, Ctx } from '../nav';
import { cityChips, daysLeft, filterAndSortRifts, isUrgent, type RiskLookup } from '../riftFilter';
import { zeroPerDay } from '../riftInfo';

const SUBTABS: { id: ContentTab; name: string }[] = [
  { id: 'rifts', name: '리프트' },
  { id: 'tower', name: '탑' },
  { id: 'boss', name: '보스' },
  { id: 'recruit', name: '영입' },
];

/** 화면 상태 기억(세이브 아님): 서브 탭·도시·위험도 필터 */
let remembered: { slotId: string; sub: ContentTab; cityId: string; risk: string | null } | null = null;
const riskCache = new WeakMap<object, Map<string, RiftAutoRisk | null>>();

export function Content({ ctx, cityId, sub }: { ctx: Ctx; cityId?: string; sub?: ContentTab }) {
  const s = ctx.game.state;
  const mine = remembered?.slotId === ctx.game.slotId ? remembered : null;
  const [tab, setTabRaw] = useState<ContentTab>(sub ?? mine?.sub ?? 'rifts');
  const [city, setCityRaw] = useState(cityId ?? mine?.cityId ?? s.baseCityId);
  const [riskFilter, setRiskRaw] = useState<string | null>(cityId ? null : (mine?.risk ?? null));
  const save = (p: Partial<{ sub: ContentTab; cityId: string; risk: string | null }>) =>
    (remembered = { slotId: ctx.game.slotId, sub: tab, cityId: city, risk: riskFilter, ...p });
  const setTab = (t: ContentTab) => (setTabRaw(t), save({ sub: t }));
  const setCity = (c: string) => (setCityRaw(c), setRiskRaw(null), save({ cityId: c, risk: null }));
  const setRisk = (r: string | null) => (setRiskRaw(r), save({ risk: r }));

  const recruitable = s.mercenaries.filter((m) => recruitInfo(tables, s, m.id).eligible);
  const ready = recruitable.filter((m) => recruitInfo(tables, s, m.id).unlocked).length;
  const available = guildStatusSummary(tables, s).available;

  return (
    <Screen ctx={ctx} tab="rifts">
      <div className="pg top" data-role="page">
        <div data-ui="Content.header">
          <LogoRow ctx={ctx} back={{ name: 'rifts' }} right={<span className="logo-meta">{tab === 'recruit' ? `영입 가능 ${ready}명` : `대기 ${available}명`}</span>} />
        </div>
        <div className="subtabs" role="tablist" data-ui="Content.subtabs">
          {SUBTABS.map((t) => (
            <button key={t.id} role="tab" className="subtab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        {tab === 'rifts' && <RiftsHead ctx={ctx} city={city} setCity={setCity} risk={riskFilter} setRisk={setRisk} />}
        {tab === 'recruit' && <RecruitHead />}
      </div>
      {tab === 'rifts' && <RiftsList ctx={ctx} city={city} risk={riskFilter} />}
      {tab === 'recruit' && <RecruitList ctx={ctx} list={recruitable} />}
      {(tab === 'tower' || tab === 'boss') && (
        <div className="pg" data-role="page">
          <Card className="col" style={{ padding: '24px 16px', alignItems: 'center', gap: 6 }}>
            <span className="t14 m">준비 중</span>
          </Card>
        </div>
      )}
      <div style={{ height: 12, flex: 'none' }} />
    </Screen>
  );
}

// ── 리프트 탭 ─────────────────────────────────────────

function useRisks(ctx: Ctx): RiskLookup {
  const s = ctx.game.state;
  let cache = riskCache.get(s);
  if (!cache) riskCache.set(s, (cache = new Map()));
  const c = cache;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  // 목록을 먼저 그리고 위험도는 하나씩 채운다(013의 지연 계산 그대로)
  useEffect(() => {
    let h = 0;
    const step = () => {
      const next = s.rifts.find((r) => !c.has(r.id));
      if (!next) return;
      c.set(next.id, riftAutoRisk(tables, s, next));
      bump();
      h = window.setTimeout(step, 0);
    };
    h = window.setTimeout(step, 0);
    return () => window.clearTimeout(h);
  }, [s, c]);
  return (id) => c.get(id);
}

function RiftsHead({ ctx, city, setCity, risk, setRisk }: { ctx: Ctx; city: string; setCity: (c: string) => void; risk: string | null; setRisk: (r: string | null) => void }) {
  const s = ctx.game.state;
  const lookup = useRisks(ctx);
  const counts = new Map<string, number>();
  for (const r of s.rifts.filter((x) => x.cityId === city)) {
    const k = lookup(r.id)?.estimate.worst.id;
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return (
    <>
      <ChipRow label="도시" data-ui="Content.cities">
        {cityChips(tables, s).map((c) => (
          <Chip key={c.cityId} on={c.cityId === city} onClick={() => setCity(c.cityId)}>
            {cityName(c.cityId)} {c.count}
          </Chip>
        ))}
      </ChipRow>
      <div className="risk-sum" role="group" aria-label="위험도 구간" data-ui="Content.riskSummary">
        {tables.combatPower.riskTiers.map((t) => (
          <button
            key={t.id}
            className={`risk-sum-item ${risk && risk !== t.id ? 'dimmed' : ''}`}
            data-risk={t.id}
            aria-pressed={risk === t.id}
            onClick={() => setRisk(risk === t.id ? null : t.id)}
          >
            <i />
            <span>
              {t.name} {counts.get(t.id) ?? 0}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function RiftsList({ ctx, city, risk }: { ctx: Ctx; city: string; risk: string | null }) {
  const s = ctx.game.state;
  const lookup = useRisks(ctx);
  const list = filterAndSortRifts(tables, s, { cityId: city, sortId: tables.ui.riftSort[0].id, tier: null, playableOnly: false }, lookup).filter(
    (r) => !risk || lookup(r.id)?.estimate.worst.id === risk,
  );
  return (
    <div className="pg" data-role="page" data-ui="Content.list">
      {list.map((r) => (
        <RiftCardView key={r.id} ctx={ctx} rift={r} risk={lookup(r.id)} />
      ))}
    </div>
  );
}

function RiftCardView({ ctx, rift, risk }: { ctx: Ctx; rift: Rift; risk: RiftAutoRisk | null | undefined }) {
  const s = ctx.game.state;
  const v = visibleRift(tables, s.facilities, rift);
  const left = daysLeft(tables, s.facilities, rift, s.day);
  const urgent = isUrgent(tables, s.facilities, rift, s.day);
  const per = zeroPerDay(tables, s.facilities, rift, s.baseCityId);
  const travel = travelDays(tables, s.baseCityId, rift.cityId);
  const prefix = `${cityName(rift.cityId)} `;
  const name = rift.name.startsWith(prefix) ? rift.name.slice(prefix.length) : rift.name;
  const range = (r: [number, number]) => (r[0] === r[1] ? num(r[0]) : `${num(r[0])}~${num(r[1])}`);
  const tierId = risk?.estimate.worst.id ?? 'none';
  const enemyEl = v.elements?.[0] ?? 'void';
  // 017b 배지: 소규모 같은 변형 라벨(rift-tiers.json variants.label), 징조(탐지소로 보일 때만)
  const variantLabel = riftVariant(tables, rift)?.label;
  const mats = Object.values(v.victoryReward.materials);
  const mat: [number, number] | null = mats.length ? [mats.reduce((a, x) => a + x[0], 0), mats.reduce((a, x) => a + x[1], 0)] : null;
  return (
    <Card className="rift-card" style={{ borderLeftColor: `var(--risk-${tierId}, var(--c-line))` }} onClick={() => ctx.go({ name: 'party', riftId: rift.id })} label={`${rift.name} 파티 편성`}>
      <Banner tier={rift.tier} risk={tierId}>
        <div className="rift-scrim" />
        <div className="rift-title col">
          <span className="row" style={{ gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-banner)' }}>
              {cityName(rift.cityId)} · {tierName(rift.tier)}
            </span>
            {variantLabel && <span className="rift-badge small">{variantLabel}</span>}
            {v.omen && <span className="rift-badge omen">징조</span>}
          </span>
          <span className="rift-name">{name}</span>
        </div>
        {left && <span className={`rift-dday ${urgent ? 'urgent' : ''}`}>{left[1] === 0 ? 'D-0' : left[0] === left[1] ? `D-${left[0]}` : `D-${left[0]}~${left[1]}`}</span>}
        {risk && (
          <span style={{ position: 'absolute', right: 8, bottom: 6 }}>
            <RiskPill best={risk.estimate.best} worst={risk.estimate.worst} />
          </span>
        )}
      </Banner>
      <div className="rift-body">
        <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
          <span className="t13 row" style={{ gap: 5 }}>
            <span className="el-dot" data-el={enemyEl} />
            적 {range(v.count)}명 · Lv {range(v.level)}
          </span>
          <span className="sub">
            이동 {travel}일 · 일 약 {num(Math.round((per[0] + per[1]) / 2))}
          </span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="row" style={{ gap: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-gold)' }}>
            <Icon name="zero" />
            {range(v.victoryReward.zero)}
          </span>
          {mat && (
            <span className="row" style={{ gap: 3, fontSize: 14, fontWeight: 700, color: 'var(--c-material-light)' }}>
              <Icon name="material" />
              {range(mat)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── 영입 탭 ───────────────────────────────────────────

type RecruitFilter = 'all' | 'ready' | 'progress' | 'locked';
let recruitFilter: RecruitFilter = 'all';
const recruitListeners = new Set<() => void>();

function RecruitHead() {
  const [f, setF] = useState<RecruitFilter>(recruitFilter);
  const set = (x: RecruitFilter) => {
    recruitFilter = x;
    setF(x);
    recruitListeners.forEach((l) => l());
  };
  const opts: { id: RecruitFilter; name: string }[] = [
    { id: 'all', name: '전체' },
    { id: 'ready', name: '영입 가능' },
    { id: 'progress', name: '진행 중' },
    { id: 'locked', name: '잠김' },
  ];
  return (
    <ChipRow label="영입 필터">
      {opts.map((o) => (
        <Chip key={o.id} on={f === o.id} onClick={() => set(o.id)}>
          {o.name}
        </Chip>
      ))}
    </ChipRow>
  );
}

function RecruitList({ ctx, list }: { ctx: Ctx; list: MercenaryState[] }) {
  const s = ctx.game.state;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    recruitListeners.add(bump);
    return () => void recruitListeners.delete(bump);
  }, []);
  const rows = list
    .map((m) => ({ m, info: recruitInfo(tables, s, m.id) }))
    .map((x) => ({ ...x, kind: (x.info.unlocked ? 'ready' : (x.info.progress?.current ?? 0) > 0 ? 'progress' : 'locked') as RecruitFilter }))
    .filter((x) => recruitFilter === 'all' || x.kind === recruitFilter)
    .sort((a, b) => ['ready', 'progress', 'locked'].indexOf(a.kind) - ['ready', 'progress', 'locked'].indexOf(b.kind) || a.info.cost - b.info.cost);
  const unlockText = (info: ReturnType<typeof recruitInfo>) =>
    info.unlock ? (info.unlock.type === 'totalVictories' ? '리프트 공략' : `${tierName(info.unlock.tier)} 공략`) : '';
  return (
    <div className="pg" data-role="page" data-ui="Recruit.cards">
      {rows.map(({ m, info, kind }) => {
        const p = info.progress;
        const ratio = info.unlocked ? 1 : p ? p.current / p.required : 0;
        const aff = m.affiliation.kind === 'faction' ? m.affiliation.factionId : null;
        const affText = aff === 'free' ? '소속 없음' : aff ? `${factionName(aff)}` : '';
        return (
          <div key={m.id} className={`card recruit-card ${kind === 'ready' ? 'ready' : ''} ${kind === 'locked' ? 'locked' : ''}`} data-role="card">
            <button className="recruit-art" aria-label={`${m.name} 상세`} onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
              <Portrait id={m.id} element={m.element} role={m.role} fill />
              {/* 017c: 최초 레벨/성장 한계. 잠김 카드는 정체를 모르니 숨긴다 */}
              {kind !== 'locked' && <LevelBadge level={m.initialLevel} cap={m.growth.cap} large ui="recruit.level" />}
              <span className="el-dot big" data-el={m.element} />
            </button>
            <div className="col grow" style={{ padding: '8px 12px', gap: 4, minWidth: 0 }}>
              <div className="row between">
                <span style={{ fontSize: 16, fontWeight: 700 }} className="ellipsis">
                  {m.name} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--c-text-sub)' }}>{roleName(m.role)}</span>
                </span>
                {kind === 'ready' ? (
                  <button
                    className="btn-sm-touch"
                    data-touch
                    onClick={() => {
                      try {
                        ctx.setState(recruit(tables, s, m.id));
                        ctx.toast(`${m.name} 영입`);
                      } catch (e) {
                        ctx.toast((e as Error).message);
                      }
                    }}
                  >
                    <span className="btn-sm primary">영입</span>
                  </button>
                ) : kind === 'locked' ? (
                  <Icon name="lock" style={{ color: 'var(--c-text-faint)' }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-info)' }}>{Math.round(ratio * 100)}%</span>
                )}
              </div>
              <span className="sub ellipsis">
                {m.profile.hometown ? cityName(m.profile.hometown) : '출신 미상'}
                {affText ? ` · ${affText}` : ''}
              </span>
              <Gauge ratio={kind === 'locked' ? 0 : ratio} color={kind === 'ready' ? 'var(--c-ok)' : 'var(--c-info)'} />
              <div className="row between" style={{ fontSize: 12 }}>
                <span>{kind === 'locked' ? '???' : info.unlocked && !p ? '조건 없음' : `${unlockText(info)} ${p?.current ?? 0}/${p?.required ?? 0}${info.unlocked ? ' 달성' : ''}`}</span>
                <span className="gold">{kind === 'locked' ? '???' : `제로 ${num(info.cost)}`}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
