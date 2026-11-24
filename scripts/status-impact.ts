// 지시서 020: 상태 효과가 승패에 미친 영향. balance 표 전체를 특정 상태 효과를 뺀 데이터로 다시 재서 비교한다.
// 사용: npm run status-impact -- [시드 수]
import { tables, type GameTables } from '../src/data';
import { balanceTable } from './balance';

const seeds = Number(process.argv[2] ?? 40);
/** 스킬에서 해당 상태 효과(applies)를 뺀 표 */
const without = (ids: string[]): GameTables => ({
  ...tables,
  skills: tables.skills.map((s) => (s.applies ? { ...s, applies: s.applies.filter((a) => !ids.includes(a.status)) } : s)),
});
const cases: [string, GameTables][] = [
  ['전체', tables],
  ['기절 뺌', without(['stun'])],
  ['표식 뺌', without(['mark'])],
  ['기절·표식 뺌', without(['stun', 'mark'])],
  ['상태 효과 전부 뺌', without(tables.statusEffects.effects.map((e) => e.id))],
];
const results = cases.map(([name, t]) => [name, balanceTable(t, seeds)] as const);
const keys = results[0][1].map((r) => r.key).filter((k) => /최상급×4|상급×4|중급 Lv15|Lv12×3/.test(k));
console.log(['구성', ...cases.map(([n]) => n)].join('\t'));
for (const k of keys) console.log([k, ...results.map(([, rows]) => Math.round(rows.find((r) => r.key === k)!.rate * 100))].join('\t'));
// 평균 승률 차
const mean = (rows: { rate: number }[]) => rows.reduce((a, r) => a + r.rate, 0) / rows.length;
console.log(['전체 평균', ...results.map(([, rows]) => `${Math.round(mean(rows) * 1000) / 10}`)].join('\t'));
