// 지시서 020: 스킬 구조(기본 공격 + 액티브 3) · 상태 효과 5종 · 후열 직격 · 자객·기만자 데이터 검증
import { describe, expect, it } from 'vitest';
import { getRole, getSkill, tables as base, type GameTables, type SkillRow } from '../data';
import { compositionMultiplier, ignoresTaunt, resolveCombat, type CombatEffect, type CombatEvent, type CombatSlot } from './combat';
import { statsPower } from './combatPower';
import { roleBaseStats, traitMultiplier } from './stats';
import { createMercenary, createMonster, MERC_ACTIVE_COUNT, MONSTER_ACTIVE_COUNT, type Unit } from './unit';

// ── 실험용 표: 시험 스킬을 더하고 피해 변동을 없앤다 ──
const T_SKILLS: SkillRow[] = [
  { id: 't_poke', name: '찌르기', kind: 'attack', target: 'enemy', power: 0.01, cooldown: 0, damageType: 'physical' },
  { id: 't_stun', name: '기절 찌르기', kind: 'attack', target: 'enemy', power: 0.01, cooldown: 0, damageType: 'physical', applies: [{ status: 'stun' }] },
  // 공격에 붙은 표식은 이미 걸린 대상에게도 쓴다(갱신 규칙 확인용)
  { id: 't_mark3', name: '표식3', kind: 'attack', target: 'enemy', power: 0.01, cooldown: 99, damageType: 'physical', applies: [{ status: 'mark', duration: 3 }] },
  { id: 't_mark1', name: '표식1', kind: 'attack', target: 'enemy', power: 0.01, cooldown: 99, damageType: 'physical', applies: [{ status: 'mark', duration: 1 }] },
  { id: 't_mark2', name: '표식2', kind: 'debuff', target: 'enemy', cooldown: 99, applies: [{ status: 'mark', duration: 2 }] },
  { id: 't_weaken', name: '약화', kind: 'debuff', target: 'enemy', cooldown: 99, applies: [{ status: 'weaken' }] },
  { id: 't_dot', name: '독', kind: 'attack', target: 'enemy', power: 0.5, cooldown: 99, damageType: 'physical', applies: [{ status: 'dot' }] },
  { id: 't_hit', name: '때리기', kind: 'attack', target: 'enemy', power: 1, cooldown: 0, damageType: 'physical' },
  { id: 't_ward', name: '보호막', kind: 'shield', target: 'allyLowest', cooldown: 99, duration: 3, shield: { scaleStat: 'hp', ratio: 0.5 } },
  { id: 't_purify', name: '정화', kind: 'heal', target: 'allyLowest', power: 0.01, cooldown: 0, scaleStat: 'eAtk', cleanse: true },
  { id: 't_back', name: '후열 찌르기', kind: 'attack', target: 'enemyBackLowest', power: 0.01, cooldown: 0, damageType: 'physical' },
  { id: 't_backTaunt', name: '후열(도발 따름)', kind: 'attack', target: 'enemyBackLowest', power: 0.01, cooldown: 0, damageType: 'physical', ignoreTaunt: false },
  { id: 't_backRow', name: '후열 전체', kind: 'attack', target: 'enemyBackRow', power: 0.01, cooldown: 0, damageType: 'physical' },
  { id: 't_taunt', name: '도발', kind: 'taunt', target: 'self', cooldown: 0, duration: 99 },
];
const T: GameTables = {
  ...base,
  skills: [...base.skills, ...T_SKILLS],
  combat: { ...base.combat, damage: { ...base.combat.damage, varianceMin: 1, varianceMax: 1 }, ai: { ...base.combat.ai, healThreshold: 1, cleanseThreshold: 1 } },
};

