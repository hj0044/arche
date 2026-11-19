// 샘플 전투를 돌려 결과와 로그를 출력한다. 사용: npm run sim -- [시드] [몬스터 레벨] [몬스터 등급]
import { getSkill, tables } from '../src/data';
import { resolveCombat } from '../src/engine/combat';
import { rollInjuries } from '../src/engine/injury';
import { createRng } from '../src/engine/rng';
import { sampleMonsters, sampleParty } from '../src/engine/samples';

const [seed = 'sample', level = '5', grade = 'mid'] = process.argv.slice(2);
const allies = sampleParty(tables);
const enemies = sampleMonsters(tables, Number(level), grade);
const result = resolveCombat(tables, { allies, enemies, seed });

const names = new Map<string, string>();
for (const ev of result.events) {
  if (ev.type === 'start') {
    for (const c of ev.combatants) names.set(c.key, `${c.name}(${c.side === 'ally' ? '아' : '적'})`);
    console.log('구성 배율', ev.compositionMultiplier);
  } else if (ev.type === 'round') {
    console.log(`\n── ${ev.round}라운드`);
  } else if (ev.type === 'action') {
    const parts = ev.effects.map((e) => {
      const t = names.get(e.target);
      if (e.kind === 'damage') return `${t} -${e.amount}${e.elementMultiplier !== 1 ? `(×${e.elementMultiplier})` : ''} → ${e.hpAfter}${e.downed ? ' 쓰러짐' : ''}`;
      if (e.kind === 'heal') return `${t} +${e.amount} → ${e.hpAfter}`;
      return `${t} ${e.status === 'taunt' ? '도발' : `${e.stat} +${(e.amount ?? 0) * 100}%`} ${e.duration}라운드`;
    });
    console.log(`  ${names.get(ev.actor)} [${getSkill(tables, ev.skillId).name}] ${parts.join(', ')}`);
  } else if (ev.type === 'end') {
    console.log(`\n결과: ${ev.outcome} (${ev.rounds}라운드)`);
  }
}
const injuries = rollInjuries(tables, allies.map((s) => s.unit), result.downedUnitIds, result.outcome, createRng(`${seed}:injury`));
console.log('부상:', injuries);
