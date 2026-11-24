// 충성도·무소속 이동 값 조합별 시뮬레이션 비교표(마크다운). 데이터 파일은 바꾸지 않고 메모리에서만 값을 바꾼다.
// 사용: npm run loyalty-sweep -- [일수] [시드 수]
// 자동 플레이 정책은 npm run days와 같은 scripts/autoplay.ts(시설 건설, 영입, 파견, 훈련 배치, 레벨업. 급료 보너스는 쓰지 않음).
import { tables as base, type GameTables } from '../src/data';
import { newGame, type GameState } from '../src/engine/game';
import { autoplayDay } from './autoplay';
import { loyaltyTier } from '../src/engine/loyalty';

const [daysArg = '40', seedCountArg = '6'] = process.argv.slice(2);
const days = Number(daysArg);
const seedPool = ['days', 'audit-20261120', 'audit-2', 'audit-3', 'audit-4', 'audit-5', 'audit-6', 'audit-7', 'audit-8', 'audit-9'];
const seeds = Array.from({ length: Number(seedCountArg) }, (_, i) => seedPool[i] ?? `audit-${i + 1}`);

interface Combo {
  name: string;
  unpaid: number;
  refuse: number;
  depart: number;
  idle: number;
  poach: number;
}
const D = {
  unpaid: base.loyalty.changes.unpaidDay,
  refuse: base.loyalty.tiers.find((t) => t.id === base.loyalty.departure.tier)!.refuseChance,
  depart: base.loyalty.departure.chance,
  idle: base.loyalty.changes.idleDecay,
  poach: base.poaching.dailyChance,
};
// 한 번에 한 값씩 바꾼다(기본값 대비). 마지막은 모두 가혹한 쪽.
const combos: Combo[] = [
  { name: '기본값', ...D },
  { name: '미납 −8', ...D, unpaid: -8 },
  { name: '미납 −10', ...D, unpaid: -10 },
  { name: '위험 거부 40%', ...D, refuse: 0.4 },
  { name: '이탈 35%', ...D, depart: 0.35 },
  { name: '대기 하락 −1', ...D, idle: -1 },
  { name: '무소속 이동 1%', ...D, poach: 0.01 },
  { name: '무소속 이동 4%', ...D, poach: 0.04 },
  { name: '가혹(−10·40%·35%·−1·4%)', unpaid: -10, refuse: 0.4, depart: 0.35, idle: -1, poach: 0.04 },
];

function tablesFor(c: Combo): GameTables {
  const t = structuredClone(base);
  t.loyalty.changes.unpaidDay = c.unpaid;
  t.loyalty.changes.idleDecay = c.idle;
  t.loyalty.departure.chance = c.depart;
  for (const tier of t.loyalty.tiers) if (tier.id === t.loyalty.departure.tier) tier.refuseChance = c.refuse;
  t.poaching.dailyChance = c.poach;
  return t;
}

function play(t: GameTables, seed: string) {
  let s: GameState = newGame(t, {
    seed,
    guildName: '시험 길드',
    baseCityId: 'seoul',
    protagonist: { name: '마스터' },
  });
  const out = { refusals: 0, departures: 0, idleDecays: 0, poaches: 0, wins: 0, unpaidDays: 0, trainingExp: 0 };
  for (let d = 0; d < days; d++) {
    const { state, events } = autoplayDay(t, s);
    s = state;
    for (const e of events) {
      if (e.type === 'refused') out.refusals++;
      if (e.type === 'departed') out.departures++;
      if (e.type === 'poached') out.poaches++;
      if (e.type === 'returned' && e.outcome === 'victory') out.wins++;
      if (e.type === 'upkeep' && e.unpaid > 0) out.unpaidDays++;
      if (e.type === 'trained') out.trainingExp += e.exp;
    }
    for (const m of s.mercenaries) out.idleDecays += (m.loyalty?.recent ?? []).filter((r) => r.day === s.day && r.reason === 'idleDecay').length;
  }
  const dist: Record<string, number> = Object.fromEntries(t.loyalty.tiers.map((x) => [x.id, 0]));
  let size = 0;
  for (const m of s.mercenaries) {
    if (m.affiliation.kind !== 'guild' || !m.loyalty) continue;
    dist[loyaltyTier(t, m.loyalty.value).id]++;
    size++;
  }
  const facilityLevels = Object.fromEntries(t.facilities.facilities.map((f) => [f.id, s.facilities.levels[f.id] ?? 0]));
  return { ...out, dist, size, departSeed: out.departures > 0, facilityLevels };
}

const tierIds = base.loyalty.tiers.map((t) => t.id);
const tierNames = base.loyalty.tiers.map((t) => t.name).join('/');
const facilityNames = base.facilities.facilities.map((f) => f.name).join('/');
console.log(`### ${days}일, 시드 ${seeds.length}개 (${seeds.join(', ')})`);
console.log('');
console.log('횟수는 시드 합계, 길드 인원·구간 분포·시설 레벨은 마지막 날 평균.');
console.log('');
console.log(`| 조합 | 미납 | 위험 거부 | 이탈 | 대기 하락 | 무소속 이동 | 이탈 수 | 이탈 발생 시드 | 거부 수 | 대기 하락 횟수 | 무소속 이동 수 | 미납 일수 | 훈련 경험치 | 승리 | 길드 인원 | ${tierNames} | 시설 레벨(${facilityNames}) |`);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of combos) {
  const t = tablesFor(c);
  const rs = seeds.map((sd) => play(t, sd));
  const sum = (k: 'refusals' | 'departures' | 'idleDecays' | 'poaches' | 'wins' | 'unpaidDays' | 'trainingExp') => rs.reduce((a, r) => a + r[k], 0);
  const avg = (f: (r: (typeof rs)[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log(
    `| ${c.name} | ${c.unpaid} | ${pct(c.refuse)} | ${pct(c.depart)} | ${c.idle} | ${pct(c.poach)} | ${sum('departures')} | ${rs.filter((r) => r.departSeed).length}/${seeds.length} | ${sum('refusals')} | ${sum('idleDecays')} | ${sum('poaches')} | ${sum('unpaidDays')} | ${sum('trainingExp')} | ${sum('wins')} | ${avg((r) => r.size)} | ${tierIds.map((id) => avg((r) => r.dist[id])).join('/')} | ${base.facilities.facilities.map((f) => avg((r) => r.facilityLevels[f.id])).join('/')} |`,
  );
}
