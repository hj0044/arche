import { tables } from '../data';
import { guildStatusSummary } from '../engine/status';
import { num } from './format';
import type { Ctx } from './nav';

/** 지금 상황: 출전 가능 인원, 가장 빠른 복귀·회복일, 그때까지 유지비(지시서 011) */
export function StatusSummary({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const sum = guildStatusSummary(tables, s);
  const b = sum.blocked;
  const reasons = [
    b.injured ? `부상 ${b.injured}명` : null,
    b.expedition ? `파견 중 ${b.expedition}명` : null,
    b.training ? `훈련 ${b.training}명` : null,
    b.refused ? `거부 ${b.refused}명` : null,
  ].filter(Boolean);
  return (
    <section className={`panel status-summary ${sum.short ? 'short' : ''}`} aria-label="지금 상황">
      <div className="status-head">
        <span className="strong">
          출전 가능 {sum.available} / {sum.total}명
        </span>
        {sum.short && <span className="pill bad">⚠ 인원 부족</span>}
      </div>
      {(sum.short || reasons.length > 0) && reasons.length > 0 && <p className="small muted">{reasons.join(' · ')}</p>}
      {sum.nextReturnDay !== null && (
        <p className="small">
          가장 빠른 복귀 {sum.nextReturnDay}일차({Math.max(0, sum.nextReturnDay - s.day)}일 뒤) · 그때까지 유지비 제로 {num(sum.upkeepUntilReturn ?? 0)}
        </p>
      )}
      {sum.nextRecoveryDay !== null && (
        <p className="small">
          가장 빠른 회복 {sum.nextRecoveryDay}일차({Math.max(0, sum.nextRecoveryDay - s.day)}일 뒤) · 그때까지 유지비 제로 {num(sum.upkeepUntilRecovery ?? 0)}
        </p>
      )}
      {b.training > 0 && sum.short && (
        <button className="link" onClick={() => ctx.go({ name: 'base' })}>
          훈련 배치 해제하러 거점으로 ›
        </button>
      )}
    </section>
  );
}
