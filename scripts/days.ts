// 화면 없이 며칠을 자동으로 진행해 결과를 요약한다. 사용: npm run days -- [일수] [시드]
import { getRiftTier, tables } from '../src/data';
import { loyaltyTier } from '../src/engine/loyalty';
import { advanceDay, canLevelUp, dispatch, isAvailable, levelUp, newGame, recruit, recruitInfo, riftLevel, type GameState } from '../src/engine/game';

const [daysArg = '20', seed = 'days'] = process.argv.slice(2);
let s: GameState = newGame(tables, {
  seed,
  guildName: '시험 길드',
  baseCityId: 'seoul',
  protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' },
});
const rowOf = (role: string) => tables.roles.find((r) => r.id === role)!.defaultRow;

// 용병별 출전 횟수와 승리(영입 후 특정 용병 쏠림 확인용)
const sorties = new Map<string, { n: number; win: number }>();
// 충성도 요약용
let refusals = 0;
let idleDecays = 0;
const departures: string[] = [];
const poaches: string[] = [];

for (let d = 0; d < Number(daysArg); d++) {
  // 단순한 자동 플레이: 3명 이상 모이면 거점 도시에서 몬스터 레벨이 가장 낮은 리프트로 보낸다.
  for (const m of s.mercenaries) {
    const info = recruitInfo(tables, s, m.id);
    if (info.eligible && info.unlocked && s.resources.zero >= info.cost + 300) s = recruit(tables, s, m.id);
  }
  const free = s.mercenaries.filter((m) => isAvailable(s, m.id));
  const target = s.rifts.filter((r) => r.cityId === s.baseCityId).sort((a, b) => riftLevel(a) - riftLevel(b))[0];
  if (free.length >= Math.min(3, s.mercenaries.filter((m) => m.affiliation.kind === 'guild').length) && target) {
    s = dispatch(tables, s, target.id, free.slice(0, 5).map((m) => ({ mercId: m.id, row: rowOf(m.role) })));
    console.log(`${s.day}일 출발: ${target.name}(${getRiftTier(tables, target.tier).name}, Lv${riftLevel(target)}) ← ${free.slice(0, 5).map((m) => m.name).join(' ')}`);
  }
  for (const m of s.mercenaries) while (canLevelUp(tables, s, m.id)) s = levelUp(tables, s, m.id);
  const { state, events } = advanceDay(tables, s);
  s = state;
  for (const m of s.mercenaries) idleDecays += (m.loyalty?.recent ?? []).filter((r) => r.day === s.day && r.reason === 'idleDecay').length;
  for (const e of events) {
    if (e.type === 'returned') {
      const r = s.reports.find((x) => x.expeditionId === e.expeditionId)!;
      for (const p of r.party) {
        const st = sorties.get(p.mercId) ?? { n: 0, win: 0 };
        sorties.set(p.mercId, { n: st.n + 1, win: st.win + (r.outcome === 'victory' ? 1 : 0) });
      }
      console.log(`${s.day}일 복귀: ${r.rift.name} ${r.outcome} ${r.rounds}R 제로+${r.reward.zero} 아르케+${r.reward.arche} 부상 ${r.injuries.length}`);
    }
    if (e.type === 'upkeep' && e.unpaid) console.log(`${s.day}일 유지비 미납 ${e.unpaid}`);
    if (e.type === 'refused') refusals++;
    if (e.type === 'poached') {
      const m = s.mercenaries.find((x) => x.id === e.mercId)!;
      poaches.push(`${s.day}일 ${m.name}→${tables.factions.find((f) => f.id === e.toFactionId)?.name}`);
    }
    if (e.type === 'departed') {
      const m = s.mercenaries.find((x) => x.id === e.mercId)!;
      departures.push(`${s.day}일 ${m.name}`);
      console.log(`${s.day}일 이탈: ${m.name}`);
    }
  }
}
console.log('\n최종', { day: s.day, ...s.resources, victories: s.records.victories });
console.log(s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => `${m.name} Lv${m.level} exp${m.exp}${m.injury ? ' 부상' : ''}`).join('\n'));

console.log('\n용병별 출전');
const totalSorties = [...sorties.values()].reduce((a, x) => a + x.n, 0);
for (const [id, st] of [...sorties.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))) {
  const m = s.mercenaries.find((x) => x.id === id)!;
  console.log(`${m.name}\t출전 ${st.n} (${Math.round((st.n / totalSorties) * 100)}%)\t승 ${st.win}\t승률 ${Math.round((st.win / st.n) * 100)}%`);
}

console.log('\n충성도');
const dist = new Map<string, number>(tables.loyalty.tiers.map((t) => [t.name, 0]));
for (const m of s.mercenaries) if (m.loyalty && m.affiliation.kind === 'guild') dist.set(loyaltyTier(tables, m.loyalty.value).name, (dist.get(loyaltyTier(tables, m.loyalty.value).name) ?? 0) + 1);
console.log(`구간 분포: ${[...dist].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`거부 ${refusals}회, 이탈 ${departures.length}회${departures.length ? ` (${departures.join(', ')})` : ''}`);
console.log(`대기 하락 ${idleDecays}회, 무소속 이동 ${poaches.length}회${poaches.length ? ` (${poaches.join(', ')})` : ''}`);
