// 지시서 028a: 이름 생성기 샘플. 사용: npm run names -- [개수(기본 30)] [시드(기본 names)]
// 이름 샘플과, 같은 시드로 1,000개를 만들었을 때의 문화권·대륙 비율을 출력한다.
import { tables } from '../src/data';
import { cultureWeights, generateName } from '../src/engine/names';
import { createRng } from '../src/engine/rng';

const [countArg = '30', seed = 'names'] = process.argv.slice(2);
const count = Number(countArg);
const rng = createRng(seed);
const used = new Set<string>();
const cname = (id: string) => tables.namePool.cultures.find((c) => c.id === id)!.name;
for (let i = 0; i < count; i++) {
  const n = generateName(tables, rng, { gender: (['m', 'f', 'n'] as const)[i % 3], used });
  console.log(`${n.display}  (${cname(n.cultureId)}, ${(['남', '여', '중성'] as const)[i % 3]})`);
}
const N = 1000;
const r2 = createRng(`${seed}:dist`);
const u2 = new Set<string>();
const by = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const n = generateName(tables, r2, { gender: (['m', 'f', 'n'] as const)[i % 3], used: u2 });
  by.set(n.cultureId, (by.get(n.cultureId) ?? 0) + 1);
}
const w = cultureWeights(tables);
console.log(`\n문화권 비율(표본 ${N}개 / 가중치):`);
for (const c of [...tables.namePool.cultures].sort((a, b) => w.get(b.id)! - w.get(a.id)!)) {
  console.log(`  ${c.name.padEnd(12)} ${(((by.get(c.id) ?? 0) / N) * 100).toFixed(1)}% / ${(w.get(c.id)! * 100).toFixed(1)}%`);
}
