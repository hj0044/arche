import { describe, expect, it } from 'vitest';
import { tables as baseTables, type GameTables } from '../data';
import {
  compositionMultiplier,
  elementMultiplier,
  resolveCombat,
  validateParty,
  type CombatEvent,
  type CombatSlot,
} from './combat';
import { rollInjuries } from './injury';
import { createRng } from './rng';
import { sampleMonsters, sampleParty } from './samples';
import { createMercenary, createMonster, type Unit } from './unit';

const tables = baseTables;

/** 표 일부를 바꾼 사본. 테스트에서 변수(분산 등)를 걷어낼 때 쓴다. */
function withCombat(patch: Partial<GameTables['combat']>): GameTables {
  return { ...tables, combat: { ...tables.combat, ...patch } };
}
const noVariance = withCombat({ damage: { ...tables.combat.damage, varianceMin: 1, varianceMax: 1 } });

const merc = (id: string, role: string, element = 'fire', level = 5) =>
  createMercenary(tables, { id, name: id, element, role, level });
const mon = (id: string, role: string, level = 5, element = 'void') =>
  createMonster(tables, { id, name: id, element, role, grade: 'mid', level });

/** 체력만 크게 키운 유닛: 한 번에 쓰러지지 않게 해서 타겟팅을 관찰한다. */
function tough(u: Unit, hp = 100000): Unit {
  return { ...u, stats: { ...u.stats, hp } };
}

function damageTargets(events: CombatEvent[], actorKeyPrefix: string, skillKinds?: string[]) {
  return events
    .filter((e): e is Extract<CombatEvent, { type: 'action' }> => e.type === 'action')
    .filter((e) => e.actor.startsWith(actorKeyPrefix))
    .filter((e) => !skillKinds || skillKinds.includes(e.skillId))
    .flatMap((e) => e.effects.filter((f) => f.kind === 'damage').map((f) => f.target));
}

describe('결정성', () => {
  it('같은 입력과 같은 시드면 같은 결과와 로그', () => {
    const run = (seed: string) =>
      resolveCombat(tables, { allies: sampleParty(tables), enemies: sampleMonsters(tables), seed });
    expect(run('s1')).toEqual(run('s1'));
  });

  it('시드가 다르면 로그가 달라질 수 있다', () => {
    const logs = new Set(
      ['a', 'b', 'c', 'd'].map((seed) =>
        JSON.stringify(resolveCombat(tables, { allies: sampleParty(tables), enemies: sampleMonsters(tables), seed }).events),
      ),
    );
    expect(logs.size).toBeGreaterThan(1);
  });
});

describe('속성 상성', () => {
  it('유리 ×1.3, 불리 ×0.75, 그 외 ×1.0', () => {
    expect(elementMultiplier(tables, 'fire', 'wind')).toBe(1.3);
    expect(elementMultiplier(tables, 'wind', 'fire')).toBe(0.75);
    expect(elementMultiplier(tables, 'fire', 'earth')).toBe(1.0);
    expect(elementMultiplier(tables, 'fire', 'fire')).toBe(1.0);
  });

  it('5각 순환: 화염→바람→대지→전격→냉기→화염', () => {
    const cycle = ['fire', 'wind', 'earth', 'lightning', 'frost'];
    cycle.forEach((e, i) => expect(elementMultiplier(tables, e, cycle[(i + 1) % 5])).toBe(1.3));
  });

  it('빛과 어둠은 서로에게 유리하다', () => {
    expect(elementMultiplier(tables, 'light', 'void')).toBe(1.3);
    expect(elementMultiplier(tables, 'void', 'light')).toBe(1.3);
  });

  it('전투 피해에 상성 배율이 들어간다', () => {
    const hit = (element: string) => {
      const r = resolveCombat(noVariance, {
        allies: [{ unit: merc('a', 'warrior', element), row: 'front' }],
        enemies: [{ unit: tough(mon('t', 'warrior', 5, 'wind')), row: 'front' }],
        seed: 1,
      });
      const ev = r.events.find((e) => e.type === 'action' && e.actor === 'a0');
      if (ev?.type !== 'action') throw new Error('행동 없음');
      return ev.effects[0];
    };
    const strong = hit('fire');
    const neutral = hit('lightning');
    if (strong.kind !== 'damage' || neutral.kind !== 'damage') throw new Error('피해 아님');
    expect(strong.elementMultiplier).toBe(1.3);
    expect(neutral.elementMultiplier).toBe(1.0);
    expect(strong.amount / neutral.amount).toBeCloseTo(1.3, 1);
  });
});

