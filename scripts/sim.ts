// 샘플 전투를 돌려 결과와 로그를 출력한다. 사용: npm run sim -- [시드] [몬스터 레벨] [몬스터 등급]
import { getSkill, tables } from '../src/data';
import { resolveCombat } from '../src/engine/combat';
import { effectText, eventText } from '../src/engine/combatLog';
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
    const nameOf = (k: string) => names.get(k) ?? k;
    const parts = ev.effects.map((e) => {
      const base = effectText(tables, e, nameOf);
      if (e.kind === 'damage' && !e.evaded) return `${base}${e.elementMultiplier !== 1 ? `(×${e.elementMultiplier})` : ''} → ${e.hpAfter}`;
      if (e.kind === 'heal') return `${base} → ${e.hpAfter}`;
      return base;
    });
    console.log(`  ${names.get(ev.actor)} [${getSkill(tables, ev.skillId).name}] ${parts.filter(Boolean).join(', ')}`);
  } else if (eventText(tables, ev, (k) => names.get(k) ?? k)) {
    console.log(`  · ${eventText(tables, ev, (k) => names.get(k) ?? k)}`);
  } else if (ev.type === 'end') {
    console.log(`\n결과: ${ev.outcome} (${ev.rounds}라운드)`);
  }
}
const injuries = rollInjuries(tables, allies.map((s) => s.unit), result.downedUnitIds, result.outcome, createRng(`${seed}:injury`));
console.log('부상:', injuries);