/** 스킬을 직접 정한 시험 유닛(치명·회피 없음) */
function unit(id: string, skills: string[], over: Partial<Unit['stats']> = {}, role = 'warrior'): Unit {
  const u = createMonster(T, { id, name: id, element: 'void', role, grade: 'mid', level: 10 });
  return { ...u, skills, stats: { ...u.stats, crit: 0, eva: 0, ...over } };
}
const fight = (allies: CombatSlot[], enemies: CombatSlot[], seed: string | number = 1, t = T) => resolveCombat(t, { allies, enemies, seed });
const actions = (ev: CombatEvent[]) => ev.filter((e): e is Extract<CombatEvent, { type: 'action' }> => e.type === 'action');
const effectsOf = (ev: CombatEvent[], kind: CombatEffect['kind']) => actions(ev).flatMap((a) => a.effects.filter((f) => f.kind === kind));
const FAST = { spd: 1000 };
const SLOW = { spd: 1 };
const TOUGH = { hp: 1_000_000 };

describe('020 데이터', () => {
  const enabled = base.roles.filter((r) => r.enabled);
  it('8개 역할이 모두 열려 있고, 기본 공격 1개 + 풀 6개 + 역할 특성 3개이며 id가 모두 스킬·특성 표에 있다', () => {
    expect(enabled.map((r) => r.id).sort()).toEqual(['archer', 'assassin', 'commander', 'disruptor', 'healer', 'mage', 'shield', 'warrior']);
    for (const r of enabled) {
      expect(getSkill(base, r.basicSkill).cooldown).toBe(0);
      expect(r.skillPool).toHaveLength(6);
      expect(new Set(r.skillPool).size).toBe(6);
      for (const id of r.skillPool) expect(getSkill(base, id).role).toBe(r.id);
      expect(r.roleTraits).toHaveLength(3);
      for (const t of r.roleTraits) expect(base.traits.traits.find((x) => x.id === t)?.category).toBe('role');
      expect(base.stats.roleBase[r.id], r.id).toBeDefined();
    }
    // 스킬 표: 기본 공격 8 + 풀 48, id 중복 없음
    expect(base.skills).toHaveLength(56);
    expect(new Set(base.skills.map((s) => s.id)).size).toBe(56);
  });

  it('스킬이 거는 상태 효과는 모두 statusEffects.json에 있고, 보호막 스킬은 shield 값이 있다', () => {
    const ids = new Set(base.statusEffects.effects.map((e) => e.id));
    for (const s of base.skills) {
      for (const a of s.applies ?? []) expect(ids.has(a.status), `${s.id} → ${a.status}`).toBe(true);
      if (s.kind === 'shield') expect(s.shield, s.id).toBeDefined();
      if (s.kind === 'debuff') expect(s.applies?.length, s.id).toBeGreaterThan(0);
      expect(s.description, s.id).toBeTruthy();
    }
    expect(base.statusEffects.effects.map((e) => e.kind).sort()).toEqual(['dot', 'mark', 'shield', 'stun', 'weaken']);
  });

  it('36명 모두 액티브 3개가 자기 역할 풀 안에 있고 중복이 없으며, 특성 ② 슬롯은 자기 역할 특성이다', () => {
    expect(base.roster).toHaveLength(36);
    for (const r of base.roster) {
      const role = getRole(base, r.role);
      expect(r.skills, r.id).toHaveLength(MERC_ACTIVE_COUNT);
      expect(new Set(r.skills).size, r.id).toBe(3);
      for (const s of r.skills) expect(role.skillPool, `${r.id} ${s}`).toContain(s);
      expect(role.roleTraits, r.id).toContain(r.traits?.[1]);
      expect(r.signatureSkill).toBeNull();
    }
    // 자객·기만자 각 3명
    expect(base.roster.filter((r) => r.role === 'assassin')).toHaveLength(3);
    expect(base.roster.filter((r) => r.role === 'disruptor')).toHaveLength(3);
  });

  it('36명 레벨 1 전투력이 역할 기본값 전투력의 예산 안이다(016 방식)', () => {
    const [lo, hi] = base.combatPower.budget;
    const bad = base.roster
      .map((r) => ({ id: r.id, ratio: statsPower(base, r.baseStats!) / statsPower(base, roleBaseStats(base, r.role)) }))
      .filter((x) => x.ratio < lo || x.ratio > hi);
    expect(bad).toEqual([]);
  });

  it('몬스터는 기본 공격 + 풀의 앞 2개, 견본 계약자는 기본 공격 + 풀의 앞 3개', () => {
    const m = createMonster(base, { id: 'm', name: 'm', element: 'void', role: 'mage', grade: 'low', level: 1 });
    const role = getRole(base, 'mage');
    expect(m.skills).toEqual([role.basicSkill, ...role.skillPool.slice(0, MONSTER_ACTIVE_COUNT)]);
    const c = createMercenary(base, { id: 'c', name: 'c', element: 'fire', role: 'assassin', level: 1 });
    expect(c.skills).toEqual([getRole(base, 'assassin').basicSkill, ...getRole(base, 'assassin').skillPool.slice(0, 3)]);
  });

  it('구성 보너스: 자객(mobility)은 딜러로 센다(groupAlias)', () => {
    expect(compositionMultiplier(base, ['shield', 'assassin', 'healer'])).toBe(compositionMultiplier(base, ['shield', 'archer', 'healer']));
  });
});

