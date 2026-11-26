/**
 * 콘텐츠 > 영입 탭(시안 Recruit·RecruitSheet, 지시서 023).
 * 구역 순서: summary · search · chips · ready · progress · locked (+ 바텀 시트 sheet, 목록만 스크롤하는 scroll).
 * 요약·검색·칩(RecruitHead)은 위에 고정되고 목록(RecruitList)만 스크롤한다.
 * 필터·검색·정렬은 recruitFilter.ts(순수 함수)가 맡고, 화면 상태는 탭을 바꿔도 유지하되 세이브에는 넣지 않는다.
 */
import { useState, useSyncExternalStore } from 'react';
import { CORE_STATS, tables, type CoreStatId } from '../../data';
import { GameError, mercGrowthRates, mercTraitIds, recruit, recruitUpkeepOutlook, type MercenaryState } from '../../engine/game';
import { growthStars, getTrait } from '../../engine/stats';
import { deviceSettings } from '../../app/settings';
import { Chip, ChipRow, Gauge, Icon, LevelBadge, Portrait, Sheet } from '../components';
import { cityName, elementName, num, originName, roleName, statName, term } from '../format';
import type { Ctx } from '../nav';
import {
  defaultRecruitView,
  emptyRecruitSheet,
  recruitChips,
  recruitRows,
  recruitSections,
  recruitSheetCount,
  unlockLabel,
  type RecruitKind,
  type RecruitRow,
  type RecruitSheetFilter,
  type RecruitView,
} from '../recruitFilter';

// ── 화면 상태(탭을 바꿔도 유지, 슬롯이 바뀌면 처음으로) ──
let store: { slotId: string; view: RecruitView } | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
function useView(ctx: Ctx): [RecruitView, (p: Partial<RecruitView>) => void] {
  if (store?.slotId !== ctx.game.slotId) store = { slotId: ctx.game.slotId, view: defaultRecruitView(tables) };
  const view = useSyncExternalStore(subscribe, () => store!.view);
  const set = (p: Partial<RecruitView>) => {
    store = { slotId: ctx.game.slotId, view: { ...store!.view, ...p } };
    listeners.forEach((l) => l());
  };
  return [view, set];
}

const KIND_NAME: Record<RecruitKind, string> = { ready: '영입 가능', progress: '진행 중', locked: '잠김' };
/** 출신 세력(지시서 026d) */
const affText = (m: MercenaryState) => originName(m.profile.originFaction);

