import { useState } from 'react';
import { tables } from '../data';
import { getMerc, levelUpAll, type LevelUpStep } from '../engine/game';
import { levelUpOverview } from '../engine/status';
import { num, term, josa, traitName } from './format';
import type { Ctx } from './nav';

interface Result {
  mercs: number;
  levels: number;
  arche: number;
  perMerc: { mercId: string; name: string; from: number; to: number; newTraits: string[] }[];
}

function summarize(ctxNames: (id: string) => string, steps: LevelUpStep[]): Result {
  const by = new Map<string, { from: number; to: number; newTraits: string[] }>();
  for (const st of steps) {
    const cur = by.get(st.mercId);
    by.set(st.mercId, { from: cur?.from ?? st.from, to: st.to, newTraits: [...(cur?.newTraits ?? []), ...st.newTraits] });
  }
  return {
    mercs: by.size,
    levels: steps.length,
    arche: steps.reduce((a, x) => a + x.cost, 0),
    perMerc: [...by].map(([mercId, v]) => ({ mercId, name: ctxNames(mercId), ...v })),
  };
}

/**
 * 일괄 레벨업(지시서 012 1): 미리보기와 합계, 바로 실행, 결과 요약.
 * 용병 화면, 하루 결과, 길드 홈이 같은 컴포넌트를 쓴다.
 * hideWhenNone: 경험치가 찬 용병이 없으면 아무것도 그리지 않는다(하루 결과·홈).
 */
export function BulkLevelUp({ ctx, hideWhenNone = false, title }: { ctx: Ctx; hideWhenNone?: boolean; title?: string }) {
  const s = ctx.game.state;
  const [result, setResult] = useState<Result | null>(null);
  const o = levelUpOverview(tables, s);
  const readyNow = o.readyCount - o.archeShortCount;
  if (hideWhenNone && o.readyCount === 0 && !result) return null;

  const run = () => {
    const { state, steps } = levelUpAll(tables, s);
    if (steps.length === 0) return;
    setResult(summarize((id) => getMerc(state, id).name, steps));
    ctx.setState(state);
  };
  const disabledReason = o.plan.levels > 0 ? null : o.readyCount > 0 ? '아르케 부족' : '경험치 부족';

  return (
    <section className="panel bulk-levelup" aria-label="일괄 레벨업">
      {title && o.readyCount > 0 && (
        <div className="strong">
          {title} {readyNow}명{readyNow > 0 && ' · 일괄 레벨업'}
        </div>
      )}
      {o.archeShortCount > 0 && <p className="small warn">경험치는 찼지만 아르케 부족 {o.archeShortCount}명</p>}
      {o.readyCount > 0 && (
        <p className="small muted">
          합계 필요 아르케 {num(o.totalCostOneEach)}, 보유 {num(o.arche)} → {readyNow}명 가능
        </p>
      )}
      <button className="btn primary block" disabled={!!disabledReason} onClick={run}>
        {disabledReason ? `일괄 레벨업 · ${disabledReason}` : `일괄 레벨업 (${o.plan.mercs}명, 아르케 ${num(o.plan.arche)})`}
      </button>
      {o.plan.levels > o.plan.mercs && <p className="hint">한 {term.merc}{josa(term.merc, '이', '가')} 여러 번 오를 수 있습니다(총 {o.plan.levels}레벨). 낮은 레벨부터 올립니다.</p>}
      {result && (
        <div className="bulk-result" role="status">
          <p className="small ok strong">
            {result.mercs}명 총 {result.levels}레벨, 아르케 −{num(result.arche)}
          </p>
          <ul className="bulk-list">
            {result.perMerc.map((r) => (
              <li key={r.mercId} className="small">
                <button className="link" onClick={() => ctx.go({ name: 'merc', mercId: r.mercId })}>
                  {r.name} Lv{r.from} → Lv{r.to}
                </button>
                {r.newTraits.length > 0 && <span className="ok"> · 새 특성: {r.newTraits.map(traitName).join(', ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