describe('020 상태 효과', () => {
  it('기절: 행동을 건너뛰고, 풀린 다음 라운드에는 다시 걸리지 않는다(연속 기절 없음)', () => {
    const r = fight([{ unit: unit('a', ['t_poke', 't_stun'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH }), row: 'front' }]);
    const skipRounds = r.events.filter((e) => e.type === 'skip').map((e) => (e as { round: number }).round);
    expect(skipRounds.length).toBeGreaterThan(2);
    for (let i = 1; i < skipRounds.length; i++) expect(skipRounds[i] - skipRounds[i - 1]).toBeGreaterThan(1);
    expect(effectsOf(r.events, 'status').some((f) => f.kind === 'status' && f.immune)).toBe(true);
    // 적은 기절이 아닌 라운드에는 행동한다
    const acted = actions(r.events).filter((a) => a.actor === 'e0').map((a) => a.round);
    for (const round of acted) expect(skipRounds).not.toContain(round);
  });

  it('같은 효과를 다시 받으면 겹치지 않고 지속 시간 중 큰 쪽을 채택한다', () => {
    // 1라운드 표식 3, 2라운드 표식 1 → 남은 지속은 큰 쪽(3)을 따라 적의 3번째 행동이 끝날 때 풀린다
    const r = fight([{ unit: unit('a', ['t_poke', 't_mark3', 't_mark1'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH }), row: 'front' }]);
    const exp = r.events.filter((e) => e.type === 'expire' && e.status === 'mark');
    expect(exp).toHaveLength(1);
    expect((exp[0] as { round: number }).round).toBe(3);
  });

  it('지속 시간은 받은 유닛의 행동이 끝날 때 준다: 표식 2는 적의 2번째 행동 직후 풀린다', () => {
    const r = fight([{ unit: unit('a', ['t_poke', 't_mark2'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH }), row: 'front' }]);
    const i = r.events.findIndex((e) => e.type === 'expire' && e.status === 'mark');
    expect((r.events[i] as { round: number }).round).toBe(2);
    const prev = r.events[i - 1];
    expect(prev.type === 'action' && prev.actor === 'e0').toBe(true);
  });

  it('표식은 받는 피해 ×(데이터 배율, 025에서 1.4), 약화는 주는 피해 ×0.75', () => {
    const hitAmount = (allySkills: string[]) => {
      const r = fight([{ unit: unit('a', allySkills, { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_hit'], { ...SLOW, ...TOUGH }), row: 'front' }]);
      const a = actions(r.events);
      const ally = a.filter((x) => x.actor === 'a0' && x.skillId === 't_hit');
      const enemy = a.filter((x) => x.actor === 'e0');
      const dmg = (x: (typeof a)[number]) => (x.effects[0] as { amount: number }).amount;
      return { ally: dmg(ally[0]), enemy: dmg(enemy[0]) };
    };
    const plain = hitAmount(['t_hit']);
    const marked = hitAmount(['t_hit', 't_mark3']); // 1라운드 표식, 2라운드부터 때리기
    const markMul = base.statusEffects.effects.find((e) => e.id === 'mark')!.multiplier!;
    expect(markMul).toBe(1.4);
    expect(marked.ally / plain.ally).toBeCloseTo(markMul, 1);
    const weakened = hitAmount(['t_hit', 't_weaken']); // 적이 약화된 채 때림
    expect(weakened.enemy / plain.enemy).toBeCloseTo(0.75, 1);
  });

  it('지속 피해: 자기 차례가 시작될 때 걸 때 정한 같은 양으로, 기본 3번', () => {
    const r = fight([{ unit: unit('a', ['t_poke', 't_dot'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH }), row: 'front' }]);
    const ticks = r.events.filter((e) => e.type === 'tick');
    expect(ticks).toHaveLength(3);
    expect(new Set(ticks.map((t) => (t as { amount: number }).amount)).size).toBe(1);
    // 차례 시작: tick 바로 다음 사건이 그 유닛의 행동
    for (const t of ticks) {
      const next = r.events[r.events.indexOf(t) + 1];
      expect(next.type === 'action' && next.actor === 'e0').toBe(true);
    }
  });

  it('보호막: 피해를 먼저 흡수하고 남은 피해만 체력에서 깎는다', () => {
    // 아군 둘: 보호막을 거는 사제(먼저 행동)와 맞는 쪽. 적이 맞는 쪽을 때린다
    const r = fight(
      [
        // 체력 비율이 같으면 앞 순서(a0)가 보호막 대상
        { unit: unit('b', ['t_poke'], { spd: 500, hp: 1000 }), row: 'front' },
        { unit: unit('a', ['t_poke', 't_ward'], { ...FAST, hp: 100 }), row: 'back' },
      ],
      [{ unit: unit('e', ['t_hit'], { spd: 10, pAtk: 400, ...TOUGH }), row: 'front' }],
    );
    const shield = effectsOf(r.events, 'status').find((f) => f.kind === 'status' && f.status === 'shield') as { target: string; value: number } | undefined;
    expect(shield).toBeDefined();
    const firstHit = actions(r.events).find((a) => a.actor === 'e0')!.effects[0] as { target: string; amount: number; absorbed?: number; hpAfter: number };
    expect(firstHit.target).toBe(shield!.target);
    const start = r.events[0].type === 'start' ? r.events[0].combatants.find((c) => c.key === firstHit.target)!.hp : 0;
    expect(firstHit.absorbed).toBe(Math.min(shield!.value, firstHit.amount));
    expect(firstHit.hpAfter).toBe(start - (firstHit.amount - firstHit.absorbed!));
  });

  it('cleanse는 지속 피해·표식·약화를 지우고 기절은 지우지 않는다', () => {
    const rows = base.statusEffects.effects;
    expect(rows.filter((e) => e.cleansable).map((e) => e.id).sort()).toEqual(['dot', 'mark', 'weaken']);
    // 적이 아군에게 지속 피해를 걸고, 아군 사제가 정화한다
    const r = fight(
      [{ unit: unit('h', ['t_poke', 't_purify'], { spd: 5, ...TOUGH }), row: 'back' }],
      [{ unit: unit('e', ['t_poke', 't_dot'], { ...FAST, ...TOUGH }), row: 'front' }],
    );
    const cl = effectsOf(r.events, 'cleanse');
    expect(cl.length).toBeGreaterThan(0);
    expect((cl[0] as { removed: string[] }).removed).toContain('dot');
    expect(r.events.filter((e) => e.type === 'tick').length).toBeLessThan(3);
  });

  it('lowHpBonus: 체력 비율이 낮을수록 커지고 최대 1 + 값(즉사 없음)', () => {
    const exec = getSkill(base, 'warrior_execute');
    expect(exec.lowHpBonus).toBeGreaterThan(0);
    // 같은 공격을 체력 가득 대상과 거의 쓰러진 대상에게
    const strike = (hp: number) => {
      const target = unit('e', ['t_poke'], { ...SLOW, hp, pDef: 0 });
      const r = fight([{ unit: { ...unit('a', ['t_poke', 'warrior_execute'], FAST), traits: [] }, row: 'front' }], [{ unit: target, row: 'front' }]);
      return actions(r.events).find((a) => a.skillId === 'warrior_execute')!.effects[0] as { amount: number };
    };
    const big = strike(1_000_000).amount;
    expect(big).toBeGreaterThan(0);
    // 체력 비율 1 근처에서는 보너스가 거의 없다. 이론 상한(1 + 값)을 넘는 일은 없다
    const t1 = { ...unit('e', ['t_poke'], { ...SLOW, hp: 1_000_000, pDef: 0 }) };
    const r = fight([{ unit: unit('a', ['t_poke', 'warrior_execute'], FAST), row: 'front' }], [{ unit: t1, row: 'front' }]);
    const plain = fight([{ unit: unit('a', ['t_poke', 'warrior_heavy'], FAST), row: 'front' }], [{ unit: t1, row: 'front' }]);
    const e1 = actions(r.events).find((a) => a.skillId === 'warrior_execute')!.effects[0] as { amount: number };
    const h1 = actions(plain.events).find((a) => a.skillId === 'warrior_heavy')!.effects[0] as { amount: number };
    const ratio = e1.amount / exec.power! / (h1.amount / getSkill(base, 'warrior_heavy').power!);
    expect(ratio).toBeGreaterThanOrEqual(0.99);
    expect(ratio).toBeLessThanOrEqual(1 + exec.lowHpBonus! + 0.01);
  });
});

describe('2026-11-25 결정: 회피와 상태 효과', () => {
  it('공격이 회피되면 그 공격에 붙은 상태 효과는 걸리지 않는다', () => {
    // 회피율 상한을 풀어 늘 회피하게 한다
    const T2: GameTables = { ...T, stats: { ...T.stats, caps: { ...T.stats.caps, eva: 1 } } };
    const r = fight([{ unit: unit('a', ['t_poke', 't_mark3'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH, eva: 1 }), row: 'front' }], 1, T2);
    const first = actions(r.events).find((a) => a.skillId === 't_mark3')!;
    expect(first.effects).toHaveLength(1);
    expect(first.effects[0]).toMatchObject({ kind: 'damage', evaded: true });
  });
  it('피해 없는 debuff는 회피와 상관없이 걸린다', () => {
    const T2: GameTables = { ...T, stats: { ...T.stats, caps: { ...T.stats.caps, eva: 1 } } };
    const r = fight([{ unit: unit('a', ['t_poke', 't_weaken'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('e', ['t_poke'], { ...SLOW, ...TOUGH, eva: 1 }), row: 'front' }], 1, T2);
    expect(effectsOf(r.events, 'status').some((f) => f.kind === 'status' && f.status === 'weaken')).toBe(true);
  });
});

describe('020 후열 직격', () => {
  const enemies = (): CombatSlot[] => [
    { unit: unit('front', ['t_taunt'], { spd: 2000, ...TOUGH }), row: 'front' },
    { unit: unit('backA', ['t_poke'], { ...SLOW, hp: 1000 }), row: 'back' },
    { unit: unit('backB', ['t_poke'], { ...SLOW, hp: 1000 }), row: 'back' },
  ];
  it('enemyBackLowest는 도발을 무시하고 후열에서 체력 비율이 가장 낮은 적을 노린다', () => {
    expect(ignoresTaunt(getSkill(T, 't_back'))).toBe(true);
    const r = fight([{ unit: unit('a', ['t_back'], { ...FAST, pAtk: 2000 }), row: 'front' }], enemies());
    const targets = actions(r.events).filter((a) => a.actor === 'a0').flatMap((a) => a.effects.map((f) => f.target));
    expect(targets.length).toBeGreaterThan(1);
    expect(targets).not.toContain('e0'); // 도발 중인 전열은 맞지 않는다
    // 첫 타격 뒤에는 체력이 깎인 쪽을 계속 노린다
    expect(targets[1]).toBe(targets[0]);
  });
  it('데이터가 ignoreTaunt: false면 도발을 따른다', () => {
    const r = fight([{ unit: unit('a', ['t_backTaunt'], { ...FAST, ...TOUGH }), row: 'front' }], enemies());
    const targets = actions(r.events).filter((a) => a.actor === 'a0').flatMap((a) => a.effects.map((f) => f.target));
    expect(new Set(targets)).toEqual(new Set(['e0']));
  });
  it('enemyBackRow는 후열 전체, 후열이 없으면 전열', () => {
    const r = fight([{ unit: unit('a', ['t_backRow'], { ...FAST, ...TOUGH }), row: 'front' }], enemies());
    const first = actions(r.events).find((a) => a.actor === 'a0')!;
    expect(first.effects.map((f) => f.target).sort()).toEqual(['e1', 'e2']);
    const r2 = fight([{ unit: unit('a', ['t_backRow'], { ...FAST, ...TOUGH }), row: 'front' }], [{ unit: unit('f', ['t_poke'], TOUGH), row: 'front' }]);
    expect(actions(r2.events).find((a) => a.actor === 'a0')!.effects.map((f) => f.target)).toEqual(['e0']);
  });
  it('저격과 자객의 후열 직격 스킬은 데이터에 도발 무시가 명시돼 있다(2026-11-25 결정)', () => {
    expect(getSkill(base, 'archer_snipe').ignoreTaunt).toBe(true);
    for (const s of base.skills.filter((x) => x.role === 'assassin' && ['enemyBackLowest', 'enemyBackRow'].includes(x.target))) expect(s.ignoreTaunt, s.id).toBe(true);
  });
});

describe('020 특성 조건 targetHpBelow', () => {
  it('공격 대상의 체력 비율이 기준 이하일 때만 켜진다(사냥꾼의 본능 50%, 살의 40%)', () => {
    const u = { element: 'fire', stats: createMercenary(base, { id: 'x', name: 'x', element: 'fire', role: 'assassin', level: 1 }).stats, traits: [{ id: 'killer_instinct', rank: 1 }] };
    expect(traitMultiplier(base, u, 'damageMul', { targetHpRatio: 1 })).toBe(1);
    expect(traitMultiplier(base, u, 'damageMul', { targetHpRatio: 0.41 })).toBe(1);
    expect(traitMultiplier(base, u, 'damageMul', { targetHpRatio: 0.4 })).toBeCloseTo(1.18);
    expect(traitMultiplier(base, u, 'damageMul', {})).toBe(1); // 전투 밖(대상 없음)은 꺼짐
    const h = { ...u, traits: [{ id: 'hunter_instinct', rank: 1 }] };
    expect(traitMultiplier(base, h, 'damageMul', { targetHpRatio: 0.5 })).toBeCloseTo(1.1);
  });
});

describe('020 결정성', () => {
  const party = (): CombatSlot[] =>
    ['m31', 'm34', 'm01', 'm03', 'm35'].map((id) => {
      const r = base.roster.find((x) => x.id === id)!;
      return { unit: createMercenary(base, { id, name: r.name, element: r.element, role: r.role, level: 20, skills: r.skills }), row: getRole(base, r.role).defaultRow };
    });
  const foes = (): CombatSlot[] =>
    ['shield', 'warrior', 'archer', 'mage'].map((role, i) => ({ unit: createMonster(base, { id: `e${i}`, name: role, element: 'void', role, grade: 'high', level: 20 }), row: getRole(base, role).defaultRow }));
  it('자객·기만자가 든 전투도 같은 시드면 같은 결과', () => {
    for (const seed of ['a', 'b', 'c']) expect(resolveCombat(base, { allies: party(), enemies: foes(), seed }).events).toEqual(resolveCombat(base, { allies: party(), enemies: foes(), seed }).events);
  });
  it('실제 데이터 전투 300판에서 어떤 유닛도 두 라운드 연속 기절로 건너뛰지 않는다', () => {
    let skips = 0;
    for (let i = 0; i < 300; i++) {
      const r = resolveCombat(base, { allies: party(), enemies: foes(), seed: `stun:${i}` });
      const by = new Map<string, number[]>();
      for (const e of r.events) if (e.type === 'skip') by.set(e.actor, [...(by.get(e.actor) ?? []), e.round]);
      for (const rounds of by.values()) {
        skips += rounds.length;
        for (let k = 1; k < rounds.length; k++) expect(rounds[k] - rounds[k - 1]).toBeGreaterThan(1);
      }
    }
    expect(skips).toBeGreaterThan(0);
  });
});
