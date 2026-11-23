/** 검수 전용. 저장소 루트에서 node --import tsx docs/reviews/data/combat-power-2026-11-24/audit.ts 분류 시드수 [출력폴더] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CORE_STATS, getRole, tables, travelDays, type GameTables, type Stats, type TraitRow } from '../../../../src/data';
import { elementMultiplier, resolveCombat, rollAttack, type CombatResult, type CombatSlot } from '../../../../src/engine/combat';
import { combatPower, estimateRisk, estimatedEnemies, riskTierOf, statsPower } from '../../../../src/engine/combatPower';
import { createRng } from '../../../../src/engine/rng';
import { allyAuraRows, computeEffectiveStats, traitMultiplier } from '../../../../src/engine/stats';
import { createMercenary, createMonster, type Unit } from '../../../../src/engine/unit';
import { isAvailable, mercToUnit, newGame, type MercenaryState } from '../../../../src/engine/game';
import { scoutingRow, visibleRift, type VisibleRift } from '../../../../src/engine/facilities';
import { riftEnemySlots } from '../../../../src/engine/rift';
import { autoParty } from '../../../../src/engine/autoParty';
import { createSaveFile, serializeSave } from '../../../../src/storage/saveFile';
import { autoplayDay } from '../../../../scripts/autoplay';
import draft from '../../../design/roster-stats-draft.json';

const [section = 'core', count = '2000', directory = 'docs/reviews/data/combat-power-2026-11-24', arg, extra] = process.argv.slice(2);
const n = Number(count);
if (!Number.isSafeInteger(n) || n < 1) throw new Error('시드 수는 양의 정수여야 한다.');
mkdirSync(directory, { recursive: true });
type Cell = string | number | boolean | null;
function csv(name: string, header: string[], rows: Cell[][]) {
  const cell = (x: Cell) => typeof x === 'string' ? '"' + x.replaceAll('"', '""') + '"' : String(x ?? '');
  writeFileSync(join(directory, name + '.csv'), [header, ...rows].map(row => row.map(cell).join(',')).join('\n') + '\n');
}

const roles = tables.roles.filter(r => r.enabled);
type Merc = typeof tables.roster[number];
const roster = tables.roster;
const role = (id: string) => getRole(tables, id);
const slot = (unit: Unit): CombatSlot => ({ unit, row: role(unit.role).defaultRow });
function contract(m: Merc, level: number): CombatSlot {
  const state: MercenaryState = {
    id: m.id, name: m.name, role: m.role, element: m.element, level, exp: 0,
    initialLevel: m.initialLevel, growth: m.growth, affiliation: { kind: 'guild' },
    profile: { background: m.background, world: m.world, race: m.race },
  };
  return slot(mercToUnit(tables, state));
}
function generic(roleId: string, level: number, id: string, element = 'void') {
  return slot(createMercenary(tables, { id, name: id, element, role: roleId, level }));
}
function monster(m: typeof tables.monsters[number], grade: string, level: number, index: number) {
  return slot(createMonster(tables, { id: 'z' + index, name: m.name, element: m.element, role: m.role, level, grade, monsterId: m.id }));
}
const change = (s: CombatSlot, stats: Partial<Stats>): CombatSlot => ({ ...s, unit: { ...s.unit, stats: { ...s.unit.stats, ...stats } } });
const traits = (s: CombatSlot, ids: string[]): CombatSlot => ({ ...s, unit: { ...s.unit, traits: ids.map(id => ({ id, rank: 1 })) } });
type Fight = { allies: CombatSlot[]; enemies: CombatSlot[] };
const battle = (f: Fight, seed: number | string, t = tables) => resolveCombat(t, { ...f, seed });
const isWin = (r: CombatResult) => +(r.outcome === 'victory');
function wilson(k: number, total: number, z = 1.95996398454) {
  const p = k / total;
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  const center = p + z * z / (2 * total);
  return [(center - margin) / (1 + z * z / total), (center + margin) / (1 + z * z / total)];
}
const fightHeader = ['n', 'wins', 'defeats', 'retreats', 'round15', 'mean_rounds', 'win_ci_low', 'win_ci_high'];
function sample(f: Fight, key: string, total = n, t = tables) {
  let win = 0, defeats = 0, retreat = 0, r15 = 0, rounds = 0;
  for (let i = 0; i < total; i++) {
    const r = battle(f, key + ':' + i, t);
    win += isWin(r);
    defeats += +(r.outcome === 'defeat');
    retreat += +(r.outcome === 'retreat');
    r15 += +(r.rounds === t.combat.maxRounds);
    rounds += r.rounds;
  }
  return [total, win, defeats, retreat, r15, rounds / total, ...wilson(win, total)];
}
const pairHeader = ['n', 'off_wins', 'on_wins', 'gain', 'loss', 'delta', 'delta_ci_low', 'delta_ci_high', 'off_retreats', 'on_retreats', 'off_mean_rounds', 'on_mean_rounds'];
function paired(off: Fight, on: Fight, key: string, offTable = tables, onTable = tables) {
  let a = 0, b = 0, gain = 0, loss = 0, aRetreat = 0, bRetreat = 0, ar = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const seed = key + ':' + i;
    const r = battle(off, seed, offTable);
    const s = battle(on, seed, onTable);
    const x = isWin(r), y = isWin(s);
    a += x; b += y; gain += +(y > x); loss += +(x > y);
    aRetreat += +(r.outcome === 'retreat'); bRetreat += +(s.outcome === 'retreat'); ar += r.rounds; br += s.rounds;
  }
  const delta = (b - a) / n;
  const margin = 1.96 * Math.sqrt(Math.max(0, (gain + loss) / n - delta ** 2) / Math.max(1, n - 1));
  const [gainLow, gainHigh] = wilson(gain, n, 2.2414);
  const [lossLow, lossHigh] = wilson(loss, n, 2.2414);
  const interval = gain + loss < 6 ? [gainLow - lossHigh, gainHigh - lossLow] : [delta - margin, delta + margin];
  return [n, a, b, gain, loss, delta, ...interval, aRetreat, bRetreat, ar / n, br / n];
}

/** 내장 피해·행동 순서와 위험도 호출의 최소 재현 */
function core() {
  const checks: Cell[][] = [];
  const record = (name: string, total: number, failed: number, detail: string) => checks.push([name, total, failed, detail]);
  const f = { allies: [contract(roster[0], 35), contract(roster[1], 35), contract(roster[2], 35), contract(roster[3], 35)], enemies: tables.monsters.filter(m => m.grades.includes('high')).map((m, i) => monster(m, 'high', 35, i)) };
  let diffs = 0, inputsChanged = 0, misses = 0, crits = 0, heals = 0;
  const bytes = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');
  const before = bytes(f);
  let drawFail = 0, integrationFail = 0, routingFail = 0, healFail = 0;
  const physical = change(generic('warrior', 15, 'p', 'fire'), { crit: 0, spd: 99 });
  physical.unit.skills = ['warrior_slash'];
  const energy = change(generic('mage', 15, 'p', 'fire'), { crit: 0, spd: 99 });
  energy.unit.skills = ['mage_bolt'];
  const target = change(generic('shield', 15, 'z'), { hp: 500, pAtk: 1, spd: 1, eva: 0 });
  target.unit.skills = ['shield_strike'];
  const firstDamage = (r: CombatResult) => {
    const a = r.events.find(e => e.type === 'action' && e.actor === 'a0');
    const d = a?.type === 'action' ? a.effects[0] : undefined;
    if (!d || d.kind !== 'damage') throw new Error('첫 행동이 공격이어야 한다.');
    return d;
  };
  const healer = change(generic('healer', 15, 'p'), { hp: 300, spd: 10, crit: 0, eAtk: 35 });
  const striker = change(generic('warrior', 15, 'z'), { hp: 500, spd: 100, pAtk: 125, crit: 0 });
  striker.unit.skills = ['warrior_slash'];
  const healingTable = { ...tables, combat: { ...tables.combat, maxRounds: 1, ai: { ...tables.combat.ai, healThreshold: 1 } } };
  const healOnly = (r: CombatResult) => r.events.flatMap(e => e.type === 'action' ? e.effects.filter(x => x.kind === 'heal') : []);
  const sampleRounds = Math.max(n, 1000);
  for (let i = 0; i < sampleRounds; i++) {
    const seed = 'det:' + i;
    const a = battle(f, seed);
    diffs += +!bytes(a).equals(bytes(battle(f, seed)));
    inputsChanged += +!before.equals(bytes(f));
    for (const e of a.events) if (e.type === 'action') for (const x of e.effects) {
      if (x.kind === 'damage') { misses += +!!x.evaded; crits += +!!x.crit; }
      if (x.kind === 'heal') heals++;
    }
    const high = createRng(seed), low = createRng(seed), control = createRng(seed);
    for (let k = 0; k < 15; k++) {
      const variance = control.float(tables.combat.damage.varianceMin, tables.combat.damage.varianceMax);
      const eva = control.next(), crit = control.next();
      const x = rollAttack(tables, high, 0.5, 0.8), y = rollAttack(tables, low, 0, 0);
      drawFail += +(x.variance !== variance || y.variance !== variance || x.evaded !== (eva < 0.5) || x.crit !== (eva >= 0.5 && crit < 0.8) || y.evaded || y.crit || high.getState() !== low.getState() || high.getState() !== control.getState());
    }
    const one = (a: CombatSlot, t: CombatSlot) => firstDamage(battle({ allies: [a], enemies: [t] }, seed));
    const attack = change(physical, { crit: 0.8 });
    const defender = change(target, { eva: 0.5 });
    const logged = one(attack, defender);
    const expected = rollAttack(tables, createRng(seed + ':hit'), 0.5, 0.8);
    const k = tables.combat.damage.defenseConstant * (1 + tables.stats.levelGrowthRate.pDef) ** 14;
    const amount = Math.round(attack.unit.stats.pAtk * 0.85 * k / (k + defender.unit.stats.pDef) * expected.variance * (expected.crit ? attack.unit.stats.critDmg : 1));
    integrationFail += +(!!logged.evaded !== expected.evaded || !!logged.crit !== expected.crit || logged.amount !== (expected.evaded ? 0 : amount));
    for (const [a, matched, other] of [[physical, 'pDef', 'eDef'], [energy, 'eDef', 'pDef']] as const) {
      const base = one(a, target).amount;
      routingFail += +(one(a, change(target, { [matched]: 500 })).amount >= base || one(a, change(target, { [other]: 500 })).amount !== base);
    }
    const h1 = healOnly(battle({ allies: [healer], enemies: [striker] }, seed, healingTable));
    // 아군 회피는 적 공격 전에 체력을 바꿀 수 있으므로 치유 대상이 받는 피해 시드도 맞춘다.
    const h2 = healOnly(battle({ allies: [change(healer, { crit: 0.8, critDmg: 4 })], enemies: [striker] }, seed, healingTable));
    healFail += +(!h1.length || !isDeepStrictEqual(h1, h2));
  }
  record('binary_repeat', sampleRounds, diffs, `evades=${misses};crits=${crits};heals=${heals}`);
  record('input_mutation', sampleRounds, inputsChanged, '');
  record('fixed_hit_draw_order', sampleRounds * 15, drawFail, '독립 대조 난수와 상태 비교');
  record('integrated_hit_rng_first_attack', sampleRounds, integrationFail, '독립 :hit 스트림에서 첫 피해·회피·치명타 대조');
  record('physical_energy_defense', sampleRounds * 2, routingFail, '자기 방어만 바꾸면 피해 하락');
  record('healing_no_crit', sampleRounds, healFail, '명중한 적 공격 후 치유 대상 고정');
  const saturated = change(physical, { crit: 10, eva: 10, critDmg: 10 });
  const capped = computeEffectiveStats(tables, saturated.unit);
  for (const key of ['crit', 'eva', 'critDmg'] as const) {
    const limit = tables.stats.caps[key];
    record(key + '_cap', 1, +(limit === undefined || capped[key] !== limit), `configured=${limit};effective=${capped[key]}`);
  }
  const stack = traits(physical, ['fighting_spirit', 'unique_m12', 'honed', 'human_will']);
  const statCapped = computeEffectiveStats(tables, stack.unit, { round: 8, hpRatio: 0.2 });
  record('statMul_cap', 1, +(Math.abs(statCapped.pAtk / stack.unit.stats.pAtk - 1 - tables.traits.caps.statMulMax) > 0.0001), `raw=0.65;observed=${statCapped.pAtk / stack.unit.stats.pAtk - 1}`);
  const caps = tables.traits.caps;
  const allTypes: TraitRow = { ...tables.traits.traits[0], id: 'audit_stack', ranks: [{ effects: [
    { trigger: { type: 'always' }, effect: { kind: 'damageMul', scope: 'self', value: 0.9 } },
    { trigger: { type: 'always' }, effect: { kind: 'healMul', scope: 'self', value: 0.9 } },
    { trigger: { type: 'always' }, effect: { kind: 'damageTakenMul', scope: 'self', value: -0.9 } },
  ] }] };
  const stressTable = { ...tables, traits: { ...tables.traits, traits: [...tables.traits.traits, allTypes] } };
  const stacker = traits(physical, ['audit_stack']).unit;
  for (const [kind, cap] of [['damageMul', caps.damageMulMax], ['healMul', caps.healMulMax], ['damageTakenMul', caps.damageTakenMulMin]] as const) {
    const value = traitMultiplier(stressTable, stacker, kind);
    record(kind + '_cap', 1, +(Math.abs(value - 1 - cap) > 1e-10), `configured=${cap};multiplier=${value}`);
  }
  const healingNoHit = { ...healingTable, combat: { ...healingTable.combat, maxRounds: 2 } };
  const enemyNoCrit = change(striker, { pAtk: 75 });
  // 첫 명중이 성공하는 시드로 치유 발생 시 회피율 차이를 대조한다.
  let healEvaN = 0, healEvaFail = 0;
  for (let i = 0; i < sampleRounds; i++) {
    const seed = 'heal-eva:' + i;
    const hit = createRng(seed + ':hit');
    hit.next();
    if (hit.next() < 0.5) continue;
    const h1 = battle({ allies: [healer], enemies: [enemyNoCrit] }, seed, healingNoHit);
    const h2 = battle({ allies: [change(healer, { eva: 0.5 })], enemies: [enemyNoCrit] }, seed, healingNoHit);
    const getFirstRoundHeal = (r: CombatResult) => r.events.flatMap(e => e.type === 'action' && e.round === 1 ? e.effects.filter(x => x.kind === 'heal') : []);
    healEvaN++;
    healEvaFail += +(!getFirstRoundHeal(h1).length || !isDeepStrictEqual(getFirstRoundHeal(h1), getFirstRoundHeal(h2)));
  }
  record('healing_no_evasion', healEvaN, healEvaFail, `사전 명중 고정, 후보 시드 ${sampleRounds}개`);
  record('special_disabled', tables.stats.special.length, tables.stats.special.filter(x => x.enabled).length, '설정 행');
  const mismatches = draft.filter(d => {
    const row = roster.find(r => r.id === d.id)!;
    return JSON.stringify(row.baseStats) !== JSON.stringify(d.baseStats) || JSON.stringify(row.traits?.map(id => tables.traits.traits.find(t => t.id === id)?.name)) !== JSON.stringify(d.traits);
  });
  record('draft_round_trip', draft.length, mismatches.length, mismatches.map(x => x.id).join(';'));
  const save = newGame(tables, { seed: 'days', guildName: '검수 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
  writeFileSync(join(directory, 'repro-save.json'), serializeSave(createSaveFile(save, 'manual', new Date('2026-11-24T00:00:00Z'))) + '\n');

  // 같은 유닛 스탯과 리프트에 특성만 다른 입력을 연달아 넘겨 캐시 키 검증.
  const a = change(generic('mage', 15, 'cache'), { eAtk: 55 });
  const buffed = traits(a, ['focus']);
  let witness = '';
  let attempts = 0;
  let badCache = 0;
  for (let level = 15; level <= 26 && !witness; level++) for (let attack = 16; attack <= 170 && !witness; attack += 1) {
    a.unit.stats.eAtk = attack;
    buffed.unit.stats.eAtk = attack;
    const reward = { zero: [0, 0] as [number, number], arche: [0, 0] as [number, number], materials: {} };
    const visible: VisibleRift = {
      riftId: `cache:${level}:${attack}`, grade: 'mid', tier: 'gate', scouting: scoutingRow(tables, save.facilities),
      level: [level, level], count: [2, 2], monsterIds: ['rift_caller'], monsterCounts: { rift_caller: 2 },
      elements: ['void'], deadline: null, victoryReward: reward, retreatReward: reward, omenHidden: true, blurred: false,
    };
    const foes = estimatedEnemies(tables, visible, level, 2);
    const exact = (unit: CombatSlot) => {
      let wins = 0;
      for (let i = 0; i < tables.combatPower.simulations; i++) wins += isWin(battle({ allies: [unit], enemies: foes }, `power:${visible.riftId}:${i}`));
      return riskTierOf(tables, wins / tables.combatPower.simulations).id;
    };
    attempts++;
    if (exact(a) === exact(buffed)) continue;
    const cold = estimateRisk(tables, [a], visible).worst.id;
    const warm = estimateRisk(tables, [buffed], visible).worst.id;
    const fresh = estimateRisk({ ...tables }, [buffed], visible).worst.id;
    if (warm !== fresh) {
      badCache++;
      witness = `rift=${visible.riftId};eAtk=${attack};cold=${cold};warm=${warm};fresh=${fresh}`;
    }
  }
  record('risk_cache_trait_key', attempts, badCache, witness);
  const auraSource = traits(generic('commander', 35, 'aura'), ['unique_m26']);
  const recipient = generic('shield', 35, 'recipient');
  const party = [auraSource, recipient];
  const aura = party.flatMap(s => allyAuraRows(tables, s.unit));
  const full = Math.round(party.reduce((sum, s) => sum + statsPower(tables, computeEffectiveStats(tables, s.unit, { round: 1, hpRatio: 1, row: s.row, allyAuras: aura })), 0));
  record('power_party_aura', 1, +(full !== combatPower(tables, party)), `party=${combatPower(tables, party)};full=${full}`);
  csv('checks', ['check', 'n', 'failures', 'details'], checks);
}

function power() {
  const headers = ['hp', 'pAtk', 'eAtk', 'pDef', 'eDef', 'spd', 'critExtraP', 'critExtraE', 'evaExtraHp'];
  function features(party: CombatSlot[]) {
    const sums = headers.map(() => 0);
    for (const { unit, row } of party) {
      const s = computeEffectiveStats(tables, unit, { round: 1, hpRatio: 1, row, allyAuras: allyAuraRows(tables, unit) });
      const c = s.crit * (s.critDmg - 1);
      const values = [s.hp, s.pAtk, s.eAtk, s.pDef, s.eDef, s.spd, s.pAtk * c, s.eAtk * c, s.hp / (1 - s.eva) - s.hp];
      values.forEach((v, i) => sums[i] += v);
    }
    return sums;
  }
  const rows: Cell[][] = [];
  const gradeFilter = arg || 'all';
  const panel = Number(extra ?? 0);
  for (const grade of tables.monsterGrades.filter(g => gradeFilter === 'all' || g.id === gradeFilter)) {
    const species = tables.monsters.filter(m => m.grades.includes(grade.id));
    for (let level = grade.level[0]; level <= grade.level[1]; level++) for (let size = 1; size <= 5; size++) {
      const id = `${grade.id}:${level}:${size}:${panel}`;
      const rng = createRng('party:' + id);
      const pool = [...roster];
      const ranged = (panel + size + level) % 5 !== 0;
      const count = ranged ? Math.max(1, Math.min(5, size + rng.pick([-1, 0, 0, 0, 1]))) : rng.int(1, 5);
      const targetLevel = level + Math.round(Math.log(count * grade.statMultiplier / size) / Math.log(1.035)) + rng.int(-6, 6);
      // 실제 성장 한계를 넘지 않는 범위에서 계약자와 개별 레벨을 뽑는다.
      const allies = Array.from({ length: size }, () => {
        const m = pool.splice(rng.int(0, pool.length - 1), 1)[0];
        const lv = ranged ? Math.min(m.growth.cap, Math.max(1, targetLevel + rng.int(-3, 3))) : rng.int(1, m.growth.cap);
        return contract(m, lv);
      });
      const enemies = Array.from({ length: count }, (_, i) => monster(rng.pick(species), grade.id, level, i));
      const f = { allies, enemies };
      const prefix = 'power:' + id;
      let risk12 = 0, risk48 = 0, risk96 = 0;
      for (let i = 0; i < 96; i++) {
        const w = isWin(battle(f, prefix + ':' + i));
        risk96 += w;
        if (i < 48) risk48 += w;
        if (i < 12) risk12 += w;
      }
      const aPower = combatPower(tables, allies), ePower = combatPower(tables, enemies);
      rows.push([id, grade.id, level, size, count, ranged, allies.map(x => x.unit.id + '@' + x.unit.level).join(';'),
        enemies.map(x => x.unit.name).join(';'), aPower, ePower, aPower / ePower, risk12, risk48, risk96,
        ...features(allies), ...features(enemies), ...sample(f, 'truth:' + id)]);
    }
  }
  csv(`power-${gradeFilter}-${panel}`, ['id', 'grade', 'enemy_level', 'size', 'enemy_count', 'near_level_panel', 'allies', 'enemies', 'ally_power', 'enemy_power', 'ratio', 'wins12', 'wins48', 'wins96',
    ...headers.map(x => 'a_' + x), ...headers.map(x => 'e_' + x), ...fightHeader], rows);
}

function roundRobin() {
  const rows: Cell[][] = [];
  const symmetric = { ...tables, combat: { ...tables.combat, composition: { ...tables.combat.composition, appliesToSides: ['ally', 'enemy'] as ('ally' | 'enemy')[] } } };
  for (const level of [1, 15, 30, 50]) for (const a of roles) for (const b of roles) {
    const f = (size: number) => ({
      allies: Array.from({ length: size }, (_, i) => generic(a.id, level, 'a' + i)),
      enemies: Array.from({ length: size }, (_, i) => generic(b.id, level, 'b' + i)),
    });
    rows.push([level, a.id, b.id, 1, 'live', ...sample(f(1), `rr:${level}:${a.id}:${b.id}`)]);
    if (a.id === b.id) rows.push([level, a.id, b.id, 1, 'symmetric', ...sample(f(1), `mirror:${level}:${a.id}`, n, symmetric)]);
    if (a.id === b.id) rows.push([level, a.id, b.id, 3, 'symmetric', ...sample(f(3), `mirror3:${level}:${a.id}`, n, symmetric)]);
  }
  csv('roles', ['level', 'ally_role', 'enemy_role', 'per_side', 'composition', ...fightHeader], rows);
}

function team(level: number, ids = ['shield', 'archer', 'healer']) {
  return ids.map((r, i) => generic(r, level, 'a' + i, 'fire'));
}
function matchedEnemies(allies: CombatSlot[], level: number, key: string, element = 'void') {
  // 18개의 사전 시드로 수준을 고정한다. 본 실험은 다른 시드로 실행한다.
  const species = ['husk_guard', 'spore_spitter', 'rift_caller'].map(id => tables.monsters.find(m => m.id === id)!);
  const make = (lv: number) => species.map((m, i) => {
    const s = monster(m, 'mid', Math.max(1, lv), i);
    return { ...s, unit: { ...s.unit, element } };
  });
  let best = make(level);
  let distance = Infinity;
  for (let lv = Math.max(1, level - 10); lv <= level + 6; lv++) {
    const f = { allies, enemies: make(lv) };
    let wins = 0;
    for (let i = 0; i < 18; i++) wins += isWin(battle(f, `pilot:${key}:${i}`));
    const score = Math.abs(wins - 9) + Math.abs(lv - level) / 100;
    if (score < distance) { distance = score; best = f.enemies; }
  }
  return best;
}

function members() {
  const rows: Cell[][] = [];
  const duplicateGroups = new Map<string, string[]>();
  for (const m of roster) {
    const key = JSON.stringify([m.role, m.baseStats]);
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), m.id]);
  }
  const panels = [15, 35].flatMap(level => roles.map(r => {
    const allies = team(level);
    const baseline = [...allies, generic(r.id, level, 'reference', 'fire')];
    const enemies = matchedEnemies(baseline, level, `roster:${level}:${r.id}`);
    return { level, roleId: r.id, allies, enemies };
  }));
  for (const { level, roleId, allies, enemies } of panels) {
    const base = { allies, enemies };
    for (const m of roster.filter(x => x.role === roleId)) {
      const s = contract(m, level);
      const reference = { allies: [...allies, generic(roleId, level, 'reference', m.element)], enemies };
      const treated = { allies: [...allies, s], enemies };
      const budget = statsPower(tables, m.baseStats!) / statsPower(tables, tables.stats.roleBase[m.role].base);
      const same = duplicateGroups.get(JSON.stringify([m.role, m.baseStats]))!.filter(x => x !== m.id).join(';');
      for (const [name, off] of [['addition', base], ['same_role', reference]] as const) {
        rows.push([m.id, m.name, m.role, m.element, level, enemies[0].unit.level, budget, draft.find(d => d.id === m.id)!.powerRatio, same,
          name, ...paired(off, treated, `roster:${level}:${m.role}`)]);
      }
    }
  }
  csv('members', ['id', 'name', 'role', 'element', 'level', 'enemy_level', 'budget', 'draft_budget', 'equal_base_ids', 'control', ...pairHeader], rows);
}

