// 레벨·등급별 승률 표. 같은 레벨의 5인 파티와 몬스터 무리를 시드 여러 개로 싸운다.
// 사용: npm run balance -- [시드 수]
// 지시서 018: 표를 함수(balanceTable)로 분리해 변동성 실험(variance-sweep)이 다른 데이터 표로 같은 구성을 잰다.
import { pathToFileURL } from 'node:url';
import { tables as baseTables, type GameTables } from '../src/data';
import { resolveCombat, type CombatSlot } from '../src/engine/combat';
import { createMercenary, createMonster } from '../src/engine/unit';

const partyRoles: [string, string, 'front' | 'back'][] = [
  ['shield', 'frost', 'front'],
  ['warrior', 'fire', 'front'],
  ['archer', 'lightning', 'back'],
  ['mage', 'wind', 'back'],
  ['healer', 'light', 'back'],
];
const enemyRoles = ['warrior', 'shield', 'archer', 'mage', 'commander'];

export interface BalanceRow {
  /** 구성 이름(표와 비교용) */
  key: string;
  /** 승률 0~1 */
  rate: number;
}

/** balance 표의 모든 구성(45개)의 승률 */
export function balanceTable(tables: GameTables, seeds: number): BalanceRow[] {
  const party = (level: number): CombatSlot[] =>
    partyRoles.map(([role, element, row], i) => ({ unit: createMercenary(tables, { id: `p${i}`, name: role, element, role, level }), row }));
  const enemies = (level: number, grade: string, count: number): CombatSlot[] =>
    enemyRoles.slice(0, count).map((role, i) => ({
      unit: createMonster(tables, { id: `e${i}`, name: role, element: 'void', role, grade, level }),
      row: tables.roles.find((r) => r.id === role)!.defaultRow,
    }));
  const run = (allies: CombatSlot[], foes: () => CombatSlot[]) => {
    let win = 0;
    for (let s = 0; s < seeds; s++) if (resolveCombat(tables, { allies, enemies: foes(), seed: `b${s}` }).outcome === 'victory') win++;
    return win / seeds;
  };
  const winRate = (pl: number, el: number, grade: string, count: number, size = 5) => run(party(pl).slice(0, size), () => enemies(el, grade, count));
  const rows: BalanceRow[] = [];
  const gname = (g: string) => tables.monsterGrades.find((x) => x.id === g)!.name;
  for (const L of [1, 10, 30, 50, 70])
    for (const [g, c] of [['low', 3], ['mid', 3], ['high', 4], ['extreme', 3], ['extreme', 4]] as [string, number][]) rows.push({ key: `5인 Lv${L} vs ${gname(g)}×${c}`, rate: winRate(L, L, g, c) });
  for (const [pl, el] of [[1, 70], [70, 1], [5, 15], [5, 10], [30, 40], [40, 30]]) rows.push({ key: `5인 Lv${pl} vs ${gname('mid')} Lv${el}×3`, rate: winRate(pl, el, 'mid', 3) });
  rows.push({ key: `최상급×4 레벨 +5`, rate: winRate(65, 60, 'extreme', 4) });
  for (const el of [1, 3, 5, 8, 12]) for (const c of [2, 3]) rows.push({ key: `3인 Lv5 vs ${gname('low')} Lv${el}×${c}`, rate: winRate(5, el, 'low', c, 3) });
  // 시작 조합 4인 표본: 시작 계약자 후보 4명의 속성·역할을 Lv5로 맞춤. 합법 등급 범위의 조건만 쓴다.
  const starters = tables.roster.filter((r) => r.startingCandidate);
  const startParty = starters.map((r) => ({
    unit: createMercenary(tables, { id: r.id, name: r.name, element: r.element, role: r.role, level: 5 }),
    row: tables.roles.find((x) => x.id === r.role)!.defaultRow,
  }));
  for (const [grade, el, count] of [['low', 12, 3], ['mid', 15, 3], ['mid', 20, 3]] as [string, number, number][]) {
    const range = tables.monsterGrades.find((g) => g.id === grade)!.level;
    if (el < range[0] || el > range[1]) throw new Error(`${grade} 범위 밖 레벨: ${el}`);
    rows.push({ key: `시작 4인 Lv5 vs ${gname(grade)} Lv${el}×${count}`, rate: run(startParty, () => enemies(el, grade, count)) });
  }
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tables = baseTables;
  const seeds = Number(process.argv[2] ?? 40);
  const rows = balanceTable(tables, seeds);
  const p = (key: string) => Math.round(rows.find((r) => r.key === key)!.rate * 100);
  const gname = (g: string) => tables.monsterGrades.find((x) => x.id === g)!.name;
  console.log('같은 레벨, 5인 파티 vs 몬스터 (승률 %)');
  console.log('레벨\t하급×3\t중급×3\t상급×4\t최상급×3\t최상급×4');
  for (const L of [1, 10, 30, 50, 70])
    console.log([L, ...([['low', 3], ['mid', 3], ['high', 4], ['extreme', 3], ['extreme', 4]] as [string, number][]).map(([g, c]) => p(`5인 Lv${L} vs ${gname(g)}×${c}`))].join('\t'));
  console.log('\n레벨 차이 (파티 레벨 vs 중급×3 몬스터 레벨)');
  for (const [pl, el] of [[1, 70], [70, 1], [5, 15], [5, 10], [30, 40], [40, 30]]) console.log(`파티 Lv${pl} vs 몬스터 Lv${el}: ${p(`5인 Lv${pl} vs ${gname('mid')} Lv${el}×3`)}%`);
  console.log(`최상급×4 레벨 +5: ${p('최상급×4 레벨 +5')}%`);
  console.log('\n시작 규모(3인 Lv5) vs 하급×2~3');
  for (const el of [1, 3, 5, 8, 12]) console.log(`몬스터 Lv${el}: ×2 ${p(`3인 Lv5 vs ${gname('low')} Lv${el}×2`)}%  ×3 ${p(`3인 Lv5 vs ${gname('low')} Lv${el}×3`)}%`);
  const starters = tables.roster.filter((r) => r.startingCandidate);
  console.log(`\n시작 조합 4인(${starters.map((r) => r.name).join('·')}) Lv5`);
  for (const [grade, el, count] of [['low', 12, 3], ['mid', 15, 3], ['mid', 20, 3]] as [string, number, number][])
    console.log(`vs ${gname(grade)} Lv${el}×${count}: ${p(`시작 4인 Lv5 vs ${gname(grade)} Lv${el}×${count}`)}%`);
}
