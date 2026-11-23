import { useState } from 'react';
import { tables } from '../../data';
import { expToNextLevel, isOnExpedition, recruitInfo, refusedToday, type GameState, type MercenaryState } from '../../engine/game';
import { assignedFacility, getFacility } from '../../engine/facilities';
import { guildStatusSummary, trainingAccess } from '../../engine/status';
import { AppShell } from '../AppShell';
import { BulkLevelUp } from '../BulkLevelUp';
import { Bar, ChipRow, ElementTag, LoyaltyBadge, RoleTag, Segmented } from '../components';
import { cityName, factionName, growthSpeedName, injuryText, num, term, josa } from '../format';
import { MainTabs } from '../MainTabs';
import { filterAndSort, filterChips, type MercListOptions } from '../mercFilter';
import type { Ctx } from '../nav';

type Tab = 'guild' | 'recruit';
interface ViewState {
  tab: Tab;
  query: string;
  sort: Record<Tab, string>;
  role: string | null;
  element: string | null;
  status: string | null;
  faction: string | null;
  /** 칩 줄을 펼쳤는가 */
  open: boolean;
}
const initialView = (): ViewState => ({
  tab: 'guild',
  query: '',
  sort: { guild: tables.ui.mercSort.guild[0].id, recruit: tables.ui.mercSort.recruit[0].id },
  role: null,
  element: null,
  status: null,
  faction: null,
  open: false,
});
/** 용병 상세에서 돌아와도 정렬·검색·필터를 유지한다(세이브에는 넣지 않음, 슬롯이 바뀌면 처음으로). */
let remembered: { slotId: string; view: ViewState } | null = null;

function GuildStatusPill({ s, m }: { s: GameState; m: MercenaryState }) {
  if (m.injury)
    return (
      <span className="pill bad">
        {injuryText(m.injury)}
      </span>
    );
  if (isOnExpedition(s, m.id)) return <span className="pill">파견 중</span>;
  const f = assignedFacility(s.facilities, m.id);
  if (f) return <span className="pill">{getFacility(tables, f).name} 배치</span>;
  if (refusedToday(s, m)) return <span className="pill bad">오늘 거부</span>;
  return <span className="pill ok">출전 가능</span>;
}

function GuildCard({ ctx, m }: { ctx: Ctx; m: MercenaryState }) {
  const s = ctx.game.state;
  const capped = m.level >= m.growth.cap;
  const need = expToNextLevel(tables, m.level, m.growth.speed);
  const ready = !capped && m.exp >= need && !isOnExpedition(s, m.id);
  return (
    <button className={`merc-card ${ready ? 'ready' : ''}`} onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
      <div className="merc-line">
        <span className="strong">
          {m.name} <span className="muted small">Lv{m.level}</span>
          {m.isProtagonist && <span className="pill small"> 주인공</span>}
        </span>
        <GuildStatusPill s={s} m={m} />
      </div>
      <div className="tags">
        <ElementTag id={m.element} />
        <RoleTag id={m.role} />
        {m.loyalty && <LoyaltyBadge value={m.loyalty.value} />}
      </div>
      <div className="merc-exp">
        <Bar value={capped ? need : m.exp} max={need} kind="exp" />
        <span className={`small ${ready ? 'ok strong' : 'muted'}`}>
          {capped ? '한계' : ready ? '레벨업 가능' : `다음 레벨까지 ${num(need - m.exp)}`}
        </span>
      </div>
    </button>
  );
}

function RecruitCard({ ctx, m }: { ctx: Ctx; m: MercenaryState }) {
  const s = ctx.game.state;
  const info = recruitInfo(tables, s, m.id);
  const faction = m.affiliation.kind === 'faction' ? factionName(m.affiliation.factionId) : '무소속';
  return (
    <button className="merc-card" onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
      <div className="merc-line">
        <span className="strong">
          {m.name} <span className="muted small">Lv{m.level}</span>
        </span>
        {!info.unlocked ? (
          <span className="pill">
            잠김 {info.progress?.current}/{info.progress?.required}
          </span>
        ) : (
          <span className={`pill ${s.resources.zero >= info.cost ? 'ok' : 'bad'}`}>제로 {num(info.cost)}</span>
        )}
      </div>
      <div className="tags">
        <ElementTag id={m.element} />
        <RoleTag id={m.role} />
      </div>
      <div className="merc-sub">
        {m.profile.hometown ? `${cityName(m.profile.hometown)} 출신` : '출신 미상'} · {faction} · 한계 {m.growth.cap} · {growthSpeedName(m.growth.speed)}
      </div>
    </button>
  );
}