function sensitivity() {
  const rows: Cell[][] = [];
  const changes: [string, (s: Stats) => Partial<Stats>][] = [
    ['crit_+0.10', s => ({ crit: s.crit + 0.10 })],
    ['critDmg_+0.25', s => ({ critDmg: s.critDmg + 0.25 })],
    ['eva_+0.05', s => ({ eva: s.eva + 0.05 })],
    ['hp_x1.10', s => ({ hp: s.hp * 1.10 })],
    ['def_pair_x1.10', s => ({ pDef: s.pDef * 1.10, eDef: s.eDef * 1.10 })],
    ...(['pDef', 'eDef', 'spd'] as const).flatMap(key => tables.stats.roleBounds[key].map((v, i): [string, (s: Stats) => Partial<Stats>] =>
      [`${key}_${i ? 'upper' : 'lower'}`, s => ({ [key]: s[key] * v })])),
  ];
  for (const roleId of ['shield', 'archer', 'mage', 'healer']) {
    const level = 25, subject = generic(roleId, level, 'subject', 'fire');
    const allies = [...team(level), subject];
    const enemies = matchedEnemies(allies, level, 'sens:' + roleId);
    const off = { allies, enemies };
    for (const [name, modifier] of changes) {
      const modified = change(subject, modifier(subject.unit.stats));
      const on = { allies: [...allies.slice(0, -1), modified], enemies };
      const budgetDelta = statsPower(tables, modified.unit.stats) / statsPower(tables, subject.unit.stats) - 1;
      rows.push([roleId, level, enemies[0].unit.level, name, budgetDelta, ...paired(off, on, 'sens:' + roleId)]);
    }
  }
  csv('sensitivity', ['role', 'level', 'enemy_level', 'variant', 'subject_power_delta', ...pairHeader], rows);

  const elemental: Cell[][] = [];
  for (const roleId of ['warrior', 'mage']) {
    const a = generic(roleId, 25, 'a', 'fire');
    const baseDefender = generic('shield', 25, 'z');
    let defender = baseDefender;
    let gap = Infinity;
    // 중립 방어 1.0에서 양쪽이 이길 여지가 있게 수호자의 공격만 사전 시드로 고른다.
    for (let scale = 1; scale <= 12; scale += 0.125) {
      const enemy = change(baseDefender, { pAtk: baseDefender.unit.stats.pAtk * scale });
      let wins = 0;
      for (let i = 0; i < 32; i++) wins += isWin(battle({ allies: [a], enemies: [enemy] }, 'pilot:element:' + i));
      if (Math.abs(wins - 16) < gap) { defender = enemy; gap = Math.abs(wins - 16); }
    }
    for (const element of ['wind', 'void', 'frost']) for (const band of [0.7, 1, 1.4]) {
      const stat = roleId === 'warrior' ? 'pDef' : 'eDef';
      const e = change({ ...defender, unit: { ...defender.unit, element } }, { [stat]: defender.unit.stats[stat] * band });
      const f = { allies: [a], enemies: [e] };
      let hitSum = 0, hitN = 0;
      for (let i = 0; i < n; i++) {
        const r = battle(f, 'element:' + roleId + ':' + i);
        const action = r.events.find(x => x.type === 'action' && x.actor === 'a0' && x.effects.some(y => y.kind === 'damage'));
        if (action?.type !== 'action') continue;
        const hit = action.effects.find(x => x.kind === 'damage');
        if (hit?.kind !== 'damage') continue;
        hitN++;
        hitSum += hit.amount;
      }
      elemental.push([roleId, element, elementMultiplier(tables, a.unit.element, element), elementMultiplier(tables, element, a.unit.element), stat, band, defender.unit.stats.pAtk, hitN, hitSum / hitN,
        ...sample(f, 'element:' + roleId)]);
    }
  }
  csv('elements', ['role', 'enemy_element', 'outgoing_mult', 'incoming_mult', 'matched_defense', 'defense_band', 'defender_pAtk', 'first_hits', 'mean_first_damage', ...fightHeader], elemental);
}

