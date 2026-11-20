// 예상 위험도와 실제 승률 비교표(지시서 010). 수치 조정은 하지 않는다.
// 사용: npm run risk-check -- [실제 승률용 시드 수]
// 위험도는 보이는 정보(탐지소 Lv1·Lv2)로, 실제 승률은 실제 리프트 몬스터와 별도 시드(real:i)로 계산한다.
import { getRole, tables } from '../src/data';
import { resolveCombat, type CombatSlot } from '../src/engine/combat';
import { combatPower, estimateRisk } from '../src/engine/combatPower';
import { initialFacilities, visibleRift } from '../src/engine/facilities';
import { generateRift, riftEnemySlots } from '../src/engine/rift';
import { createRng } from '../src/engine/rng';
import { createMercenary } from '../src/engine/unit';

const seeds = Number(process.argv[2] ?? 40);
const starters = tables.roster.filter((r) => r.startingCandidate);
const party = (level: number): CombatSlot[] =>
  starters.map((r) => ({ unit: createMercenary(tables, { id: r.id, name: r.name, element: r.element, role: r.role, level }), row: getRole(tables, r.role).defaultRow }));
const fsAt = (scout: number) => ({ ...initialFacilities(tables), levels: { ...initialFacilities(tables).levels, scout } });
const order = [...tables.combatPower.riskTiers].sort((a, b) => b.minWinRate - a.minWinRate);

// 시작 4인(레벨 3~20)과 서울·도쿄 리프트 여러 개
const rifts = Array.from({ length: 10 }, (_, i) => generateRift(tables, i % 2 ? 'tokyo' : 'seoul', 1, `rc${i}`, createRng(`risk-check-${i}`)));
const levels = [3, 6, 10, 15, 20];

console.log(`| 리프트 | 실제(등급·Lv·수) | 파티 Lv | 전투력 | 위험도 Lv1(추정) | 위험도 Lv2 | 실제 승률(${seeds}회) | Lv2 단계와 실제 |`);
console.log('|---|---|---|---|---|---|---|---|');
let match = 0;
let lv1Cover = 0;
let lv1Range = 0;
let total = 0;
const mismatches: string[] = [];
for (const r of rifts) {
  const enemies = riftEnemySlots(tables, r);
  for (const lv of levels) {
    const p = party(lv);
    let win = 0;
    for (let i = 0; i < seeds; i++) if (resolveCombat(tables, { allies: p, enemies, seed: `real:${r.id}:${i}` }).outcome === 'victory') win++;
    const rate = win / seeds;
    const actualTier = order.find((t) => rate >= t.minWinRate) ?? order[order.length - 1];
    const e1 = estimateRisk(tables, p, visibleRift(tables, fsAt(1), r));
    const e2 = estimateRisk(tables, p, visibleRift(tables, fsAt(2), r));
    const fmt = (e: typeof e1) => (e.best.id === e.worst.id ? e.best.name : `${e.best.name}~${e.worst.name}`);
    const ok = e2.best.id === actualTier.id;
    const rankGap = Math.abs(order.indexOf(e2.best) - order.indexOf(actualTier));
    total++;
    const r1 = [order.indexOf(e1.best), order.indexOf(e1.worst)];
    if (order.indexOf(actualTier) >= r1[0] && order.indexOf(actualTier) <= r1[1]) lv1Cover++;
    if (e1.best.id !== e1.worst.id) lv1Range++;
    if (ok) match++;
    else if (rankGap >= 2) mismatches.push(`${r.name} Lv${Math.max(...r.enemies.map((x) => x.level))} vs 파티 Lv${lv}: 예상 ${e2.best.name}, 실제 ${Math.round(rate * 100)}%`);
    const lvlText = `${tables.monsterGrades.find((g) => g.id === r.enemies[0].grade)!.name} Lv${Math.max(...r.enemies.map((x) => x.level))} ×${r.enemies.length}`;
    console.log(`| ${r.name} | ${lvlText} | ${lv} | ${combatPower(tables, p)} | ${fmt(e1)} | ${fmt(e2)} | ${Math.round(rate * 100)}% (${actualTier.name}) | ${ok ? '일치' : rankGap >= 2 ? '두 단계 이상 차이' : '한 단계 차이'} |`);
  }
}
console.log(`\nLv2(정확한 정보) 위험도와 실제 승률 단계 일치: ${match}/${total}`);
console.log(`Lv1(추정) 구간이 실제 단계를 포함: ${lv1Cover}/${total} (구간으로 나온 경우 ${lv1Range}/${total})`);
if (mismatches.length) console.log(`두 단계 이상 어긋남:\n- ${mismatches.join('\n- ')}`);