export function MercList({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const [view, setViewRaw] = useState<ViewState>(() => (remembered?.slotId === ctx.game.slotId ? remembered.view : initialView()));
  const setView = (patch: Partial<ViewState>) =>
    setViewRaw((v) => {
      const next = { ...v, ...patch };
      remembered = { slotId: ctx.game.slotId, view: next };
      return next;
    });
  const tab = view.tab;
  const chips = filterChips(tables);

  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const recruitable = s.mercenaries.filter((m) => recruitInfo(tables, s, m.id).eligible);
  const opts: MercListOptions = {
    tab,
    sortId: view.sort[tab],
    query: view.query,
    role: view.role,
    element: view.element,
    status: tab === 'guild' ? view.status : null,
    faction: tab === 'recruit' ? view.faction : null,
  };
  const list = filterAndSort(tables, s, tab === 'guild' ? guild : recruitable, opts);
  const activeCount = [opts.role, opts.element, opts.status, opts.faction].filter(Boolean).length;
  const filtered = !!(opts.query || activeCount);
  const sortName = tables.ui.mercSort[tab].find((o) => o.id === opts.sortId)?.name;
  const clear = () => setView({ query: '', role: null, element: null, status: null, faction: null });

  const sum = guildStatusSummary(tables, s);
  const train = trainingAccess(tables, s, '');

  return (
    <AppShell title={term.merc} subtitle={`제로 ${num(s.resources.zero)} · 아르케 ${num(s.resources.arche)}`} footer={<MainTabs ctx={ctx} current="mercs" />}>
      <Segmented
        value={tab}
        onChange={(t) => setView({ tab: t })}
        options={[
          { value: 'guild', label: `길드 ${guild.length}` },
          { value: 'recruit', label: `영입 ${recruitable.length}` },
        ]}
      />
      {tab === 'guild' && (
        <>
          <div className="merc-summary" aria-label="길드 상황">
            <span className="strong">출전 가능 {sum.available}</span>
            <span>부상 {sum.blocked.injured}</span>
            <span>파견 {sum.blocked.expedition}</span>
            <span>훈련 {sum.blocked.training}</span>
            {train.built && (
              <span className="muted">
                훈련소 칸 {train.used}/{train.slots}
              </span>
            )}
          </div>
          <BulkLevelUp ctx={ctx} />
        </>
      )}

      <div className="list-tools">
        <input
          type="search"
          placeholder="이름·초성 검색"
          aria-label={`${term.merc} 검색`}
          value={view.query}
          onChange={(e) => setView({ query: e.target.value })}
        />
        <button className={`btn small ${activeCount ? 'on-filter' : ''}`} aria-expanded={view.open} onClick={() => setView({ open: !view.open })}>
          필터·정렬{activeCount ? ` ${activeCount}` : ''} {view.open ? '▴' : '▾'}
        </button>
      </div>
      {view.open && (
        <div className="filter-panel">
          <select aria-label="정렬" value={view.sort[tab]} onChange={(e) => setView({ sort: { ...view.sort, [tab]: e.target.value } })}>
            {tables.ui.mercSort[tab].map((o) => (
              <option key={o.id} value={o.id}>
                정렬: {o.name}
              </option>
            ))}
          </select>
          <ChipRow label="역할" items={chips.roles} value={view.role} onChange={(v) => setView({ role: v })} />
          <ChipRow label="속성" items={chips.elements} value={view.element} onChange={(v) => setView({ element: v })} elementColor />
          {tab === 'guild' ? (
            <ChipRow label="상태" items={chips.statuses} value={view.status} onChange={(v) => setView({ status: v })} />
          ) : (
            <ChipRow label="세력" items={tables.factions} value={view.faction} onChange={(v) => setView({ faction: v })} />
          )}
        </div>
      )}
      {tab === 'recruit' && view.sort.recruit === 'hometownFirst' && (
        <p className="hint">고향이 {cityName(s.baseCityId)}인 {term.merc}{josa(term.merc, '이', '가')} 먼저 보이고, 다른 도시 출신은 영입비가 더 들 수 있습니다.</p>
      )}

      <div className="merc-line small list-status">
        <span className="muted">
          {list.length}명 · {sortName}
        </span>
        {filtered && (
          <button className="link" onClick={clear}>
            필터 해제
          </button>
        )}
      </div>
      {list.length === 0 &&
        (filtered ? (
          <div className="panel">
            <p className="muted">조건에 맞는 {term.merc}{josa(term.merc, '이', '가')} 없습니다</p>
            <button className="btn block" onClick={clear}>
              필터 해제
            </button>
          </div>
        ) : (
          <p className="muted">없습니다.</p>
        ))}
      <ul className="rows">
        {list.map((m) => (
          <li key={m.id}>{tab === 'guild' ? <GuildCard ctx={ctx} m={m} /> : <RecruitCard ctx={ctx} m={m} />}</li>
        ))}
      </ul>
    </AppShell>
  );
}