function traitTests() {
  const rows: Cell[][] = [];
  const proposals: Cell[][] = [];
  const changes: Record<string, { stat: string; value: number }> = {
    sturdy: { stat: 'hp', value: .04 },
    unique_m05: { stat: 'hp', value: .08 },
    unique_m20: { stat: 'spd', value: .03 },
    unique_m27: { stat: 'hp', value: .06 },
  };
  for (const t of tables.traits.traits) {
    const assigned = roster.filter(m => m.traits?.includes(t.id));
    const { roles: r, backgrounds: b, races, elements, owner } = t.allowed;
    const eligible = roster.filter(m => (!r || r.includes(m.role)) && (!b || b.includes(m.background)) &&
      (!races || races.includes(m.race)) && (!elements || elements.includes(m.element)) && (!owner || owner === m.id));
    const m = (assigned.length ? assigned : eligible)[0];
    if (!m) {
      rows.push([t.id, t.name, t.category, '', false, null, '', null, ...pairHeader.map(() => null)]);
      continue;
    }
    const idx = m.traits?.indexOf(t.id) ?? -1;
    const lv = idx >= 0 ? tables.traits.slotUnlockLevels[idx] : Math.min(m.growth.cap, 25);
    const subject = traits(contract(m, lv), []);
    const ally = [subject, ...team(lv)];
    const rowsOfTrait = t.ranks[0].effects;
    const conditional = rowsOfTrait.some(x => x.condition?.type === 'advantage' || x.condition?.type === 'disadvantage');
    const advantageous = tables.elements.find(e => e.id === m.element)!.strongAgainst[0];
    const disadvantageous = tables.elements.find(e => e.strongAgainst.includes(m.element))?.id;
    const alternate = rowsOfTrait.some(x => x.condition?.type === 'disadvantage') ? disadvantageous : advantageous;
    for (const el of new Set(['void', ...(conditional && alternate ? [alternate] : [])])) {
      const key = `trait:${t.id}:${el}`;
      const enemies = matchedEnemies(ally, lv, key, el);
      const on = [traits(subject, [t.id]), ...ally.slice(1)];
      const fight = { allies: on, enemies };
      rows.push([t.id, t.name, t.category, m.id, idx >= 0, lv, el, enemies[0].unit.level, ...paired({ allies: ally, enemies }, fight, key)]);
      const candidate = changes[t.id];
      if (el === 'void' && candidate) {
        const from = t.ranks[0].effects.find(r => r.effect.stat === candidate.stat)!.effect.value!;
        const changeTrait = { ...t, ranks: t.ranks.map(rank => ({ ...rank, effects: rank.effects.map(row =>
          row.effect.stat === candidate.stat ? { ...row, effect: { ...row.effect, value: candidate.value } } : row) })) };
        const alternative = { ...tables, traits: { ...tables.traits, traits: tables.traits.traits.map(r => r.id === t.id ? changeTrait : r) } };
        proposals.push([t.id, t.name, candidate.stat, from, candidate.value, ...paired(fight, fight, key, tables, alternative)]);
      }
    }
  }
  csv('traits', ['id', 'name', 'category', 'contract', 'assigned', 'level', 'enemy_element', 'enemy_level', ...pairHeader], rows);

  csv('trait-proposals', ['id', 'name', 'stat', 'original', 'candidate', ...pairHeader], proposals);

  const curves: Cell[][] = [];
  for (const [i, lv] of tables.traits.slotUnlockLevels.entries()) {
    const chosen = roster.filter(m => m.growth.cap >= lv && (m.traits?.length ?? 0) > i);
    // 슬롯마다 첫 두 계약자를 측정하고, 나머지 도달 범위는 CSV의 eligible 열에 기록.
    for (const m of chosen.slice(0, 2)) {
      const prev = contract(m, lv - 1);
      const curr = contract(m, lv);
      const oldTraits = prev.unit.traits!.map(t => t.id);
      const allies = team(lv);
      const control = { allies: [...allies, traits(curr, oldTraits)], enemies: [] as CombatSlot[] };
      const key = `curve:${m.id}:${lv}`;
      const enemies = matchedEnemies(control.allies, lv, key);
      control.enemies = enemies;
      const full = { allies: [...allies, curr], enemies };
      const previous = { allies: [...allies, prev], enemies };
      for (const [kind, off, on] of [['total_level_step', previous, full], ['unlock_only', control, full]] as const) {
        curves.push([lv, m.id, m.name, m.traits![i], chosen.length, enemies[0].unit.level, kind, ...paired(off, on, key)]);
      }
    }
  }
  csv('unlocks', ['level', 'id', 'name', 'trait', 'eligible', 'enemy_level', 'comparison', ...pairHeader], curves);

  // 실제 계약자 스탯·특성을 사용한 최대 단계 상황 표본. 전투에서 각 조건의 빈도와는 별개다.
  const caps = tables.traits.caps;
  const uncapped = { ...tables, stats: { ...tables.stats, caps: {} }, traits: { ...tables.traits, caps: { ...caps, statMulMax: 100, damageMulMax: 100, damageTakenMulMin: -100, healMulMax: 100 } } };
  const capRows: Cell[][] = [];
  for (const m of roster) {
    const { unit, row } = contract(m, m.growth.cap);
    let contexts = 0, stat = 0, crit = 0, critDmg = 0, eva = 0, damage = 0, taken = 0, healing = 0;
    const auras = allyAuraRows(tables, unit);
    for (const e of tables.elements) for (let round = 1; round <= tables.combat.maxRounds; round++) for (const hpRatio of [1, 0.4, 0.3, 0.25, 0.1]) {
      const ctx = { row, round, hpRatio, healTargetHpRatio: hpRatio, firstAction: round === 1, opponentElement: e.id, allyAuras: auras };
      const a = computeEffectiveStats(tables, unit, ctx), b = computeEffectiveStats(uncapped, unit, ctx);
      contexts++;
      stat += +CORE_STATS.some(k => a[k] !== b[k]);
      crit += +(a.crit !== b.crit); critDmg += +(a.critDmg !== b.critDmg); eva += +(a.eva !== b.eva);
      damage += +(traitMultiplier(tables, unit, 'damageMul', ctx) !== traitMultiplier(uncapped, unit, 'damageMul', ctx));
      taken += +(traitMultiplier(tables, unit, 'damageTakenMul', ctx) !== traitMultiplier(uncapped, unit, 'damageTakenMul', ctx));
      healing += +(traitMultiplier(tables, unit, 'healMul', ctx) !== traitMultiplier(uncapped, unit, 'healMul', ctx));
    }
    capRows.push([m.id, m.growth.cap, contexts, stat, crit, critDmg, eva, damage, taken, healing]);
  }
  csv('trait-caps', ['id', 'level', 'contexts', 'core', 'crit', 'critDmg', 'eva', 'damage', 'taken', 'heal'], capRows);

  const seen: Cell[][] = [];
  for (const id of ['m12', 'm16']) {
    const m = roster.find(x => x.id === id)!;
    const focal = contract(m, m.growth.cap);
    const allies = [focal, ...team(m.growth.cap)];
    const key = 'live-cap:' + id;
    const enemies = matchedEnemies(allies, m.growth.cap, key);
    let total = 0, clipped = 0, fightsClipped = 0;
    for (let i = 0; i < n; i++) {
      const result = battle({ allies, enemies }, key + ':' + i);
      const start = result.events[0];
      if (start.type !== 'start') throw new Error('전투 시작 이벤트 없음');
      const maxHp = start.combatants.find(x => x.key === 'a0')!.maxHp;
      let hp = maxHp, actions = 0, thisFight = 0;
      for (const event of result.events) {
        if (event.type !== 'action') continue;
        for (const effect of event.effects) {
          if (effect.target === 'a0' && (effect.kind === 'damage' || effect.kind === 'heal')) hp = effect.hpAfter;
          if (effect.kind !== 'damage' || event.actor !== 'a0') continue;
          const ctx = { row: focal.row, round: event.round, hpRatio: hp / maxHp, firstAction: actions === 0, opponentElement: 'void' };
          total++;
          thisFight += +(computeEffectiveStats(tables, focal.unit, ctx).pAtk !== computeEffectiveStats(uncapped, focal.unit, ctx).pAtk);
        }
        if (event.actor === 'a0') actions++;
      }
      clipped += thisFight;
      fightsClipped += +(thisFight > 0);
    }
    seen.push([id, m.growth.cap, enemies[0].unit.level, n, fightsClipped, total, clipped, ...wilson(fightsClipped, n)]);
  }
  csv('trait-caps-in-fights', ['id', 'level', 'enemy_level', 'n', 'clipped_fights', 'hits', 'clipped_hits', 'ci_low', 'ci_high'], seen);
}

