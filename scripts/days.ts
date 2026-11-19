// 화면 없이 며칠을 자동으로 진행해 결과를 요약한다. 사용: npm run days -- [일수] [시드]
import { getRiftTier, tables } from '../src/data';
import { advanceDay, canLevelUp, dispatch, isAvailable, levelUp, newGame, recruit, recruitInfo, riftLevel, type GameState } from '../src/engine/game';

const [daysArg = '20', seed = 'days'] = process.argv.slice(2);
let s: GameState = newGame(tables, {
  seed,
  guildName: '시험 길드',
  baseCityId: 'seoul',
  protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' },
});
const rowOf = (role: string) => tables.roles.find((r) => r.id === role)!.defaultRow;

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
  for (const e of events) {
    if (e.type === 'returned') {
      const r = s.reports.find((x) => x.expeditionId === e.expeditionId)!;
      console.log(`${s.day}일 복귀: ${r.rift.name} ${r.outcome} ${r.rounds}R 제로+${r.reward.zero} 아르케+${r.reward.arche} 부상 ${r.injuries.length}`);
    }
    if (e.type === 'upkeep' && e.unpaid) console.log(`${s.day}일 유지비 미납 ${e.unpaid}`);
  }
}
console.log('\n최종', { day: s.day, ...s.resources, victories: s.records.victories });
console.log(s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => `${m.name} Lv${m.level} exp${m.exp}${m.injury ? ' 부상' : ''}`).join('\n'));
