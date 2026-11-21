// 경제·성장 값 조합별 시뮬레이션 비교표(마크다운). 데이터 파일은 바꾸지 않고 메모리에서만 값을 바꾼다.
// 사용: npm run economy-sweep -- [일수] [시드 수]
// 자동 플레이 정책은 loyalty-sweep과 같다(서울 개방자 시작, 3명 이상이면 최저 레벨 리프트, 제로 ≥ 영입비+300이면 영입, 가능하면 레벨업).
import { tables as base, type GameTables } from '../src/data';
import { advanceDay, canLevelUp, dispatch, isAvailable, levelUp, newGame, recruit, recruitInfo, riftLevel, type GameState } from '../src/engine/game';

const [daysArg = '40', seedCountArg = '6'] = process.argv.slice(2);
const days = Number(daysArg);
const seedPool = ['days', 'audit-20261120', 'audit-2', 'audit-3', 'audit-4', 'audit-5', 'audit-6', 'audit-7', 'audit-8', 'audit-9'];
const seeds = Array.from({ length: Number(seedCountArg) }, (_, i) => seedPool[i] ?? `audit-${i + 1}`);

interface Combo { name: string; apply: (t: GameTables) => void }
const setExp = (t: GameTables, v: number, r: number, d: number) => { t.progression.expByOutcome.victory = v; t.progression.expByOutcome.retreat = r; t.progression.expByOutcome.defeat = d; };
const combos: Combo[] = [
  { name: '기본값', apply: () => {} },
  { name: '경험치 40/20/10', apply: (t) => setExp(t, 40, 20, 10) },
  { name: '유지비 기본 3', apply: (t) => { t.progression.upkeepZeroPerDay.base = 3; } },
  { name: '경험치 40/20/10 + 유지비 기본 3', apply: (t) => { setExp(t, 40, 20, 10); t.progression.upkeepZeroPerDay.base = 3; } },
  { name: '경험치 45/22/11 + 유지비 기본 3', apply: (t) => { setExp(t, 45, 22, 11); t.progression.upkeepZeroPerDay.base = 3; } },
];


function play(t: GameTables, seed: string) {
  let s: GameState = newGame(t, { seed, guildName: '시험 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
  const rowOf = (role: string) => t.roles.find((r) => r.id === role)!.defaultRow;
  const o = { wins: 0, defeats: 0, unpaid: 0, minZero: Infinity, tier: {} as Record<string, [number, number]> };
  const tierOf = new Map<string, string>();
  for (let d = 0; d < days; d++) {
    for (const m of s.mercenaries) {
      const info = recruitInfo(t, s, m.id);
      if (info.eligible && info.unlocked && s.resources.zero >= info.cost + 300) s = recruit(t, s, m.id);
    }
    const free = s.mercenaries.filter((m) => isAvailable(s, m.id));
    const target = s.rifts.filter((r) => r.cityId === s.baseCityId).sort((a, b) => riftLevel(a) - riftLevel(b))[0];
    if (free.length >= Math.min(3, s.mercenaries.filter((m) => m.affiliation.kind === 'guild').length) && target) {
      s = dispatch(t, s, target.id, free.slice(0, 5).map((m) => ({ mercId: m.id, row: rowOf(m.role) })));
      const ex = s.expeditions[s.expeditions.length - 1];
      if (ex) tierOf.set(ex.id, ex.rift.tier);
    }
    for (const m of s.mercenaries) while (canLevelUp(t, s, m.id)) s = levelUp(t, s, m.id);
    const { state, events } = advanceDay(t, s);
    s = state;
    for (const e of events as any[]) {
      if (e.type === 'returned') { const tr = tierOf.get(e.expeditionId) ?? '?'; (o.tier[tr] ??= [0, 0])[e.outcome === 'victory' ? 0 : 1]++; }
      if (e.type === 'returned' && e.outcome === 'victory') o.wins++;
      if (e.type === 'returned' && e.outcome === 'defeat') o.defeats++;
      if (e.type === 'upkeep' && e.unpaid > 0) o.unpaid++;
    }
    o.minZero = Math.min(o.minZero, s.resources.zero);
  }
  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const top = guild.map((m) => m.level).sort((a, b) => b - a).slice(0, 5);
  const avgLv = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  return { ...o, zero: s.resources.zero, size: guild.length, avgLv };
}

console.log(`### ${days}일, 시드 ${seeds.length}개`);
console.log('');
console.log('| 조합 | 승리 | 패배 | 미납 이벤트 | 최종 제로 평균 | 상위5 평균 레벨 | 길드 인원 | 균열 승/패 | 관문 승/패 | 항로 승/패 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const c of combos) {
  const t = structuredClone(base);
  c.apply(t);
  const rs = seeds.map((sd) => play(t, sd));
  const sum = (k: 'wins' | 'defeats' | 'unpaid') => rs.reduce((a, r) => a + r[k], 0);
  const avg = (f: (r: (typeof rs)[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  const tr = (id: string) => { const a = rs.reduce((x, r) => x + (r.tier[id]?.[0] ?? 0), 0); const b = rs.reduce((x, r) => x + (r.tier[id]?.[1] ?? 0), 0); return `${a}/${b}`; };
  console.log(`| ${c.name} | ${sum('wins')} | ${sum('defeats')} | ${sum('unpaid')} | ${avg((r) => r.zero)} | ${avg((r) => r.avgLv)} | ${avg((r) => r.size)} | ${tr('crack')} | ${tr('gate')} | ${tr('route')} |`);
}