type Engine = {
  tables: GameTables;
  resolveCombat: typeof resolveCombat;
  createMercenary: typeof createMercenary;
  createMonster: typeof createMonster;
  mercToUnit: typeof mercToUnit;
  newGame: typeof newGame;
  isAvailable: typeof isAvailable;
  visibleRift: typeof visibleRift;
  estimateRisk: typeof estimateRisk;
  riftEnemySlots: typeof riftEnemySlots;
  autoParty: typeof autoParty;
  autoplayDay: typeof autoplayDay;
};
const live: Engine = { tables, resolveCombat, createMercenary, createMonster, mercToUnit, newGame, isAvailable, visibleRift, estimateRisk, riftEnemySlots, autoParty, autoplayDay };
async function loadEngine(path?: string): Promise<Engine> {
  if (!path) return live;
  const load = (file: string) => import(pathToFileURL(resolve(path, file)).href);
  const modules = await Promise.all([
    load('src/data/index.ts'), load('src/engine/combat.ts'), load('src/engine/unit.ts'), load('src/engine/game.ts'),
    load('src/engine/facilities.ts'), load('src/engine/combatPower.ts'), load('src/engine/rift.ts'), load('src/engine/autoParty.ts'), load('scripts/autoplay.ts'),
  ]);
  return Object.assign({}, ...modules);
}

