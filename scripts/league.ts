// 지시서 028a: 리그 세계 시즌 요약. 사용: npm run league -- [시즌 수(기본 5)] [시드(기본 league)]
// 시즌마다 격진 상위 3팀, 승강 목록, 규모 분포, 명단 변동, 문화권 분포(상위 8)와 대륙 분포를 출력한다. 우리 용병단 자리는 0점(미진 최하위).
import { tables } from '../src/data';
import { initLeague, membersOf, settleSeason } from '../src/engine/league/league';

const [seasonsArg = '5', seed = 'league'] = process.argv.slice(2);
const seasons = Number(seasonsArg);
const lg = initLeague(tables, seed, tables.roster.map((r) => r.name));
const teamName = (id: string) => (id === 'player' ? '우리 용병단' : lg.teams.find((x) => x.id === id)?.name ?? id);
const tierName = (id: string) => tables.league.rules.tiers.find((x) => x.id === id)!.name;
const scaleDist = () => [1, 2, 3, 4, 5].map((k) => lg.teams.filter((x) => x.scaleTier === k).length).join('/');
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;

console.log(`시드 ${seed}: 팀 ${lg.teams.length}곳, 계약자 ${lg.members.length}명, 규모 분포(1~5단계) ${scaleDist()}, 세이브 크기(리그만) ${(JSON.stringify(lg).length / 1024).toFixed(0)}KB`);
for (let s = 0; s < seasons; s++) {
  const h = settleSeason(tables, lg);
  const top = h.standings.gyeokjin.slice(0, 3).map((r) => `${teamName(r.id)}(${r.score}, ${membersOf(lg, r.id).length || '-'}명)`);
  console.log(`\n시즌 ${h.season}`);
  console.log(`  격진 상위 3: ${top.join(' · ')}`);
  console.log(`  승격: ${h.promoted.map((x) => `${teamName(x.id)} ${tierName(x.from)}→${tierName(x.to)}`).join(', ')}`);
  console.log(`  강등: ${h.relegated.map((x) => `${teamName(x.id)} ${tierName(x.from)}→${tierName(x.to)}`).join(', ')}`);
  console.log(`  규모 이동 ${h.scaleMoves.length}팀 → 분포 ${scaleDist()} · 이름 변경 ${h.renamed.map((r) => `${r.from}→${r.to}`).join(', ') || '없음'}`);
  console.log(`  명단: 이적 ${h.transfers} · 은퇴 ${h.retired} · 신입 ${h.recruits} → ${lg.members.length}명`);
}
const by = new Map<string, number>();
for (const m of lg.members) by.set(m.cultureId, (by.get(m.cultureId) ?? 0) + 1);
const cont = new Map<string, number>();
for (const c of tables.namePool.cultures) cont.set(c.continent, (cont.get(c.continent) ?? 0) + (by.get(c.id) ?? 0));
const N = lg.members.length;
console.log(`\n문화권 상위 8: ${[...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${tables.namePool.cultures.find((c) => c.id === k)!.name} ${pct(v, N)}`).join(', ')}`);
console.log(`대륙: ${[...cont].map(([k, v]) => `${k} ${pct(v, N)}`).join(', ')}`);
console.log(`이름 예: ${lg.members.filter((m) => !m.featuredId).slice(0, 8).map((m) => m.name).join(', ')}`);
