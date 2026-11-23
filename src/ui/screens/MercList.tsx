/**
 * 계약자 관리(시안 Merc, 지시서 017). 구역 순서: header · search · chips · legend · grid(4열).
 * 검색·초성·정렬·필터·일괄 레벨업은 012의 mercFilter를 쓴다. 영입은 콘텐츠의 영입 탭으로 옮겼다.
 */
import { useState } from 'react';
import { tables } from '../../data';
import { expToNextLevel, getMerc, isOnExpedition, levelUpAll, refusedToday, type GameState, type MercenaryState } from '../../engine/game';
import { assignedFacility } from '../../engine/facilities';
import { levelUpOverview } from '../../engine/status';
import { Chip, ChipRow, Icon, LogoRow, MercCard, Screen } from '../components';
import { num, term } from '../format';
import { filterAndSort, type MercListOptions } from '../mercFilter';
import type { Ctx } from '../nav';

interface ViewState {
  query: string;
  sort: string;
  status: string | null;
}
/** 상세에서 돌아와도 유지(세이브에는 넣지 않음, 슬롯이 바뀌면 처음으로) */
let remembered: { slotId: string; view: ViewState } | null = null;

/** 카드의 상태 글자와 색 */
function stateOf(s: GameState, m: MercenaryState): { text: string; cls: string; bar: string } {
  if (m.injury) return { text: `${m.injury.recoverDay}일차~`, cls: 'warn', bar: 'var(--c-bad)' };
  if (isOnExpedition(s, m.id)) return { text: '파견 중', cls: 'dim', bar: 'var(--c-info)' };
  if (assignedFacility(s.facilities, m.id)) return { text: '훈련 중', cls: 'info', bar: 'var(--c-info)' };
  if (refusedToday(s, m)) return { text: '오늘 거부', cls: 'bad', bar: 'var(--c-warn)' };
  return { text: '대기', cls: 'ok', bar: 'var(--c-ok)' };
}

export function MercList({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const [view, setViewRaw] = useState<ViewState>(() =>
    remembered?.slotId === ctx.game.slotId ? remembered.view : { query: '', sort: tables.ui.mercSort.guild[0].id, status: null },
  );
  const setView = (p: Partial<ViewState>) =>
    setViewRaw((v) => {
      const next = { ...v, ...p };
      remembered = { slotId: ctx.game.slotId, view: next };
      return next;
    });
  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const opts: MercListOptions = { tab: 'guild', sortId: view.sort, query: view.query, role: null, element: null, status: view.status, faction: null };
  const list = filterAndSort(tables, s, guild, opts);
  const o = levelUpOverview(tables, s);
  const bulkCount = o.plan.mercs;
  const bulk = () => {
    const { state, steps } = levelUpAll(tables, s);
    if (!steps.length) return ctx.toast(o.readyCount ? '아르케가 부족합니다' : '레벨업할 수 있는 계약자가 없습니다');
    ctx.setState(state);
    const fresh = steps.flatMap((x) => x.newTraits.map((t) => `${getMerc(state, x.mercId).name}: ${tables.traits.traits.find((r) => r.id === t)?.name ?? t}`));
    ctx.toast(`${new Set(steps.map((x) => x.mercId)).size}명 총 ${steps.length}레벨, 아르케 −${num(o.plan.arche)}${fresh.length ? ` · 새 특성 ${fresh.join(', ')}` : ''}`);
  };

  return (
    <Screen ctx={ctx} tab="mercs">
      <div className="pg top" data-role="page">
        <div data-ui="Merc.header">
          <LogoRow ctx={ctx} back={{ name: 'mercs' }} right={<span className="logo-meta">길드 {guild.length}명 · 전체 {s.mercenaries.length}명</span>} />
        </div>
        <div className="row" style={{ gap: 8 }} data-ui="Merc.search">
          <label className="search-box" data-touch>
            <Icon name="search" />
            <input type="search" placeholder="이름, 초성 검색" aria-label={`${term.merc} 검색`} value={view.query} onChange={(e) => setView({ query: e.target.value })} />
          </label>
          <select className="sort-box" aria-label="정렬" value={view.sort} onChange={(e) => setView({ sort: e.target.value })}>
            {tables.ui.mercSort.guild.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ▾
              </option>
            ))}
          </select>
        </div>
        <ChipRow label="필터" data-ui="Merc.chips">
          <Chip on={view.status === null} onClick={() => setView({ status: null })}>
            전체
          </Chip>
          {tables.ui.mercQuickFilters.map((f) => (
            <Chip key={f.id} on={view.status === f.id} onClick={() => setView({ status: view.status === f.id ? null : f.id })}>
              {f.name}
            </Chip>
          ))}
          <Chip accent onClick={bulk} label={`일괄 레벨업 ${bulkCount}명`}>
            일괄 레벨업 {bulkCount}
          </Chip>
        </ChipRow>
        <div className="legend" data-ui="Merc.legend">
          <span>성장 한계</span>
          {tables.ui.capTiers.map((t) => (
            <span key={t.id} data-cap={t.id}>
              <i />
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="pg" style={{ paddingBottom: 12 }} data-role="page">
        <div className="merc-grid" data-ui="Merc.grid">
          {list.map((m) => {
            const st = stateOf(s, m);
            const capped = m.level >= m.growth.cap;
            const need = expToNextLevel(tables, m.level, m.growth.speed);
            const up = !capped && !isOnExpedition(s, m.id) && m.exp >= need;
            return (
              <MercCard
                key={m.id}
                id={m.id}
                name={m.name}
                element={m.element}
                role={m.role}
                level={m.level}
                cap={m.growth.cap}
                expRatio={capped ? 1 : m.exp / need}
                expColor={st.bar}
                up={up}
                state={st.text}
                stateClass={st.cls}
                onClick={() => ctx.go({ name: 'merc', mercId: m.id })}
              />
            );
          })}
        </div>
        {list.length === 0 && <p className="t14 dim">조건에 맞는 {term.merc}가 없습니다</p>}
      </div>
    </Screen>
  );
}
