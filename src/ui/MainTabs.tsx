import { term } from './format';
import { tables } from '../data';
import { levelUpOverview } from '../engine/status';
import type { Ctx, Route } from './nav';

const TABS: { name: Route['name']; label: string; route: Route }[] = [
  { name: 'home', label: '홈', route: { name: 'home' } },
  { name: 'rifts', label: '리프트', route: { name: 'rifts' } },
  { name: 'mercs', label: term.merc, route: { name: 'mercs' } },
  { name: 'base', label: '거점', route: { name: 'base' } },
  { name: 'saves', label: '저장', route: { name: 'saves' } },
];

/** 하단 고정 탭과 "다음 날" 버튼. 한 손 조작을 위해 화면 아래에 둔다. */
export function MainTabs({ ctx, current }: { ctx: Ctx; current: Route['name'] }) {
  const o = levelUpOverview(tables, ctx.game.state);
  const ready = o.readyCount - o.archeShortCount;
  return (
    <div className="maintabs">
      <button className="btn primary block next-day" onClick={ctx.nextDay} disabled={ctx.busy}>
        {ctx.busy ? '진행 중…' : `다음 날로 (${ctx.game.state.day + 1}일차)`}
      </button>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.name}
            className={`tab ${t.name === current ? 'on' : ''}`}
            aria-current={t.name === current ? 'page' : undefined}
            onClick={() => ctx.go(t.route)}
          >
            {t.label}
            {t.name === 'mercs' && ready > 0 && (
              <span className="tab-badge" aria-label={`레벨업 가능 ${ready}명`}>
                {ready}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
