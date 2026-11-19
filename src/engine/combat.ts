import {
  getElement,
  getRole,
  getSkill,
  type GameTables,
  type Row,
  type Side,
  type SkillRow,
  type StatId,
} from '../data';
import { createRng, type Rng } from './rng';
import type { Unit } from './unit';

export interface CombatSlot {
  unit: Unit;
  row: Row;
}

export interface CombatInput {
  allies: CombatSlot[];
  enemies: CombatSlot[];
  seed: number | string;
}

export type CombatOutcome = 'victory' | 'defeat' | 'retreat';

export type StatusType = 'taunt' | 'buff';

export interface Status {
  type: StatusType;
  skillId: string;
  stat?: StatId;
  amount?: number;
  /** 남은 라운드 수. 라운드가 끝날 때 1씩 준다. */
  remaining: number;
}

/** 전투 로그에서 유닛을 가리키는 키. 아군은 a0.., 적은 e0.. */
export type CombatantKey = string;

export interface CombatantSnapshot {
  key: CombatantKey;
  unitId: string;
  name: string;
  side: Side;
  row: Row;
  element: string;
  role: string;
  level: number;
  hp: number;
  maxHp: number;
  offRow: boolean;
}

export type CombatEffect =
  | {
      kind: 'damage';
      target: CombatantKey;
      amount: number;
      hpAfter: number;
      elementMultiplier: number;
      downed: boolean;
    }
  | { kind: 'heal'; target: CombatantKey; amount: number; hpAfter: number }
  | { kind: 'status'; target: CombatantKey; status: StatusType; stat?: StatId; amount?: number; duration: number };

export type CombatEvent =
  | {
      type: 'start';
      seed: number | string;
      combatants: CombatantSnapshot[];
      compositionMultiplier: Record<Side, number>;
    }
  | { type: 'round'; round: number; order: CombatantKey[] }
  | { type: 'action'; round: number; actor: CombatantKey; skillId: string; effects: CombatEffect[] }
  | { type: 'expire'; round: number; target: CombatantKey; status: StatusType; skillId: string }
  | { type: 'end'; outcome: CombatOutcome; rounds: number };

export interface CombatResult {
  outcome: CombatOutcome;
  rounds: number;
  events: CombatEvent[];
  /** 유닛 id → 전투 종료 시 체력 */
  finalHp: Record<string, number>;
  /** 쓰러진 유닛 id (양 진영) */
  downedUnitIds: string[];
}

interface Combatant {
  key: CombatantKey;
  unit: Unit;
  side: Side;
  row: Row;
  offRow: boolean;
  hp: number;
  maxHp: number;
  cooldowns: Record<string, number>;
  statuses: Status[];
  downed: boolean;
}

/** 파티 편성 규칙 검사. 문제가 없으면 빈 배열. */
export function validateParty(tables: GameTables, slots: CombatSlot[]): string[] {
  const { maxSize, maxPerRow } = tables.combat.party;
  const errors: string[] = [];
  if (slots.length === 0) errors.push('파티가 비어 있다');
  if (slots.length > maxSize) errors.push(`파티는 최대 ${maxSize}명이다`);
  for (const row of ['front', 'back'] as Row[]) {
    if (slots.filter((s) => s.row === row).length > maxPerRow) errors.push(`한 열에는 최대 ${maxPerRow}명이다`);
  }
  const ids = slots.map((s) => s.unit.id);
  if (new Set(ids).size !== ids.length) errors.push('같은 유닛을 두 번 넣을 수 없다');
  for (const s of slots) {
    if (!getRole(tables, s.unit.role).enabled) errors.push(`1단계에서 쓰지 않는 역할: ${s.unit.role}`);
  }
  return errors;
}

/** 공격 속성과 대상 속성의 상성 배율. */
export function elementMultiplier(tables: GameTables, attacker: string, defender: string): number {
  const { advantage, disadvantage, neutral } = tables.combat.element;
  if (getElement(tables, attacker).strongAgainst.includes(defender)) return advantage;
  if (getElement(tables, defender).strongAgainst.includes(attacker)) return disadvantage;
  return neutral;
}

/** 파티 구성 배율: 있는 분류마다 +보너스, 없는 분류마다 -약점. */
export function compositionMultiplier(tables: GameTables, roleIds: string[]): number {
  const { groups, bonusPerPresentGroup, penaltyPerMissingGroup } = tables.combat.composition;
  const present = new Set(roleIds.map((r) => getRole(tables, r).group));
  let m = 1;
  for (const g of groups) m += present.has(g) ? bonusPerPresentGroup : -penaltyPerMissingGroup;
  return Math.round(m * 1e6) / 1e6; // 부동소수 오차 정리
}

