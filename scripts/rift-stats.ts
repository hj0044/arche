// 도시별 평균 활성 리프트, 한도에 닿은 날 비율, 선점 비율(지시서 013 5항).
// 사용: npm run rift-stats -- [일수] [시드 수] [--no-preempt]
// 자동 플레이 정책은 npm run days와 같다(scripts/autoplay.ts). 활성 수는 하루를 넘긴 뒤의 리프트 목록(파견 중인 리프트는 빠짐).
import { tables as base, type GameTables } from '../src/data';
import { newGame, type GameState } from '../src/engine/game';
import { autoplayDay } from './autoplay';

const args = process.argv.slice(2);
const noPreempt = args.includes('--no-preempt');
const [daysArg = '60', seedCountArg = '6'] = args.filter((a) => !a.startsWith('--'));
const days = Number(daysArg);
const seedPool = ['days', 'audit-20261120', 'audit-2', 'audit-3', 'audit-4', 'audit-5', 'audit-6', 'audit-7', 'audit-8', 'audit-9'];
const seeds = Array.from({ length: Number(seedCountArg) }, (_, i) => seedPool[i] ?? `audit-${i + 1}`);

const t: GameTables = noPreempt ? { ...base, riftPreemption: { ...base.riftPreemption, baseChanceByTier: {}, defaultBaseChance: 0 } } : base;

interface CityStat { daySum: number; dayCount: number; full: number; max: number }
const city = new Map<string, CityStat>(t.cities.map((c) => [c.id, { daySum: 0, dayCount: 0, full: 0, max: 0 }]));
/** 등급별: 생긴 수(마감 있는 것), 선점, 마감 만료, 파견 출발 */
const fate = new Map<string, { spawned: number; preempted: number; expired: number; dispatched: number }>(t.riftTiers.map((r) => [r.id, { spawned: 0, preempted: 0, expired: 0, dispatched: 0 }]));
const byFaction = new Map<string, number>();

for (const seed of seeds) {
  let s: GameState = newGame(t, { seed, guildName: '시험 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
  const tierOf = new Map<string, string>(s.rifts.map((r) => [r.id, r.tier]));
  for (const r of s.rifts) fate.get(r.tier)!.spawned++;
  for (let d = 0; d < days; d++) {
    const before = new Set(s.expeditions.map((e) => e.rift.id));
    const { state, events } = autoplayDay(t, s);
    // 오늘 출발한 파견(넘기기 전 상태에서 새로 생긴 파견)
    for (const e of state.expeditions) if (!before.has(e.rift.id) && e.departDay === s.day) fate.get(e.rift.tier)!.dispatched++;
    s = state;
    for (const e of events) {
      if (e.type === 'riftSpawned') {
        const r = s.rifts.find((x) => x.id === e.riftId)!;
        tierOf.set(r.id, r.tier);
        fate.get(r.tier)!.spawned++;
      }
      if (e.type === 'preempted') {
        fate.get(tierOf.get(e.riftId)!)!.preempted++;
        const name = t.factions.find((f) => f.id === e.factionId)?.name ?? '미정';
        byFaction.set(name, (byFaction.get(name) ?? 0) + 1);
      }
      if (e.type === 'riftExpired') fate.get(tierOf.get(e.riftId)!)!.expired++;
    }
    for (const c of t.cities) {
      const st = city.get(c.id)!;
      const n = s.rifts.filter((r) => r.cityId === c.id).length;
      st.daySum += n;
      st.dayCount++;
      if (n >= c.riftSpawn.maxActive) st.full++;
      st.max = Math.max(st.max, n);
    }
  }
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log(`자동 플레이 ${days}일 × 시드 ${seeds.length}개${noPreempt ? ' (선점 끔)' : ''}\n`);
console.log('| 도시 | 한도 | 하루 생성 확률 × 판정 수 | 평균 활성 리프트 | 최대 | 한도에 닿은 날 |');
console.log('|---|---|---|---|---|---|');
for (const c of t.cities) {
  const st = city.get(c.id)!;
  console.log(`| ${c.name} | ${c.riftSpawn.maxActive} | ${c.riftSpawn.dailySpawnChance} × ${c.riftSpawn.dailySpawnRolls ?? 1} | ${(st.daySum / st.dayCount).toFixed(1)} | ${st.max} | ${pct(st.full, st.dayCount)} |`);
}
console.log('\n| 등급 | 생긴 리프트 | 선점 | 마감 만료 | 파견 출발 | 선점 비율(생긴 수 대비) |');
console.log('|---|---|---|---|---|---|');
let tot = { spawned: 0, preempted: 0, expired: 0, dispatched: 0 };
for (const [id, f] of fate) {
  if (!f.spawned) continue;
  tot = { spawned: tot.spawned + f.spawned, preempted: tot.preempted + f.preempted, expired: tot.expired + f.expired, dispatched: tot.dispatched + f.dispatched };
  console.log(`| ${t.riftTiers.find((r) => r.id === id)!.name} | ${f.spawned} | ${f.preempted} | ${f.expired} | ${f.dispatched} | ${pct(f.preempted, f.spawned)} |`);
}
console.log(`| 합계 | ${tot.spawned} | ${tot.preempted} | ${tot.expired} | ${tot.dispatched} | ${pct(tot.preempted, tot.spawned)} |`);
console.log(`\n선점 세력: ${[...byFaction].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '없음'}`);