async function compare() {
  if (!arg) throw new Error('016 이전 저장소 worktree 경로가 필요하다.');
  const before = await loadEngine(arg);
  const rows: Cell[][] = [];
  const balanceRoles = [['shield', 'frost'], ['warrior', 'fire'], ['archer', 'lightning'], ['mage', 'wind'], ['healer', 'light']];
  const opponentRoles = ['warrior', 'shield', 'archer', 'mage', 'commander'];
  type Case = [number, number, string, number, number, string];
  const cases: Case[] = [];
  for (const l of [1, 10, 30, 50, 70]) for (const [g, c] of [['low', 3], ['mid', 3], ['high', 4], ['extreme', 3], ['extreme', 4]] as const) cases.push([l, l, g, c, 5, 'same_level']);
  for (const [a, b] of [[1, 70], [70, 1], [5, 15], [5, 10], [30, 40], [40, 30]]) cases.push([a, b, 'mid', 3, 5, 'level_gap']);
  cases.push([65, 60, 'extreme', 4, 5, 'level_gap']);
  for (const l of [1, 3, 5, 8, 12]) for (const c of [2, 3]) cases.push([5, l, 'low', c, 3, 'starter_3']);
  for (const [g, l] of [['low', 12], ['mid', 15], ['mid', 20]] as const) cases.push([5, l, g, 3, 4, 'starter_4']);
  for (const [pl, el, grade, count, size, label] of cases) {
    function gen(e: Engine) {
      const specs = label === 'starter_4'
        ? e.tables.roster.filter(r => r.startingCandidate).map(r => ({ id: r.id, name: r.name, role: r.role, element: r.element, level: pl }))
        : balanceRoles.slice(0, size).map(([role, element], i) => ({ id: 'p' + i, name: role, role, element, level: pl }));
      const allies = specs.map(s => ({ unit: e.createMercenary(e.tables, s), row: getRole(e.tables, s.role).defaultRow }));
      const enemies = opponentRoles.slice(0, count).map((role, i) => ({
        unit: e.createMonster(e.tables, { id: 'e' + i, name: role, role, element: 'void', level: el, grade }),
        row: getRole(e.tables, role).defaultRow,
      }));
      return { allies, enemies };
    }
    const a = gen(before), b = gen(live);
    let aw = 0, bw = 0, gains = 0, losses = 0;
    for (let i = 0; i < n; i++) {
      const seed = 'b' + i;
      const x = isWin(before.resolveCombat(before.tables, { ...a, seed }));
      const y = isWin(battle(b, seed));
      aw += x; bw += y; gains += +(y > x); losses += +(x > y);
    }
    // 016에서 난수 스트림이 바뀌었으므로 두 비율의 독립 근사 구간도 보존한다.
    const x = aw / n, y = bw / n;
    const [xl, xu] = wilson(aw, n), [yl, yu] = wilson(bw, n);
    const delta = y - x;
    rows.push([label, pl, el, grade, count, size, n, aw, bw, gains, losses, delta, delta - Math.hypot(y - yl, xu - x), delta + Math.hypot(yu - y, x - xl)]);
  }
  csv('before-after-' + (extra ?? 'parent'), ['case', 'ally_level', 'enemy_level', 'grade', 'enemy_count', 'ally_count', 'n', 'before_wins', 'after_wins', 'gain', 'loss', 'delta', 'delta_ci_low', 'delta_ci_high'], rows);
}

