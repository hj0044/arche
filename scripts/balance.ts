// 레벨·등급별 승률 표. 같은 레벨의 5인 파티와 몬스터 무리를 시드 여러 개로 싸운다.
// 사용: npm run balance -- [시드 수]
import { tables } from '../src/data';
import { resolveCombat, type CombatSlot } from '../src/engine/combat';
import { createMercenary, createMonster } from '../src/engine/unit';

const seeds = Number(process.argv[2] ?? 40);
const partyRoles: [string, string, 'front' | 'back'][] = [
  ['shield', 'frost', 'front'],
  ['warrior', 'fire', 'front'],
  ['archer', 'lightning', 'back'],
  ['mage', 'wind', 'back'],
  ['healer', 'light', 'back'],
];
const party = (level: number): CombatSlot[] =>
  partyRoles.map(([role, element, row], i) => ({ unit: createMercenary(tables, { id: `p${i}`, name: role, element, role, level }), row }));
const enemyRoles = ['warrior', 'shield', 'archer', 'mage', 'commander'];
const enemies = (level: number, grade: string, count: number): CombatSlot[] =>
  enemyRoles.slice(0, count).map((role, i) => ({
    unit: createMonster(tables, { id: `e${i}`, name: role, element: 'void', role, grade, level }),
    row: tables.roles.find((r) => r.id === role)!.defaultRow,
  }));

function winRate(pl: number, el: number, grade: string, count: number, size = 5) {
  let win = 0;
  for (let s = 0; s < seeds; s++) {
    const r = resolveCombat(tables, { allies: party(pl).slice(0, size), enemies: enemies(el, grade, count), seed: `b${s}` });
    if (r.outcome === 'victory') win++;
  }
  return Math.round((win / seeds) * 100);
}

console.log('같은 레벨, 5인 파티 vs 몬스터 (승률 %)');
console.log('레벨\t하급×3\t중급×3\t상급×4\t최상급×3\t최상급×4');
for (const L of [1, 10, 30, 50, 70]) {
  console.log([L, winRate(L, L, 'low', 3), winRate(L, L, 'mid', 3), winRate(L, L, 'high', 4), winRate(L, L, 'extreme', 3), winRate(L, L, 'extreme', 4)].join('\t'));
}
console.log('\n레벨 차이 (파티 레벨 vs 중급×3 몬스터 레벨)');
for (const [pl, el] of [[1, 70], [70, 1], [5, 15], [5, 10], [30, 40], [40, 30]]) {
  console.log(`파티 Lv${pl} vs 몬스터 Lv${el}: ${winRate(pl, el, 'mid', 3)}%`);
}
console.log(`최상급×4 레벨 +5: ${winRate(65, 60, 'extreme', 4)}%`);
console.log('\n시작 규모(3인 Lv5) vs 하급×2~3');
for (const el of [1, 3, 5, 8, 12]) console.log(`몬스터 Lv${el}: ×2 ${winRate(5, el, 'low', 2, 3)}%  ×3 ${winRate(5, el, 'low', 3, 3)}%`);

// 시작 조합 4인 표본: 시작 용병 후보 4명(방패·사수·치유사·술사)의 속성·역할을 Lv5로 맞춤. 합법 등급 범위의 조건만 쓴다.
const starters = tables.roster.filter((r) => r.startingCandidate);
const startParty = (level: number): CombatSlot[] =>
  starters.map((r) => ({
    unit: createMercenary(tables, { id: r.id, name: r.name, element: r.element, role: r.role, level }),
    row: tables.roles.find((x) => x.id === r.role)!.defaultRow,
  }));
function startWinRate(level: number, grade: string, el: number, count: number) {
  const range = tables.monsterGrades.find((g) => g.id === grade)!.level;
  if (el < range[0] || el > range[1]) throw new Error(`${grade} 범위 밖 레벨: ${el}`);
  let win = 0;
  for (let s = 0; s < seeds; s++) {
    if (resolveCombat(tables, { allies: startParty(level), enemies: enemies(el, grade, count), seed: `b${s}` }).outcome === 'victory') win++;
  }
  return Math.round((win / seeds) * 100);
}
console.log(`\n시작 조합 4인(${starters.map((r) => r.name).join('·')}) Lv5`);
for (const [grade, el, count] of [['low', 12, 3], ['mid', 15, 3], ['mid', 20, 3]] as [string, number, number][]) {
  const gname = tables.monsterGrades.find((g) => g.id === grade)!.name;
  console.log(`vs ${gname} Lv${el}×${count}: ${startWinRate(5, grade, el, count)}%`);
}
