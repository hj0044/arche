// 리프트 난도 분포(지시서 015 3항). 자동 플레이(scripts/autoplay.ts)로 진행하면서, 파견을 정하기 전 매일 목록을 평가한다.
// 사용: npm run difficulty-stats -- [일수] [시드 수]
// - 분모: 출전 가능 인원이 있어 파견을 정할 수 있는 날(자동 편성 파티가 비지 않는 날).
// - 평가 대상: 모든 도시의 리프트 중 지금 보낼 수 있는 것(오늘 + 이동일 ≤ 마감일).
// - 승률: 그날 자동 편성 파티(autoParty)와 실제 적으로 모의 전투(combat-power.json simulations회, 시드 power:리프트id:회차).
//   목록의 실제 난도를 재려는 것이라 탐지소 흐림은 쓰지 않는다(화면의 위험도는 보이는 정보로만 계산).
// - 실제 선택률: 자동 플레이가 고른 리프트가 어느 구간이었는가.
import { getRole, tables as base, travelDays, type GameTables } from '../src/data';
import { autoParty } from '../src/engine/autoParty';
import { simulatedWinRate } from '../src/engine/combatPower';
import { getMerc, isAvailable, mercToUnit, newGame, type GameState } from '../src/engine/game';
import { riftEnemySlots, type Rift } from '../src/engine/rift';
import { autoplayDay } from './autoplay';

const [daysArg = '60', seedCountArg = '6'] = process.argv.slice(2);
const days = Number(daysArg);
const seedPool = ['days', 'audit-20261120', 'audit-2', 'audit-3', 'audit-4', 'audit-5', 'audit-6', 'audit-7', 'audit-8', 'audit-9'];
const seeds = Array.from({ length: Number(seedCountArg) }, (_, i) => seedPool[i] ?? `audit-${i + 1}`);
const t: GameTables = base;

/** 측정 구간 = 위험도 5구간(combat-power.json riskTiers, 지시서 015 0항). 승률 하한이 큰 것부터 */
const BANDS = [...t.combatPower.riskTiers]
  .sort((a, b) => b.minWinRate - a.minWinRate)
  .map((x, i, all) => ({ id: x.id, name: `${x.name}(${i === all.length - 1 ? `<${Math.round(all[i - 1].minWinRate * 100)}` : `≥${Math.round(x.minWinRate * 100)}`})`, min: i === all.length - 1 ? -1 : x.minWinRate }));
type BandId = string;
const bandOf = (w: number): BandId => BANDS.find((b) => w >= b.min)!.id;
/** 목표 구간: 접전 또는 우세(승률 50~90). 압도 바로 아래부터 접전까지 */
const TARGET_IDS = ['safe', 'fair'];
const isFair = (b: BandId) => TARGET_IDS.includes(b);
const targetName = TARGET_IDS.map((id) => t.combatPower.riskTiers.find((x) => x.id === id)?.name ?? id).reverse().join(' 또는 ');

function winRate(s: GameState, r: Rift): number | null {
  const party = autoParty(t, s, r);
  if (!party.length) return null;
  const slots = party.map((p) => ({ unit: mercToUnit(t, getMerc(s, p.mercId)), row: p.row ?? getRole(t, getMerc(s, p.mercId).role).defaultRow }));
  return simulatedWinRate(t, slots, riftEnemySlots(t, r), r.id);
}

let decisionDays = 0;
/** 가용 인원별: [파견을 정할 수 있는 날, 목표 구간 있는 날] */
const bySize = new Map<string, [number, number]>();
const sizeKey = (n: number) => (n >= 5 ? '5명 이상' : n >= 3 ? '3~4명' : '1~2명');
let fairDays = 0;
const bandDays = new Map<BandId, number>(BANDS.map((b) => [b.id, 0]));
const chosen = new Map<BandId, number>(BANDS.map((b) => [b.id, 0]));
let dispatches = 0;
let injuredMercDays = 0;
const bandRifts = new Map<BandId, number>(BANDS.map((b) => [b.id, 0]));
let riftsEvaluated = 0;
const byTier = new Map<string, Map<BandId, number>>();

for (const seed of seeds) {
  let s: GameState = newGame(t, { seed, guildName: '시험 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
  for (let d = 0; d < days; d++) {
    injuredMercDays += s.mercenaries.filter((m) => m.affiliation.kind === 'guild' && m.injury).length;
    const sendable = s.rifts.filter((r) => r.deadlineDay === null || s.day + travelDays(t, s.baseCityId, r.cityId) <= r.deadlineDay);
    const bands = new Map<string, BandId>();
    for (const r of sendable) {
      const w = winRate(s, r);
      if (w === null) continue;
      const b = bandOf(w);
      bands.set(r.id, b);
      riftsEvaluated++;
      bandRifts.set(b, bandRifts.get(b)! + 1);
      const tierMap = byTier.get(r.tier) ?? new Map<BandId, number>(BANDS.map((x) => [x.id, 0]));
      tierMap.set(b, tierMap.get(b)! + 1);
      byTier.set(r.tier, tierMap);
    }
    if (bands.size > 0) {
      decisionDays++;
      const present = new Set(bands.values());
      for (const b of present) bandDays.set(b, bandDays.get(b)! + 1);
      const fair = [...present].some(isFair);
      if (fair) fairDays++;
      const key = sizeKey(s.mercenaries.filter((m) => isAvailable(s, m.id)).length);
      const cur = bySize.get(key) ?? [0, 0];
      bySize.set(key, [cur[0] + 1, cur[1] + (fair ? 1 : 0)]);
    }
    const before = new Set(s.expeditions.map((e) => e.id));
    const { state } = autoplayDay(t, s);
    for (const ex of state.expeditions) {
      if (before.has(ex.id) || ex.departDay !== s.day) continue;
      const b = bands.get(ex.rift.id);
      if (!b) continue;
      dispatches++;
      chosen.set(b, chosen.get(b)! + 1);
    }
    s = state;
  }
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log(`자동 플레이 ${days}일 × 시드 ${seeds.length}개 · 파견을 정할 수 있는 날 ${decisionDays}일 · 평가한 리프트 ${riftsEvaluated}개\n`);
console.log(`${targetName}(50~90) 있는 날: ${fairDays}/${decisionDays} = ${pct(fairDays, decisionDays)} (목표 80% 이상)\n`);
console.log('| 구간 | 목록에 있는 날 | 목록 안 비율(리프트 수) | 실제 선택률 |');
console.log('|---|---|---|---|');
for (const b of BANDS) console.log(`| ${b.name} | ${pct(bandDays.get(b.id)!, decisionDays)} | ${pct(bandRifts.get(b.id)!, riftsEvaluated)} | ${pct(chosen.get(b.id)!, dispatches)} |`);
console.log(`\n등급별 구간(리프트 수): ${[...byTier].map(([tier, m]) => `${t.riftTiers.find((x) => x.id === tier)?.name ?? tier} ${BANDS.map((b) => m.get(b.id)).join('/')}`).join(' · ')} (${BANDS.map((b) => b.name.replace(/\(.*\)/, '')).join('/')})`);
console.log(`가용 인원별 ${targetName} 있는 날: ${['1~2명', '3~4명', '5명 이상'].map((k) => { const [n, f] = bySize.get(k) ?? [0, 0]; return `${k} ${f}/${n}(${pct(f, n)})`; }).join(' · ')}`);
console.log(`부상으로 출전 못 한 용병·일: ${injuredMercDays} (시드당 ${(injuredMercDays / seeds.length).toFixed(1)})`);
console.log(`파견 ${dispatches}회`);