function statWithBuffs(c: Combatant, stat: StatId): number {
  let bonus = 0;
  for (const s of c.statuses) if (s.type === 'buff' && s.stat === stat) bonus += s.amount ?? 0;
  return c.unit.stats[stat] * (1 + bonus);
}

const isTaunting = (c: Combatant) => c.statuses.some((s) => s.type === 'taunt');

export function resolveCombat(tables: GameTables, input: CombatInput): CombatResult {
  const errors = validateParty(tables, input.allies);
  if (errors.length) throw new Error(`잘못된 파티: ${errors.join(', ')}`);
  if (input.enemies.length === 0) throw new Error('적이 없다');

  const rng = createRng(input.seed);
  const cfg = tables.combat;

  const toCombatant = (slot: CombatSlot, side: Side, i: number): Combatant => ({
    key: `${side === 'ally' ? 'a' : 'e'}${i}`,
    unit: slot.unit,
    side,
    row: slot.row,
    offRow: getRole(tables, slot.unit.role).defaultRow !== slot.row,
    hp: slot.unit.stats.hp,
    maxHp: slot.unit.stats.hp,
    cooldowns: Object.fromEntries(slot.unit.skills.map((s) => [s, 0])),
    statuses: [],
    downed: false,
  });
  const all: Combatant[] = [
    ...input.allies.map((s, i) => toCombatant(s, 'ally', i)),
    ...input.enemies.map((s, i) => toCombatant(s, 'enemy', i)),
  ];

  const comp: Record<Side, number> = { ally: 1, enemy: 1 };
  for (const side of cfg.composition.appliesToSides) {
    comp[side] = compositionMultiplier(
      tables,
      all.filter((c) => c.side === side).map((c) => c.unit.role),
    );
  }

  const events: CombatEvent[] = [
    {
      type: 'start',
      seed: input.seed,
      compositionMultiplier: comp,
      combatants: all.map((c) => ({
        key: c.key,
        unitId: c.unit.id,
        name: c.unit.name,
        side: c.side,
        row: c.row,
        element: c.unit.element,
        role: c.unit.role,
        level: c.unit.level,
        hp: c.hp,
        maxHp: c.maxHp,
        offRow: c.offRow,
      })),
    },
  ];

  const alive = (side: Side) => all.filter((c) => c.side === side && !c.downed);
  const opponentSide = (side: Side): Side => (side === 'ally' ? 'enemy' : 'ally');
  const exposedRow = (cs: Combatant[]) => (cs.some((c) => c.row === 'front') ? cs.filter((c) => c.row === 'front') : cs);

  const pickSingleTarget = (side: Side, r: Rng): Combatant | undefined => {
    const foes = alive(opponentSide(side));
    if (foes.length === 0) return undefined;
    const taunters = foes.filter(isTaunting);
    return r.pick(taunters.length ? taunters : exposedRow(foes));
  };

  const dealDamage = (actor: Combatant, target: Combatant, skill: SkillRow): CombatEffect => {
    const k = cfg.damage.defenseConstant;
    const elem = elementMultiplier(tables, actor.unit.element, target.unit.element);
    let dmg = statWithBuffs(actor, 'atk') * (skill.power ?? 1) * (k / (k + statWithBuffs(target, 'def')));
    dmg *= elem * comp[actor.side];
    if (actor.offRow) dmg *= cfg.offRow.damageDealtMultiplier;
    if (target.offRow) dmg *= cfg.offRow.damageTakenMultiplier;
    dmg *= rng.float(cfg.damage.varianceMin, cfg.damage.varianceMax);
    const amount = Math.max(cfg.damage.minimum, Math.round(dmg));
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp === 0) {
      target.downed = true;
      target.statuses = [];
    }
    return { kind: 'damage', target: target.key, amount, hpAfter: target.hp, elementMultiplier: elem, downed: target.downed };
  };

  const heal = (actor: Combatant, target: Combatant, skill: SkillRow): CombatEffect => {
    const amount = Math.min(target.maxHp - target.hp, Math.round(statWithBuffs(actor, 'atk') * (skill.power ?? 1)));
    target.hp += amount;
    return { kind: 'heal', target: target.key, amount, hpAfter: target.hp };
  };

  const addStatus = (target: Combatant, skill: SkillRow, type: StatusType): CombatEffect => {
    const duration = skill.duration ?? 1;
    target.statuses = target.statuses.filter((s) => s.skillId !== skill.id);
    target.statuses.push({ type, skillId: skill.id, stat: skill.stat, amount: skill.amount, remaining: duration });
    return { kind: 'status', target: target.key, status: type, stat: skill.stat, amount: skill.amount, duration };
  };

  const isUseful = (actor: Combatant, skill: SkillRow): boolean => {
    const allies = alive(actor.side);
    switch (skill.kind) {
      case 'attack':
        return true;
      case 'heal':
        return allies.some((c) => c.hp / c.maxHp < cfg.ai.healThreshold);
      case 'taunt':
        return !isTaunting(actor);
      case 'buff': {
        const targets = skill.target === 'self' ? [actor] : allies;
        return targets.some((c) => !c.statuses.some((s) => s.skillId === skill.id));
      }
    }
  };

  /** 기본 행동 방식: 스킬 1, 스킬 2 순으로 쓸 수 있고 쓸모 있는 것을 쓰고, 없으면 기본 공격. */
  const chooseSkill = (actor: Combatant): SkillRow => {
    const [basic, ...rest] = actor.unit.skills;
    for (const id of rest) {
      const skill = getSkill(tables, id);
      if (actor.cooldowns[id] === 0 && isUseful(actor, skill)) return skill;
    }
    return getSkill(tables, basic);
  };

  const act = (actor: Combatant, round: number) => {
    for (const id of Object.keys(actor.cooldowns)) if (actor.cooldowns[id] > 0) actor.cooldowns[id] -= 1;
    const skill = chooseSkill(actor);
    actor.cooldowns[skill.id] = skill.cooldown;
    const effects: CombatEffect[] = [];

    switch (skill.target) {
      case 'enemy': {
        let target = pickSingleTarget(actor.side, rng);
        for (let h = 0; h < (skill.hits ?? 1) && target; h++) {
          effects.push(dealDamage(actor, target, skill));
          if (target.downed) target = pickSingleTarget(actor.side, rng);
        }
        break;
      }
      case 'enemyRow':
        for (const t of exposedRow(alive(opponentSide(actor.side)))) effects.push(dealDamage(actor, t, skill));
        break;
      case 'enemyAll':
        for (const t of alive(opponentSide(actor.side))) effects.push(dealDamage(actor, t, skill));
        break;
      case 'self':
        effects.push(addStatus(actor, skill, skill.kind === 'taunt' ? 'taunt' : 'buff'));
        break;
      case 'allyLowest': {
        const target = [...alive(actor.side)].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        effects.push(skill.kind === 'heal' ? heal(actor, target, skill) : addStatus(actor, skill, 'buff'));
        break;
      }
      case 'allyAll':
        for (const t of alive(actor.side)) {
          effects.push(skill.kind === 'heal' ? heal(actor, t, skill) : addStatus(t, skill, 'buff'));
        }
        break;
    }
    events.push({ type: 'action', round, actor: actor.key, skillId: skill.id, effects });
  };

  const decided = (): CombatOutcome | undefined => {
    if (alive('enemy').length === 0) return 'victory';
    if (alive('ally').length === 0) return 'defeat';
    return undefined;
  };

  let outcome: CombatOutcome | undefined;
  let round = 0;
  while (!outcome && round < cfg.maxRounds) {
    round += 1;
    // 같은 속도·같은 열일 때 쓰는 시드 순서. 키 순서대로 뽑아 결정적으로 만든다.
    const tiebreak = new Map(all.map((c) => [c.key, rng.next()]));
    const rowRank = (c: Combatant) => (c.row === 'front' ? 0 : 1);
    const order = all
      .filter((c) => !c.downed)
      .sort(
        (a, b) =>
          statWithBuffs(b, 'spd') - statWithBuffs(a, 'spd') ||
          rowRank(a) - rowRank(b) ||
          tiebreak.get(a.key)! - tiebreak.get(b.key)!,
      );
    events.push({ type: 'round', round, order: order.map((c) => c.key) });

    for (const actor of order) {
      if (actor.downed) continue;
      act(actor, round);
      outcome = decided();
      if (outcome) break;
    }
    if (outcome) break;

    for (const c of all) {
      for (const s of c.statuses) s.remaining -= 1;
      for (const s of c.statuses.filter((s) => s.remaining <= 0)) {
        events.push({ type: 'expire', round, target: c.key, status: s.type, skillId: s.skillId });
      }
      c.statuses = c.statuses.filter((s) => s.remaining > 0);
    }
  }
  outcome ??= 'retreat';
  events.push({ type: 'end', outcome, rounds: round });

  return {
    outcome,
    rounds: round,
    events,
    finalHp: Object.fromEntries(all.map((c) => [c.unit.id, c.hp])),
    downedUnitIds: all.filter((c) => c.downed).map((c) => c.unit.id),
  };
}