describe('열 배치와 타겟팅', () => {
  it('일반 공격은 전열을 먼저 노린다', () => {
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('a', 'archer')), row: 'back' }],
      enemies: [
        { unit: tough(mon('f', 'warrior')), row: 'front' },
        { unit: tough(mon('b', 'archer')), row: 'back' },
      ],
      seed: 3,
    });
    const targets = damageTargets(r.events, 'a');
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(['e0']));
  });

  it('전열이 없으면 후열이 그대로 노출된다', () => {
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('a', 'warrior')), row: 'front' }],
      enemies: [{ unit: tough(mon('b', 'archer')), row: 'back' }],
      seed: 3,
    });
    expect(damageTargets(r.events, 'a')).toContain('e0');
  });

  it('전열이 쓰러지면 다음 공격은 후열로 간다', () => {
    const weakFront = { ...mon('f', 'warrior'), stats: { ...mon('f', 'warrior').stats, hp: 1 } };
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('a', 'warrior', 'fire', 20)), row: 'front' }],
      enemies: [
        { unit: weakFront, row: 'front' },
        { unit: tough(mon('b', 'archer')), row: 'back' },
      ],
      seed: 5,
    });
    const targets = damageTargets(r.events, 'a');
    expect(targets[0]).toBe('e0');
    expect(targets.slice(1).every((t) => t === 'e1')).toBe(true);
  });

  it('술사의 범위 공격은 양 열에 닿는다', () => {
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('m', 'mage')), row: 'back' }],
      enemies: [
        { unit: tough(mon('f', 'warrior')), row: 'front' },
        { unit: tough(mon('b', 'archer')), row: 'back' },
      ],
      seed: 2,
    });
    const storm = r.events.find((e) => e.type === 'action' && e.skillId === 'mage_storm');
    if (storm?.type !== 'action') throw new Error('광역 방출을 쓰지 않음');
    expect(new Set(storm.effects.map((f) => f.target))).toEqual(new Set(['e0', 'e1']));
  });

  it('기본 위치가 아닌 열에 두면 주는 피해가 줄고 받는 피해가 는다', () => {
    const run = (row: 'front' | 'back') =>
      resolveCombat(noVariance, {
        allies: [{ unit: tough(merc('a', 'archer')), row }],
        enemies: [{ unit: tough(mon('t', 'warrior', 5, 'fire')), row: 'front' }],
        seed: 9,
      });
    const first = (r: ReturnType<typeof run>, actor: string) => {
      const ev = r.events.find((e) => e.type === 'action' && e.actor === actor && e.skillId.endsWith('_shot'));
      const ev2 = ev ?? r.events.find((e) => e.type === 'action' && e.actor === actor && e.skillId === 'warrior_slash');
      if (ev2?.type !== 'action' || ev2.effects[0].kind !== 'damage') throw new Error('기본 공격 없음');
      return ev2.effects[0].amount;
    };
    const home = run('back');
    const away = run('front');
    const { damageDealtMultiplier, damageTakenMultiplier } = tables.combat.offRow;
    expect(first(away, 'a0') / first(home, 'a0')).toBeCloseTo(damageDealtMultiplier, 1);
    expect(first(away, 'e0') / first(home, 'e0')).toBeCloseTo(damageTakenMultiplier, 1);
  });
});

