/**
 * 화면 틀(지시서 017 C·2항): 로고 줄, 뒤로 줄, 하단 탭(4개), 좌우 스와이프.
 * 탭 화면 4개(홈·콘텐츠·계약자·거점) 사이에서만 스와이프로 이동한다.
 */
import { useRef, type ReactNode, type TouchEvent } from 'react';
import { tables } from '../../data';
import { levelUpOverview } from '../../engine/status';
import { term } from '../format';
import type { Ctx, Route } from '../nav';
import { Icon, type IconName } from './Icon';

export type TabName = 'home' | 'rifts' | 'mercs' | 'base';
export const TAB_ORDER: TabName[] = ['home', 'rifts', 'mercs', 'base'];
const TABS: { name: TabName; label: () => string; icon: IconName }[] = [
  { name: 'home', label: () => '홈', icon: 'home' },
  { name: 'rifts', label: () => '콘텐츠', icon: 'compass' },
  { name: 'mercs', label: () => term.merc, icon: 'users' },
  { name: 'base', label: () => '거점', icon: 'base' },
];

/** 스와이프 규칙(지시서 017 2항) */
export const SWIPE = { minDx: 60, ratio: 1.5, edge: 20 };
/** 다음 화면이 들어올 방향(스와이프로 이동했을 때만) */
let enterFrom: 'left' | 'right' | null = null;

/** 스와이프 판정(순수 함수): 이동할 탭 또는 null */
export function swipeTarget(current: TabName, dx: number, dy: number, startX: number, width: number): TabName | null {
  if (startX < SWIPE.edge || startX > width - SWIPE.edge) return null;
  if (Math.abs(dx) < SWIPE.minDx || Math.abs(dx) < SWIPE.ratio * Math.abs(dy)) return null;
  const i = TAB_ORDER.indexOf(current);
  const j = dx < 0 ? i + 1 : i - 1; // 왼쪽으로 밀면 다음 탭
  return TAB_ORDER[j] ?? null;
}

/** fixed: 본문 전체가 아니라 안쪽 목록만 스크롤하는 화면(영입 탭, 지시서 023) */
export function Screen({ ctx, tab, children, footer, fixed }: { ctx?: Ctx; tab?: TabName; children: ReactNode; footer?: ReactNode; fixed?: boolean }) {
  const start = useRef<{ x: number; y: number; blocked: boolean } | null>(null);
  const anim = enterFrom;
  enterFrom = null;
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    const blocked = !!(e.target as HTMLElement).closest('[data-noswipe]');
    start.current = { x: t.clientX, y: t.clientY, blocked };
  };
  const onEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.blocked || !tab || !ctx) return;
    const t = e.changedTouches[0];
    const to = swipeTarget(tab, t.clientX - s.x, t.clientY - s.y, s.x, (e.currentTarget as HTMLElement).clientWidth);
    if (!to) return;
    enterFrom = TAB_ORDER.indexOf(to) > TAB_ORDER.indexOf(tab) ? 'left' : 'right';
    ctx.go({ name: to } as Route);
  };
  return (
    <div className="scr" onTouchStart={tab ? onStart : undefined} onTouchEnd={tab ? onEnd : undefined}>
      <main className={`scr-body shell-body ${anim ? `slide-${anim}` : ''}`} style={fixed ? { overflow: 'hidden' } : undefined}>
        {children}
      </main>
      {footer}
      {tab && ctx && <TabBar ctx={ctx} current={tab} />}
    </div>
  );
}

export function TabBar({ ctx, current }: { ctx: Ctx; current: TabName }) {
  const o = levelUpOverview(tables, ctx.game.state);
  const ready = o.readyCount - o.archeShortCount;
  return (
    <nav className="tab-bar" data-role="tab-bar" aria-label="주요 화면">
      {TABS.map((t) => (
        <button key={t.name} className="tab" aria-current={t.name === current ? 'page' : undefined} onClick={() => ctx.go({ name: t.name } as Route)}>
          {t.name === current && <span className="tab-on-bar" />}
          <Icon name={t.icon} />
          <span className="tab-name" data-role="tab-name">
            {t.label()}
          </span>
          {t.name === 'mercs' && ready > 0 && (
            <span className="tab-badge" aria-label={`레벨업 가능 ${ready}명`}>
              {ready}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** 로고 줄: 로고(홈 버튼) · 오른쪽 자리 · 톱니(설정) */
export function LogoRow({ ctx, right, back }: { ctx: Ctx; right?: ReactNode; back?: Route }) {
  return (
    <div className="logo-row" data-role="logo-row">
      <button className="logo" aria-label="홈으로" onClick={() => ctx.go({ name: 'home' })}>
        <Icon name="logo" />
        <span className="logo-text">ARCHE</span>
      </button>
      <div className="logo-right">
        {right}
        <button className="gear" aria-label="설정" onClick={() => ctx.go({ name: 'saves', back })}>
          <Icon name="gear" />
        </button>
      </div>
    </div>
  );
}

/** 뒤로 줄: 뒤로 · 제목 */
export function BackRow({ title, onBack }: { title: ReactNode; onBack: () => void }) {
  return (
    <div className="back-row">
      <button className="back-btn" aria-label="뒤로" onClick={onBack}>
        <Icon name="back" />
      </button>
      <span className="back-title">{title}</span>
    </div>
  );
}