/** 고정 머리: 한 줄 요약 · 검색줄(검색·필터·정렬) · 상태 칩 */
export function RecruitHead({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const [view, setView] = useView(ctx);
  const rows = recruitRows(tables, s);
  const { counts } = recruitSections(rows, view);
  const total = recruitSections(rows, { ...view, query: '', sheet: emptyRecruitSheet(), kind: null }).counts;
  const [draft, setDraft] = useState<RecruitSheetFilter | null>(null);
  const chips = recruitChips(tables);
  const sheetCount = recruitSheetCount(view.sheet);
  const draftCount = draft ? recruitSections(rows, { ...view, sheet: draft, kind: null }).counts.all : 0;
  const toggle = (axis: keyof RecruitSheetFilter, id: string) =>
    setDraft((d) => (d ? { ...d, [axis]: d[axis].includes(id) ? d[axis].filter((x) => x !== id) : [...d[axis], id] } : d));
  return (
    <>
      <div className="rc-summary" data-ui="Recruit.summary">
        <span data-ui="recruit.summary">
          영입 가능 <b className="gold">{total.ready}</b> · 진행 중 <b>{total.progress}</b> · 잠김 <b>{total.locked}</b>
        </span>
        <span>
          남은 제로 <b>{num(s.resources.zero)}</b>
        </span>
      </div>
      <div className="row" style={{ gap: 8 }} data-ui="Recruit.search">
        <label className="search-box" data-touch>
          <Icon name="search" />
          <input type="search" placeholder="이름·초성 검색" aria-label={`영입 ${term.merc} 검색`} value={view.query} onChange={(e) => setView({ query: e.target.value })} />
        </label>
        <button
          className="filter-btn"
          data-ui="recruit.filter"
          aria-label={`역할·속성·도시·출신 세력 필터${sheetCount ? ` ${sheetCount}개 적용 중` : ''}`}
          aria-pressed={sheetCount > 0}
          data-touch
          onClick={() => setDraft(view.sheet)}
        >
          <span>
            <Icon name="filter" />
            {sheetCount > 0 && <span className="filter-count">{sheetCount}</span>}
          </span>
        </button>
        <select className="sort-box" data-ui="recruit.sort" aria-label="정렬" value={view.sort} onChange={(e) => setView({ sort: e.target.value })}>
          {tables.ui.recruitSort.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ▾
            </option>
          ))}
        </select>
      </div>
      <ChipRow label="영입 상태" data-ui="Recruit.chips">
        <Chip on={view.kind === null} onClick={() => setView({ kind: null })}>
          전체 <b className="chip-n">{counts.all}</b>
        </Chip>
        {(['ready', 'progress', 'locked'] as RecruitKind[]).map((k) => (
          <Chip key={k} on={view.kind === k} onClick={() => setView({ kind: view.kind === k ? null : k })}>
            {KIND_NAME[k]} <b className="chip-n">{counts[k]}</b>
          </Chip>
        ))}
      </ChipRow>
      {draft && (
        <Sheet title="필터" onClose={() => setDraft(null)}>
          {(
            [
              ['roles', '역할', chips.roles],
              ['elements', '속성', chips.elements],
              ['cities', '도시', chips.cities],
              ['factions', '출신 세력', chips.factions],
            ] as [keyof RecruitSheetFilter, string, { id: string; name: string }[]][]
          ).map(([axis, title, items]) => (
            <div key={axis} className="filter-group" role="group" aria-label={title}>
              <span className="t13 dim">{title}</span>
              <div className="filter-chips">
                {items.map((it) => (
                  <Chip key={it.id} on={draft[axis].includes(it.id)} onClick={() => toggle(axis, it.id)}>
                    {it.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          <p className="sub" style={{ margin: 0 }}>
            잠김 {term.merc}는 정체를 모르므로 도시로만 걸러집니다.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-act" style={{ width: 112, flex: 'none' }} disabled={!recruitSheetCount(draft)} onClick={() => setDraft(emptyRecruitSheet())}>
              지우기
            </button>
            <button className="btn-act primary grow" onClick={() => (setView({ sheet: draft }), setDraft(null))}>
              {draftCount}명 보기
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** 스크롤 목록: 지금 영입 가능(큰 카드) · 진행 중(낮은 카드) · 잠김(4열 작은 카드) + 상세 시트 */
export function RecruitList({ ctx, openFirst }: { ctx: Ctx; openFirst?: boolean }) {
  const s = ctx.game.state;
  const [view] = useView(ctx);
  const { sections } = recruitSections(recruitRows(tables, s), view);
  const [sheet, setSheet] = useState<string | null>(() => (openFirst ? (sections.ready[0]?.m.id ?? null) : null));
  const [confirm, setConfirm] = useState<string | null>(null);
  const row = (id: string | null) => (id ? recruitRows(tables, s).find((r) => r.m.id === id) : undefined);
  const askRecruit = (id: string) => {
    setSheet(null);
    // 중요 행동 확인(설정): 켜져 있으면 기존 영입 확인 단계(비용·유지비 전망), 꺼져 있으면 바로 영입
    if (deviceSettings.get().confirmImportant) setConfirm(id);
    else doRecruit(id);
  };
  const doRecruit = (id: string) => {
    try {
      const m = s.mercenaries.find((x) => x.id === id)!;
      ctx.setState(recruit(tables, s, id));
      ctx.toast(`${m.name}이(가) 길드에 합류했습니다.`);
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
    setConfirm(null);
  };
  const empty = !sections.ready.length && !sections.progress.length && !sections.locked.length;
  return (
    <div className="rc-list" data-ui="Recruit.scroll" data-role="page">
      {sections.ready.length > 0 && (
        <section className="rc-sec" data-ui="Recruit.ready">
          <SecTitle name="지금 영입 가능" n={sections.ready.length} />
          {sections.ready.map((r) => (
            <ReadyCard key={r.m.id} r={r} onOpen={() => setSheet(r.m.id)} onRecruit={() => askRecruit(r.m.id)} />
          ))}
        </section>
      )}
      {sections.progress.length > 0 && (
        <section className="rc-sec" data-ui="Recruit.progress">
          <SecTitle name="진행 중" n={sections.progress.length} note={view.sort === 'recruit' ? '가까운 순' : ''} />
          {sections.progress.map((r) => (
            <ProgressCard key={r.m.id} r={r} onOpen={() => setSheet(r.m.id)} />
          ))}
        </section>
      )}
      {sections.locked.length > 0 && (
        <section className="rc-sec" data-ui="Recruit.locked">
          <SecTitle name="잠김" n={sections.locked.length} note="조건 비공개" />
          <div className="rc-locked-grid">
            {sections.locked.map((r) => (
              <button
                key={r.m.id}
                className="rc-locked"
                data-ui="recruit.card.locked"
                aria-label={`잠긴 ${term.merc}, ${cityName(r.m.profile.hometown ?? '')}`}
                onClick={() => ctx.toast(`${cityName(r.m.profile.hometown ?? '')}에서 활동하는 ${term.merc}입니다. 정체와 조건은 아직 알 수 없습니다.`)}
              >
                <span className="art">
                  <Portrait id={r.m.id} element={r.m.element} role={r.m.role} fill />
                </span>
                <span className="nm">???</span>
                <span className="ct">{cityName(r.m.profile.hometown ?? '')}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {empty && <p className="t14 dim">조건에 맞는 영입 후보가 없습니다</p>}
      {(() => {
        const r = row(sheet);
        return r && <RecruitSheet ctx={ctx} r={r} onClose={() => setSheet(null)} onRecruit={() => askRecruit(r.m.id)} />;
      })()}
      {(() => {
        const r = row(confirm);
        if (!r) return null;
        const o = recruitUpkeepOutlook(tables, s, r.m.id);
        return (
          <Sheet title={`${r.m.name} 영입`} onClose={() => setConfirm(null)}>
            <dl className="kv-list">
                <dt>영입비</dt>
                <dd>제로 {num(o.cost)}</dd>
                <dt>남는 제로</dt>
                <dd>{num(o.zeroAfter)}</dd>
                <dt>길드 하루 유지비</dt>
                <dd>
                  {num(o.dailyUpkeepBefore)} → {num(o.dailyUpkeepAfter)}
                </dd>
                <dt>수입 없이 버틸 일수</dt>
                <dd style={o.daysAffordable < tables.ui.upkeepWarnDays ? { color: 'var(--c-warn)' } : undefined}>{Number.isFinite(o.daysAffordable) ? `${o.daysAffordable}일` : '제한 없음'}</dd>
            </dl>
            <button className="btn-act primary" onClick={() => doRecruit(r.m.id)}>
              영입
            </button>
            <button className="btn-act" onClick={() => setConfirm(null)}>
              취소
            </button>
          </Sheet>
        );
      })()}
    </div>
  );
}

function SecTitle({ name, n, note }: { name: string; n: number; note?: string }) {
  return (
    <div className="rc-sec-title">
      <span>
        {name} <b className="gold">{n}</b>
      </span>
      <span className="sub">{note}</span>
    </div>
  );
}

function ReadyCard({ r, onOpen, onRecruit }: { r: RecruitRow; onOpen: () => void; onRecruit: () => void }) {
  const m = r.m;
  return (
    <div className="card rc-ready" data-ui="recruit.card.ready" data-role="card">
      <button className="rc-hit" aria-label={`${m.name} 영입 정보`} onClick={onOpen} />
      <span className="rc-art">
        <Portrait id={m.id} element={m.element} role={m.role} fill />
        <LevelBadge level={m.initialLevel} cap={m.growth.cap} large ui="recruit.level" />
        <span className="el-dot big" data-el={m.element} />
      </span>
      <div className="col grow" style={{ padding: '8px 12px', gap: 4, minWidth: 0 }}>
        <div className="row between">
          <span style={{ fontSize: 16, fontWeight: 700 }} className="ellipsis">
            {m.name} <span className="rc-role">{roleName(m.role)}</span>
          </span>
          <button className="btn-sm-touch rc-on" data-touch onClick={onRecruit}>
            <span className="btn-sm primary">영입</span>
          </button>
        </div>
        <span className="sub ellipsis">
          {cityName(m.profile.hometown ?? '')}
          {affText(m) ? ` · ${affText(m)}` : ''}
        </span>
        <div className="row between" style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--c-ok)' }}>조건 달성</span>
          <span className="gold">제로 {num(r.info.cost)}</span>
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ r, onOpen }: { r: RecruitRow; onOpen: () => void }) {
  const m = r.m;
  return (
    <button className="card rc-progress" data-ui="recruit.card.progress" data-role="card" aria-label={`${m.name} 영입 정보`} onClick={onOpen}>
      <span className="rc-art sm">
        <Portrait id={m.id} element={m.element} role={m.role} fill />
        <LevelBadge level={m.initialLevel} cap={m.growth.cap} large ui="recruit.level" />
      </span>
      <span className="col grow" style={{ padding: '8px 12px', gap: 4, minWidth: 0, justifyContent: 'center' }}>
        <span className="row between" style={{ alignItems: 'baseline' }}>
          <span className="ellipsis" style={{ fontSize: 15, fontWeight: 700 }}>
            {m.name}{' '}
            <span className="rc-role">
              {roleName(m.role)} · {cityName(m.profile.hometown ?? '')}
              {affText(m) ? ` · ${affText(m)}` : ''}
            </span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-info)', flex: 'none' }}>{Math.round(r.ratio * 100)}%</span>
        </span>
        <Gauge ratio={r.ratio} color="var(--c-info)" />
        <span className="row between" style={{ fontSize: 12 }}>
          <span>{unlockLabel(tables, r.info)}</span>
          <span className="gold">제로 {num(r.info.cost)}</span>
        </span>
      </span>
    </button>
  );
}

/** 상세 시트(시안 RecruitSheet): 초상, 이름·역할, 도시·출신 세력·속성, 레벨·성장 한계, 성장률 별, 영입 조건, 특성 칩, 상세 보기·영입 */
function RecruitSheet({ ctx, r, onClose, onRecruit }: { ctx: Ctx; r: RecruitRow; onClose: () => void; onRecruit: () => void }) {
  const m = r.m;
  const s = ctx.game.state;
  const rates = { ...tables.stats.levelGrowthRate, ...mercGrowthRates(tables, m) };
  // 대표 성장률: 별이 가장 많은 스탯(같으면 CORE_STATS 순서)
  const best = CORE_STATS.reduce<CoreStatId>((a, id) => (growthStars(tables, id, rates[id]) > growthStars(tables, a, rates[a]) ? id : a), CORE_STATS[0]);
  const stars = growthStars(tables, best, rates[best]);
  const traits = mercTraitIds(tables, m)
    .map((id, slot) => ({ id, level: tables.traits.slotUnlockLevels[slot] ?? Infinity }))
    .filter((t) => t.level <= m.growth.cap)
    .map((t) => getTrait(tables, t.id).name);
  const short = !r.info.unlocked ? '조건 미달' : s.resources.zero < r.info.cost ? '제로 부족' : '';
  return (
    <div className="st-dim" role="dialog" aria-modal="true" aria-label={`${m.name} 영입 정보`} onClick={onClose}>
      <div className="st-sheet rc-sheet" data-ui="Recruit.sheet" onClick={(e) => e.stopPropagation()}>
        <div className="st-grip" />
        <div data-ui="recruit.sheet" className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className={`rc-sheet-art ${r.kind === 'ready' ? 'ready' : ''}`}>
              <Portrait id={m.id} element={m.element} role={m.role} fill />
            </span>
            <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>
                {m.name} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-sub)' }}>{roleName(m.role)}</span>
              </span>
              <span className="t13 dim">
                {cityName(m.profile.hometown ?? '')}
                {affText(m) ? ` · ${affText(m)}` : ''} · {elementName(m.element)}
              </span>
              <span className="t13">
                레벨 {m.level} · 성장 한계 {m.growth.cap}
              </span>
              <span className="t13 dim">
                성장률 <span className="gold">{'★'.repeat(stars)}</span>
                <span style={{ color: 'var(--c-line)' }}>{'★'.repeat(5 - stars)}</span> · {statName(best)} +{(rates[best] * 100).toFixed(1)}%/Lv
              </span>
            </div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>영입 조건</span>
            <div className="row between t13">
              <span>{unlockLabel(tables, r.info)}</span>
              <span style={{ color: r.info.unlocked ? 'var(--c-ok)' : 'var(--c-warn)' }}>{r.info.unlocked ? '달성' : `${Math.round(r.ratio * 100)}%`}</span>
            </div>
            <Gauge ratio={r.ratio} color={r.info.unlocked ? 'var(--c-ok)' : 'var(--c-info)'} />
          </div>
          {traits.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {traits.map((t) => (
                <span key={t} className="rc-trait">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="rc-btn" style={{ width: 112, flex: 'none' }} onClick={() => ctx.go({ name: 'merc', mercId: m.id })}>
              상세 보기
            </button>
            <button className="rc-btn gold grow" disabled={!!short} onClick={onRecruit}>
              {short ? `${short} · 제로 ${num(r.info.cost)}` : `영입 · 제로 ${num(r.info.cost)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