describe('도발', () => {
  it('도발 중인 방패에게 단일 공격이 몰린다(후열 방패라도)', () => {
    const r = resolveCombat(tables, {
      allies: [
        { unit: tough(merc('w', 'warrior')), row: 'front' },
        { unit: tough({ ...merc('s', 'shield'), stats: { ...merc('s', 'shield').stats, spd: 99 } }), row: 'back' },
      ],
      enemies: [{ unit: tough(mon('x', 'archer')), row: 'back' }],
      seed: 4,
    });
    // 방패가 속도 99로 먼저 도발한다. 도발이 걸린 1라운드의 적 단일 공격은 모두 방패(a1)에게 간다.
    const round1 = r.events.filter((e) => e.type === 'action' && e.round === 1);
    expect(round1[0]?.type === 'action' && round1[0].skillId).toBe('shield_taunt');
    const enemyTargets = round1.flatMap((e) =>
      e.type === 'action' && e.actor === 'e0' ? e.effects.map((f) => f.target) : [],
    );
    expect(enemyTargets.length).toBeGreaterThan(0);
    expect(enemyTargets.every((t) => t === 'a1')).toBe(true);
  });
});

describe('행동 순서', () => {
  it('속도가 높은 유닛부터, 같으면 전열 먼저', () => {
    const fast = { ...merc('fast', 'archer'), stats: { ...merc('fast', 'archer').stats, spd: 50 } };
    const sameA = { ...merc('sa', 'warrior'), stats: { ...merc('sa', 'warrior').stats, spd: 20 } };
    const sameB = { ...merc('sb', 'mage'), stats: { ...merc('sb', 'mage').stats, spd: 20 } };
    const r = resolveCombat(tables, {
      allies: [
        { unit: tough(sameB), row: 'back' },
        { unit: tough(sameA), row: 'front' },
        { unit: tough(fast), row: 'back' },
      ],
      enemies: [{ unit: tough({ ...mon('slow', 'warrior'), stats: { ...mon('slow', 'warrior').stats, spd: 1 } }), row: 'front' }],
      seed: 8,
    });
    const round = r.events.find((e) => e.type === 'round');
    expect(round?.type === 'round' && round.order).toEqual(['a2', 'a1', 'a0', 'e0']);
  });

  it('스킬은 쿨다운 동안 다시 쓰지 않는다', () => {
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('w', 'warrior')), row: 'front' }],
      enemies: [{ unit: tough(mon('t', 'shield')), row: 'front' }],
      seed: 6,
    });
    const used = r.events.filter((e) => e.type === 'action' && e.actor === 'a0').map((e) => (e.type === 'action' ? e.skillId : ''));
    const cd = tables.skills.find((s) => s.id === 'warrior_heavy')!.cooldown;
    const turns = used.flatMap((s, i) => (s === 'warrior_heavy' ? [i] : []));
    expect(turns.length).toBeGreaterThan(1);
    for (let i = 1; i < turns.length; i++) expect(turns[i] - turns[i - 1]).toBeGreaterThanOrEqual(cd);
  });
});

describe('라운드 제한', () => {
  it('최대 라운드를 넘기면 철수', () => {
    const r = resolveCombat(tables, {
      allies: [{ unit: tough(merc('a', 'shield')), row: 'front' }],
      enemies: [{ unit: tough(mon('b', 'shield')), row: 'front' }],
      seed: 1,
    });
    expect(r.outcome).toBe('retreat');
    expect(r.rounds).toBe(tables.combat.maxRounds);
    expect(r.events.at(-1)).toEqual({ type: 'end', outcome: 'retreat', rounds: tables.combat.maxRounds });
  });

  it('라운드 수는 데이터 표를 따른다', () => {
    const r = resolveCombat(withCombat({ maxRounds: 3 }), {
      allies: [{ unit: tough(merc('a', 'shield')), row: 'front' }],
      enemies: [{ unit: tough(mon('b', 'shield')), row: 'front' }],
      seed: 1,
    });
    expect(r.rounds).toBe(3);
  });

  it('적이 전멸하면 승리, 아군이 전멸하면 패배', () => {
    const strong = (u: Unit) => tough({ ...u, stats: { ...u.stats, atk: 9999 } });
    expect(
      resolveCombat(tables, { allies: [{ unit: strong(merc('a', 'warrior')), row: 'front' }], enemies: [{ unit: mon('b', 'warrior'), row: 'front' }], seed: 1 })
        .outcome,
    ).toBe('victory');
    expect(
      resolveCombat(tables, { allies: [{ unit: merc('a', 'warrior'), row: 'front' }], enemies: [{ unit: strong(mon('b', 'warrior')), row: 'front' }], seed: 1 })
        .outcome,
    ).toBe('defeat');
  });
});

