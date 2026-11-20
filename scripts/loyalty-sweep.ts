// 충성도·무소속 이동 값 조합별 시뮬레이션 비교표(마크다운). 데이터 파일은 바꾸지 않고 메모리에서만 값을 바꾼다.
// 사용: npm run loyalty-sweep -- [일수] [시드 수]
// 자동 플레이 정책은 npm run days와 같다(서울 개방자 시작, 3명 이상 모이면 최저 레벨 리프트, 제로 ≥ 영입비+300이면 영입,
// 가능하면 레벨업, 급료 보너스는 쓰지 않음).
import { tables as base, type GameTables } from '../src/data';
import { advanceDay, canLevelUp, dispatch, isAvailable, levelUp, newGame, recruit, recruitInfo, riftLevel, type GameState } from '../src/engine/game';
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
    protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' },
  });
  const rowOf = (role: string) => t.roles.find((r) => r.id === role)!.defaultRow;
  const out = { refusals: 0, departures: 0, idleDecays: 0, poaches: 0, wins: 0 };
  for (let d = 0; d < days; d++) {
    for (const m of s.mercenaries) {
      const info = recruitInfo(t, s, m.id);
      if (info.eligible && info.unlocked && s.resources.zero >= info.cost + 300) s = recruit(t, s, m.id);
    }
    const free = s.mercenaries.filter((m) => isAvailable(s, m.id));
    const target = s.rifts.filter((r) => r.cityId === s.baseCityId).sort((a, b) => riftLevel(a) - riftLevel(b))[0];
    if (free.length >= Math.min(3, s.mercenaries.filter((m) => m.affiliation.kind === 'guild').length) && target) {
      s = dispatch(t, s, target.id, free.slice(0, 5).map((m) => ({ mercId: m.id, row: rowOf(m.role) })));
    }
    for (const m of s.mercenaries) while (canLevelUp(t, s, m.id)) s = levelUp(t, s, m.id);
    const { state, events } = advanceDay(t, s);
    s = state;
    for (const e of events) {
      if (e.type === 'refused') out.refusals++;
      if (e.type === 'departed') out.departures++;
      if (e.type === 'poached') out.poaches++;
      if (e.type === 'returned' && e.outcome === 'victory') out.wins++;
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
  return { ...out, dist, size, departSeed: out.departures > 0 };
}

const tierIds = base.loyalty.tiers.map((t) => t.id);
const tierNames = base.loyalty.tiers.map((t) => t.name).join('/');
console.log(`### ${days}일, 시드 ${seeds.length}개 (${seeds.join(', ')})`);
console.log('');
console.log('횟수는 시드 합계, 길드 인원과 구간 분포는 마지막 날 평균(주인공 제외).');
console.log('');
console.log(`| 조합 | 미납 | 위험 거부 | 이탈 | 대기 하락 | 무소속 이동 | 이탈 수 | 이탈 발생 시드 | 거부 수 | 대기 하락 횟수 | 무소속 이동 수 | 승리 | 길드 인원 | ${tierNames} |`);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of combos) {
  const t = tablesFor(c);
  const rs = seeds.map((sd) => play(t, sd));
  const sum = (k: 'refusals' | 'departures' | 'idleDecays' | 'poaches' | 'wins') => rs.reduce((a, r) => a + r[k], 0);
  const avg = (f: (r: (typeof rs)[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log(
    `| ${c.name} | ${c.unpaid} | ${pct(c.refuse)} | ${pct(c.depart)} | ${c.idle} | ${pct(c.poach)} | ${sum('departures')} | ${rs.filter((r) => r.departSeed).length}/${seeds.length} | ${sum('refusals')} | ${sum('idleDecays')} | ${sum('poaches')} | ${sum('wins')} | ${avg((r) => r.size)} | ${tierIds.map((id) => avg((r) => r.dist[id])).join('/')} |`,
  );
}
