// 지시서 016: 스탯 세분화·특성·최종 스탯 계산 한 곳
import { describe, expect, it } from 'vitest';
import { AUX_STATS, CORE_STATS, getElement, tables, type GameTables, type Stats, type TraitRow } from '../data';
import { resolveCombat, rollAttack, type CombatEvent, type CombatSlot } from './combat';
import { combatPower, statsPower, unitPower } from './combatPower';
import { getMerc, levelUp, mercToUnit, newGame, newTraitsOnLevelUp } from './game';
import { createRng } from './rng';
import { activeTraits, allyAuraRows, computeEffectiveStats, roleBaseStats, statsAtLevel, traitMultiplier, validateTraitsTable } from './stats';
import { createMercenary, createMonster, type Unit } from './unit';

const roster = tables.roster;
const power = (s: Stats) => statsPower(tables, s);

describe('데이터: 계약자 기본 스탯(roster.json baseStats)', () => {
  it('30명 모두 baseStats가 있고 역할 바운더리 안이다', () => {
    expect(roster).toHaveLength(30);
    const bad: string[] = [];
    for (const r of roster) {
      expect(r.baseStats, r.id).toBeDefined();
      const base = roleBaseStats(tables, r.role);
      for (const id of CORE_STATS) {
        const [lo, hi] = tables.stats.roleBounds[id];
        const ratio = r.baseStats![id] / base[id];
        if (ratio < lo - 1e-9 || ratio > hi + 1e-9) bad.push(`${r.id}.${id} ${ratio.toFixed(3)} (${lo}~${hi})`);
      }
      for (const id of AUX_STATS) {
        const [lo, hi] = tables.stats.roleBounds[id];
        const v = r.baseStats![id];
        if (v < lo - 1e-9 || v > hi + 1e-9) bad.push(`${r.id}.${id} ${v} (${lo}~${hi})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('레벨 1 전투력이 같은 역할 기본값 전투력의 예산(95~105%) 안이다', () => {
    const [lo, hi] = tables.combatPower.budget;
    const bad = roster
      .map((r) => ({ id: r.id, ratio: power(r.baseStats!) / power(roleBaseStats(tables, r.role)) }))
      .filter((x) => x.ratio < lo || x.ratio > hi);
    expect(bad).toEqual([]);
  });
});

describe('데이터: 특성(traits.json)', () => {
  it('표가 검증을 통과한다', () => {
    expect(validateTraitsTable(tables)).toEqual([]);
  });

  it('계약자의 특성 id가 모두 있고, 종류별 allowed(역할·배경·종족·속성·owner)를 만족한다', () => {
    const bad: string[] = [];
    for (const r of roster) {
      for (const id of r.traits ?? []) {
        const t = tables.traits.traits.find((x) => x.id === id);
        if (!t) {
          bad.push(`${r.id}: 없는 특성 ${id}`);
          continue;
        }
        const a = t.allowed;
        if (a.roles && !a.roles.includes(r.role)) bad.push(`${r.id}: ${id} 역할 불일치`);
        if (a.backgrounds && !a.backgrounds.includes(r.background)) bad.push(`${r.id}: ${id} 배경 불일치`);
        if (a.races && !a.races.includes(r.race)) bad.push(`${r.id}: ${id} 종족 불일치`);
        if (a.elements && !a.elements.includes(r.element)) bad.push(`${r.id}: ${id} 속성 불일치`);
        if (a.owner && a.owner !== r.id) bad.push(`${r.id}: ${id} 고유 특성 주인 불일치`);
      }
      expect((r.traits ?? []).length).toBeLessThanOrEqual(tables.traits.slotUnlockLevels.length);
    }
    expect(bad).toEqual([]);
  });

  it('알 수 없는 trigger·condition·kind와 allies 범위 위반은 검증에서 실패한다', () => {
    const base = tables.traits.traits[0];
    const bad = (effects: unknown): GameTables => ({ ...tables, traits: { ...tables.traits, traits: [{ ...base, id: 'x', ranks: [{ effects }] } as TraitRow] } });
    expect(validateTraitsTable(bad([{ trigger: { type: 'whenever' }, effect: { kind: 'statMul', stat: 'hp', value: 1, scope: 'self' } }]))).not.toEqual([]);
    expect(validateTraitsTable(bad([{ trigger: { type: 'always' }, condition: { type: 'moon' }, effect: { kind: 'statMul', stat: 'hp', value: 1, scope: 'self' } }]))).not.toEqual([]);
    expect(validateTraitsTable(bad([{ trigger: { type: 'always' }, effect: { kind: 'explode', value: 1, scope: 'self' } }]))).not.toEqual([]);
    expect(validateTraitsTable(bad([{ trigger: { type: 'always' }, effect: { kind: 'statMul', stat: 'luck', value: 1, scope: 'self' } }]))).not.toEqual([]);
    expect(validateTraitsTable(bad([{ trigger: { type: 'hpBelow', threshold: 0.5 }, effect: { kind: 'statMul', stat: 'hp', value: 1, scope: 'allies' } }]))).not.toEqual([]);
  });

  it('새 특성은 행 추가만으로 쓸 수 있다', () => {
    const t: GameTables = {
      ...tables,
      traits: {
        ...tables.traits,
        traits: [...tables.traits.traits, { id: 'new_one', name: '새 특성', category: 'common', description: '물리공격 +50%', allowed: {}, tags: [], maxRank: 1, upgrade: null, ranks: [{ effects: [{ trigger: { type: 'always' }, effect: { kind: 'statMul', stat: 'pAtk', value: 0.5, scope: 'self' } }] }] }],
      },
    };
    expect(validateTraitsTable(t)).toEqual([]);
    const u = { element: 'fire', stats: statsAtLevel(t, roleBaseStats(t, 'warrior'), 1), traits: [{ id: 'new_one', rank: 1 }] };
    expect(computeEffectiveStats(t, u).pAtk).toBeCloseTo(u.stats.pAtk * 1.5, 2);
  });
});

describe('데이터: 특수 스탯(자리만)', () => {
  it('7개가 모두 꺼져 있고, 값이 바뀌어도 전투에 영향이 없다', () => {
    expect(tables.stats.special.map((x) => x.id)).toEqual(['pen', 'lifesteal', 'dmgReduce', 'shieldBoost', 'healBoost', 'counter', 'critRes']);
    expect(tables.stats.special.every((x) => !x.enabled)).toBe(true);
    const t: GameTables = { ...tables, stats: { ...tables.stats, special: tables.stats.special.map((x) => ({ ...x, name: `${x.name}!` })) } };
    const fight = (tt: GameTables) => resolveCombat(tt, { allies: party(10), enemies: foes(10, 'mid', 3), seed: 'sp' });
    expect(fight(t)).toEqual(fight(tables));
  });
});

// ── 전투 도우미
const party = (level: number): CombatSlot[] =>
  (
    [
      ['shield', 'frost', 'front'],
      ['warrior', 'fire', 'front'],
      ['archer', 'lightning', 'back'],
      ['mage', 'wind', 'back'],
      ['healer', 'light', 'back'],
    ] as const
  ).map(([role, element, row], i) => ({ unit: createMercenary(tables, { id: `p${i}`, name: role, element, role, level }), row }));
const foes = (level: number, grade: string, count: number): CombatSlot[] =>
  ['warrior', 'shield', 'archer', 'mage', 'commander'].slice(0, count).map((role, i) => ({
    unit: createMonster(tables, { id: `e${i}`, name: role, element: 'void', role, grade, level }),
    row: tables.roles.find((r) => r.id === role)!.defaultRow,
  }));
const damages = (events: CombatEvent[]) => events.flatMap((e) => (e.type === 'action' ? e.effects.filter((f) => f.kind === 'damage') : []));
const withStats = (u: Unit, patch: Partial<Stats>): Unit => ({ ...u, stats: { ...u.stats, ...patch } });

describe('전투: 판정 순서와 결정성', () => {
  it('같은 입력과 시드면 치명타·회피까지 같은 결과', () => {
    const a = resolveCombat(tables, { allies: party(20), enemies: foes(20, 'high', 4), seed: 'det' });
    const b = resolveCombat(tables, { allies: party(20), enemies: foes(20, 'high', 4), seed: 'det' });
    expect(a).toEqual(b);
  });

  it('공격 판정은 능력치와 상관없이 난수를 같은 순서·개수(변동 → 회피 → 치명타)로 쓴다', () => {
    const after = (eva: number, crit: number) => {
      const r = createRng('roll');
      const first = rollAttack(tables, r, eva, crit);
      return { first, next: r.next() };
    };
    const base = after(0, 0);
    for (const [eva, crit] of [
      [0.5, 0],
      [0, 0.8],
      [0.5, 0.8],
      [1, 1],
    ]) {
      const x = after(eva, crit);
      expect(x.first.variance).toBe(base.first.variance);
      expect(x.next).toBe(base.next);
    }
    expect(after(1, 1).first).toMatchObject({ evaded: true, crit: false });
  });

  it('회피하면 피해 0이고 로그에 회피로 남는다. 치명타는 치명타 피해율만큼', () => {
    const allies = party(30).map((s) => ({ ...s, unit: withStats(s.unit, { crit: 1, critDmg: 2 }) }));
    const enemies = foes(30, 'mid', 3).map((s) => ({ ...s, unit: withStats(s.unit, { eva: 0.5 }) }));
    const r = resolveCombat(tables, { allies, enemies, seed: 'ev' });
    const ds = damages(r.events);
    const evaded = ds.filter((d) => d.kind === 'damage' && d.evaded);
    expect(evaded.length).toBeGreaterThan(0);
    for (const d of evaded) if (d.kind === 'damage') expect(d.amount).toBe(0);
    // 아군 공격(대상 e*)은 회피가 아니면 모두 치명타(치명타율은 상한 0.8로 잘려도 대부분)
    const allyHits = ds.filter((d) => d.kind === 'damage' && d.target.startsWith('e') && !d.evaded);
    expect(allyHits.some((d) => d.kind === 'damage' && d.crit)).toBe(true);
  });
});

describe('전투: 피해 종류와 치유', () => {
  it('물리 스킬은 물리방어, 에너지 스킬은 에너지방어로 막는다', () => {
    const hit = (targetPatch: Partial<Stats>, attackerRole: string) => {
      const attacker = createMercenary(tables, { id: 'a', name: 'a', element: 'fire', role: attackerRole, level: 10 });
      const target = withStats(createMonster(tables, { id: 't', name: 't', element: 'void', role: 'shield', grade: 'mid', level: 10 }), { hp: 99999, ...targetPatch });
      const r = resolveCombat({ ...tables, combat: { ...tables.combat, maxRounds: 1 } }, { allies: [{ unit: withStats(attacker, { crit: 0 }), row: 'front' }], enemies: [{ unit: withStats(target, { eva: 0, crit: 0 }), row: 'front' }], seed: 'dt' });
      return damages(r.events).filter((d) => d.kind === 'damage' && d.target === 'e0').reduce((s, d) => s + (d.kind === 'damage' ? d.amount : 0), 0);
    };
    // 투사(물리): 물리방어를 크게 올리면 줄고, 에너지방어는 영향 없음
    expect(hit({ pDef: 5000 }, 'warrior')).toBeLessThan(hit({}, 'warrior'));
    expect(hit({ eDef: 5000 }, 'warrior')).toBe(hit({}, 'warrior'));
    // 마도사(에너지): 반대
    expect(hit({ eDef: 5000 }, 'mage')).toBeLessThan(hit({}, 'mage'));
    expect(hit({ pDef: 5000 }, 'mage')).toBe(hit({}, 'mage'));
  });

  it('치유는 회피·치명타 대상이 아니고 에너지공격에 비례한다', () => {
    const allies = party(20).map((s) => ({ ...s, unit: withStats(s.unit, { eva: 0.5, crit: 0.8 }) }));
    const r = resolveCombat(tables, { allies, enemies: foes(30, 'high', 4), seed: 'heal' });
    const heals = r.events.flatMap((e) => (e.type === 'action' ? e.effects.filter((f) => f.kind === 'heal') : []));
    expect(heals.length).toBeGreaterThan(0);
    for (const h of heals) expect(h).not.toHaveProperty('crit');
    expect(tables.skills.filter((s) => s.kind === 'heal').every((s) => (s.scaleStat ?? 'eAtk') === 'eAtk')).toBe(true);
  });

  it('치명타율·회피율은 상한에서 잘린다', () => {
    const u = { element: 'fire', stats: { ...statsAtLevel(tables, roleBaseStats(tables, 'archer'), 1), crit: 5, eva: 5 }, traits: [] };
    const s = computeEffectiveStats(tables, u);
    expect(s.crit).toBe(tables.stats.caps.crit);
    expect(s.eva).toBe(tables.stats.caps.eva);
  });
});

describe('특성 동작', () => {
  const unitWith = (traitId: string, role = 'warrior', element = 'fire') => ({
    element,
    stats: statsAtLevel(tables, roleBaseStats(tables, role), 10),
    traits: [{ id: traitId, rank: 1 }],
  });

  it('슬롯 해금 레벨에서 켜지고, 레벨업으로 새로 열리면 알려준다', () => {
    const ids = ['a', 'b', 'c'];
    const [l1, l2] = tables.traits.slotUnlockLevels;
    expect(activeTraits(tables, ids, l1 - 1)).toEqual([]);
    expect(activeTraits(tables, ids, l1).map((x) => x.id)).toEqual(['a']);
    expect(activeTraits(tables, ids, l2).map((x) => x.id)).toEqual(['a', 'b']);
    // 실제 계약자: m01은 슬롯1(강건함)이 Lv5에 열린다
    let s = newGame(tables, { seed: 'tr', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
    const m = getMerc(s, 'm02');
    s = { ...s, resources: { ...s.resources, arche: 999 }, mercenaries: s.mercenaries.map((x) => (x.id === 'm02' ? { ...x, level: l1 - 1, exp: 9999 } : x)) };
    expect(newTraitsOnLevelUp(tables, { ...m, level: l1 - 1 }, l1 - 1, l1)).toEqual([tables.roster.find((r) => r.id === 'm02')!.traits![0]]);
    const before = mercToUnit(tables, getMerc(s, 'm02')).traits;
    s = levelUp(tables, s, 'm02');
    expect(before).toEqual([]);
    expect(mercToUnit(tables, getMerc(s, 'm02')).traits.map((t) => t.id)).toEqual([tables.roster.find((r) => r.id === 'm02')!.traits![0]]);
  });

  it('hpBelow: 체력 조건 아래에서만 켜진다(버팀목: 40% 이하 방어 +30%)', () => {
    const u = unitWith('bulwark', 'shield');
    expect(computeEffectiveStats(tables, u, { hpRatio: 0.5 }).pDef).toBeCloseTo(u.stats.pDef, 2);
    expect(computeEffectiveStats(tables, u, { hpRatio: 0.4 }).pDef).toBeCloseTo(u.stats.pDef * 1.3, 2);
  });

  it('firstAction: 첫 행동에만 피해 배율(선제 사격 +25%)', () => {
    const u = unitWith('first_shot', 'archer');
    expect(traitMultiplier(tables, u, 'damageMul', { firstAction: true })).toBeCloseTo(1.25);
    expect(traitMultiplier(tables, u, 'damageMul', { firstAction: false })).toBe(1);
  });

  it('roundStack: 라운드마다 쌓이고 최대에서 멈춘다(투지 +4%/라운드, 최대 20%)', () => {
    const u = unitWith('fighting_spirit');
    expect(computeEffectiveStats(tables, u, { round: 1 }).pAtk).toBeCloseTo(u.stats.pAtk * 1.04, 2);
    expect(computeEffectiveStats(tables, u, { round: 3 }).pAtk).toBeCloseTo(u.stats.pAtk * 1.12, 2);
    expect(computeEffectiveStats(tables, u, { round: 9 }).pAtk).toBeCloseTo(u.stats.pAtk * 1.2, 2);
  });

  it('battleStart: 지속 라운드 동안만(규정 숙지 2라운드 속도 +10%)', () => {
    const u = unitWith('protocol');
    expect(computeEffectiveStats(tables, u, { round: 2 }).spd).toBeCloseTo(u.stats.spd * 1.1, 2);
    expect(computeEffectiveStats(tables, u, { round: 3 }).spd).toBeCloseTo(u.stats.spd, 2);
  });

  it('advantage: 상성 유리한 상대일 때만(공명 +10%), 상시 +4%는 늘(017b)', () => {
    const u = unitWith('resonance', 'mage', 'fire');
    const weak = tables.elements.find((e) => getElement(tables, 'fire').strongAgainst.includes(e.id))!.id;
    expect(traitMultiplier(tables, u, 'damageMul', { opponentElement: weak })).toBeCloseTo(1.14);
    expect(traitMultiplier(tables, u, 'damageMul', { opponentElement: 'fire' })).toBeCloseTo(1.04);
  });

  it('allies: 아군 전원에게 퍼진다(노련한 지휘: 속도 +4%)', () => {
    const giver = unitWith('unique_m20', 'commander');
    const other = { element: 'fire', stats: statsAtLevel(tables, roleBaseStats(tables, 'warrior'), 10), traits: [] };
    const auras = allyAuraRows(tables, giver);
    expect(computeEffectiveStats(tables, other, { allyAuras: auras }).spd).toBeCloseTo(other.stats.spd * 1.04, 2);
    expect(computeEffectiveStats(tables, other).spd).toBeCloseTo(other.stats.spd, 2);
  });

  it('상한: 스탯 배율 합과 피해 감소는 caps에서 멈춘다', () => {
    const big = (kind: 'statMul' | 'damageTakenMul', value: number): GameTables => ({
      ...tables,
      traits: {
        ...tables.traits,
        traits: [{ id: 'big', name: 'big', category: 'common', description: '', allowed: {}, tags: [], maxRank: 1, upgrade: null, ranks: [{ effects: [{ trigger: { type: 'always' }, effect: { kind, stat: 'hp', value, scope: 'self' } }] }] }],
      },
    });
    const u = { element: 'fire', stats: statsAtLevel(tables, roleBaseStats(tables, 'warrior'), 1), traits: [{ id: 'big', rank: 1 }] };
    expect(computeEffectiveStats(big('statMul', 5), u).hp).toBe(Math.round(u.stats.hp * (1 + tables.traits.caps.statMulMax)));
    expect(traitMultiplier(big('damageTakenMul', -0.9), u, 'damageTakenMul')).toBeCloseTo(1 + tables.traits.caps.damageTakenMulMin);
  });
});

describe('최종 스탯 계산 한 곳', () => {
  it('전투력은 최종 스탯(특성 포함)으로 계산하고, 위험도·전투와 같은 함수다', () => {
    let s = newGame(tables, { seed: 'one', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm02' ? { ...m, level: 30 } : m)) };
    const u = mercToUnit(tables, getMerc(s, 'm02'));
    expect(u.traits.length).toBeGreaterThan(0);
    const eff = computeEffectiveStats(tables, u, { round: 1, hpRatio: 1, row: 'back', allyAuras: allyAuraRows(tables, u) });
    expect(unitPower(tables, u, 'back')).toBeCloseTo(statsPower(tables, eff));
    expect(combatPower(tables, [{ unit: u, row: 'back' }])).toBe(Math.round(statsPower(tables, eff)));
    // 전투의 최대 체력도 같은 값
    const r = resolveCombat(tables, { allies: [{ unit: u, row: 'back' }], enemies: foes(1, 'low', 1), seed: 'hp' });
    const start = r.events[0];
    if (start.type !== 'start') throw new Error('start 이벤트 없음');
    expect(start.combatants[0].maxHp).toBe(eff.hp);
  });
});
