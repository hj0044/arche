// 화면 없이 며칠을 자동으로 진행해 결과를 요약한다. 사용: npm run days -- [일수] [시드]
import { getRiftTier, tables } from '../src/data';
import { advanceDay, canLevelUp, dispatch, isAvailable, levelUp, newGame, type GameState } from '../src/engine/game';

const [daysArg = '20', seed = 'days'] = process.argv.slice(2);
let s: GameState = newGame(tables, {
  seed,
  guildName: '시험 길드',
  baseCityId: 'seoul',
  protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' },
});
const rowOf = (role: string) => tables.roles.find((r) => r.id === role)!.defaultRow;

for (let d = 0; d < Number(daysArg); d++) {
  const free = s.mercenaries.filter((m) => isAvailable(s, m.id));
  const target = s.rifts.filter((r) => r.cityId === s.baseCityId).sort((a, b) => a.enemies[0].level - b.enemies[0].level)[0];
  if (free.length && target) {
    s = dispatch(tables, s, target.id, free.slice(0, 5).map((m) => ({ mercId: m.id, row: rowOf(m.role) })));
    console.log(`${s.day}일 출발: ${target.name}(${getRiftTier(tables, target.tier).name}, Lv${target.enemies[0].level}) ← ${free.slice(0, 5).map((m) => m.name).join(' ')}`);
  }
  for (const m of s.mercenaries) while (canLevelUp(tables, s, m.id)) s = levelUp(tables, s, m.id);
  const { state, events } = advanceDay(tables, s);
  s = state;
  for (const e of events) {
    if (e.type === 'returned') {
      const r = s.reports.find((x) => x.expeditionId === e.expeditionId)!;
      console.log(`${s.day}일 복귀: ${r.rift.name} ${r.outcome} ${r.rounds}R 제로+${r.reward.zero} 아르케+${r.reward.arche} 부상 ${r.injuries.length}`);
    }
    if (e.type === 'riftExpired') console.log(`${s.day}일 소멸: ${e.name}`);
  }
}
console.log('\n최종', { day: s.day, ...s.resources });
console.log(s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => `${m.name} Lv${m.level} exp${m.exp}${m.injury ? ' 부상' : ''}`).join('\n'));