describe('파티 구성', () => {
  it('전위·딜러·지원이 모두 있으면 +15%', () => {
    expect(compositionMultiplier(tables, ['shield', 'archer', 'healer'])).toBeCloseTo(1.15);
  });
  it('하나 없으면 그 몫으로 -10%', () => {
    expect(compositionMultiplier(tables, ['shield', 'archer'])).toBeCloseTo(1.0);
    expect(compositionMultiplier(tables, ['warrior'])).toBeCloseTo(0.85);
  });
  it('구성 배율이 아군 피해에 들어간다', () => {
    const target = () => [{ unit: tough(mon('t', 'warrior', 5, 'earth')), row: 'front' as const }];
    const firstHit = (allies: CombatSlot[]) => {
      const r = resolveCombat(noVariance, { allies, enemies: target(), seed: 1 });
      const ev = r.events.find((e) => e.type === 'action' && e.actor === 'a0');
      if (ev?.type !== 'action' || ev.effects[0].kind !== 'damage') throw new Error();
      return ev.effects[0].amount;
    };
    const slow = (u: Unit) => tough({ ...u, stats: { ...u.stats, spd: 0 } });
    const alone = firstHit([{ unit: merc('w', 'warrior'), row: 'front' }]);
    const full = firstHit([
      { unit: merc('w', 'warrior'), row: 'front' },
      { unit: slow(merc('ar', 'archer')), row: 'back' },
      { unit: slow(merc('h', 'healer')), row: 'back' },
    ]);
    expect(full / alone).toBeCloseTo(1.15 / 0.85, 1);
  });
});

describe('파티 편성 규칙', () => {
  it('최대 5인, 전원 전열도 가능, 6인은 안 됨', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ unit: merc(`u${i}`, 'warrior'), row: 'front' as const }));
    expect(validateParty(tables, five)).toEqual([]);
    expect(validateParty(tables, [...five, { unit: merc('u5', 'warrior'), row: 'back' }]).length).toBeGreaterThan(0);
  });
  it('비활성 역할(암습자)은 넣을 수 없다', () => {
    expect(() => createMercenary(tables, { id: 'x', name: 'x', element: 'fire', role: 'assassin', level: 1 })).toThrow();
  });
});

describe('부상', () => {
  const party = [merc('a', 'warrior'), merc('b', 'archer')];
  const withHealer = [...party, merc('h', 'healer')];
  const sev = (id: string) => tables.injuries.severities.find((s) => s.id === id)!;

  it('쓰러진 용병만 부상, 일수는 경상·중상 범위 안', () => {
    for (let seed = 0; seed < 200; seed++) {
      const inj = rollInjuries(tables, party, ['a'], 'defeat', createRng(seed));
      expect(inj).toHaveLength(1);
      const [lo, hi] = sev(inj[0].severity).days;
      expect(inj[0].days).toBeGreaterThanOrEqual(lo);
      expect(inj[0].days).toBeLessThanOrEqual(hi);
    }
  });

  it('치유사가 있으면 1일 줄고 최소 1일', () => {
    for (let seed = 0; seed < 200; seed++) {
      const without = rollInjuries(tables, party, ['a'], 'victory', createRng(seed))[0];
      const withH = rollInjuries(tables, withHealer, ['a'], 'victory', createRng(seed))[0];
      expect(withH.severity).toBe(without.severity);
      expect(withH.days).toBe(Math.max(1, without.days - 1));
    }
  });

  it('부상을 쓰지 않는 유닛(몬스터)은 부상이 없다', () => {
    expect(rollInjuries(tables, [mon('m', 'warrior')], ['m'], 'defeat', createRng(1))).toEqual([]);
  });
});