async function days() {
  const e = await loadEngine(arg);
  const lowRiftProposal = section === 'days-proposal';
  const t: GameTables = lowRiftProposal ? {
    ...e.tables,
    riftTiers: e.tables.riftTiers.map(row => row.id !== 'crack' ? row : {
      ...row,
      variants: [...(row.variants ?? []), {
        id: 'small_low', label: '소규모', weight: 2, monsterLevel: [6, 15],
        enemyCount: [1, 2], monsterGradeWeights: { low: 1 },
      }],
    }),
  } : e.tables;
  const dayCount = Number(extra ?? 60);
  const seedPool = ['days', 'audit-20261120', ...Array.from({ length: 8 }, (_, i) => 'audit-' + (i + 2))];
  const rows: Cell[][] = [];
  const riftRows: Cell[][] = [];
  const rank = (p: number) => p >= .9 ? 1 : p >= .75 ? 2 : p >= .5 ? 3 : p >= .25 ? 4 : 5;
  const rankUI = (tier: { id: string; step: number }) => tier.step ?? ({ safe: 1, fair: 3, risky: 4, hopeless: 5 }[tier.id] ?? 5);
  for (let j = 0; j < n; j++) {
    const seed = seedPool[j] ?? 'progress:' + j;
    let state = e.newGame(t, { seed, guildName: '시험 길드', baseCityId: 'seoul', protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' } });
    for (let d = 0; d < dayCount; d++) {
      const available = state.mercenaries.filter(m => e.isAvailable(state, m.id)).length;
      const injured = state.mercenaries.filter(m => m.affiliation.kind === 'guild' && m.injury && m.injury.recoverDay > state.day).length;
      const sendable = state.rifts.filter(r => r.deadlineDay === null || state.day + travelDays(t, state.baseCityId, r.cityId) <= r.deadlineDay);
      const actualBands = new Set<number>(), displayBands = new Set<number>();
      let possibleDisplay = false, definiteDisplay = false;
      const byId = new Map<string, { truth: number; best: number; worst: number }>();
      for (const r of sendable) {
        const auto = e.autoParty(t, state, r);
        if (!auto.length) continue;
        const allies = auto.map(p => {
          const m = state.mercenaries.find(m => m.id === p.mercId)!;
          return { unit: e.mercToUnit(t, m), row: p.row ?? getRole(t, m.role).defaultRow };
        });
        const rivals = e.riftEnemySlots(t, r);
        let wins = 0;
        for (let i = 0; i < t.combatPower.simulations; i++) wins += isWin(e.resolveCombat(t, { allies, enemies: rivals, seed: `power:${r.id}:${i}` }));
        const truth = rank(wins / t.combatPower.simulations);
        const risk = e.estimateRisk(t, allies, e.visibleRift(t, state.facilities, r));
        const best = rankUI(risk.best), worst = rankUI(risk.worst);
        actualBands.add(truth); displayBands.add(worst);
        possibleDisplay ||= best <= 3 && worst >= 2;
        definiteDisplay ||= best >= 2 && worst <= 3;
        byId.set(r.id, { truth, best, worst });
        riftRows.push([seed, state.day, r.id, r.cityId, r.tier, r.variant ?? '', allies.length, wins, best, worst, truth]);
      }
      const ids = new Set(state.expeditions.map(x => x.id));
      const next = e.autoplayDay(t, state);
      const departures = next.state.expeditions.filter(x => !ids.has(x.id) && x.departDay === state.day);
      const reports = next.events.flatMap(event => event.type === 'returned' ? next.state.reports.filter(r => r.expeditionId === event.expeditionId) : []);
      // 당일 복귀 파견은 새 expedition 상태에서 빠지므로 보고서에서도 출발을 복원한다.
      const returnedSameDay = reports.filter(r => !ids.has(r.expeditionId));
      const selected = [...departures.map(x => x.rift.id), ...returnedSameDay.map(x => x.rift.id)];
      const selectedBands = selected.map(id => byId.get(id)?.truth ?? '').join(';');
      rows.push([seed, state.day, available, sendable.length, byId.size, injured, +[...actualBands].some(x => x === 2 || x === 3), +definiteDisplay, +possibleDisplay,
        [...actualBands].sort().join(';'), [...displayBands].sort().join(';'), selected.length, selectedBands, reports.length,
        reports.filter(x => x.outcome === 'victory').length, reports.reduce((sum, r) => sum + r.injuries.length, 0), reports.filter(x => x.injuries.length > 0).length]);
      state = next.state;
    }
  }
  const label = lowRiftProposal ? 'small-low' : arg ? (t.combatPower.riskTiers.length === 5 ? 'parent' : 'main') : 'after';
  csv('days-' + label, ['seed', 'day', 'available', 'sendable_rifts', 'evaluated_rifts', 'injured_merc_days', 'target_actual_12', 'target_display_definite', 'target_display_possible', 'actual_bands', 'display_worst_bands', 'dispatched', 'selected_actual_bands', 'returned', 'victories', 'injuries', 'returns_with_injuries'], rows);
  if (!arg && !lowRiftProposal) csv('day-rifts-after', ['seed', 'day', 'rift', 'city', 'tier', 'variant', 'party_size', 'wins12_actual', 'display_best', 'display_worst', 'actual_tier'], riftRows);
}

switch (section) {
  case 'core': core(); break;
  case 'power': power(); break;
  case 'roles': roundRobin(); break;
  case 'members': members(); break;
  case 'sensitivity': sensitivity(); break;
  case 'traits': traitTests(); break;
  case 'compare': await compare(); break;
  case 'days':
  case 'days-proposal': await days(); break;
  default: throw new Error('알 수 없는 검수 분류: ' + section);
}
