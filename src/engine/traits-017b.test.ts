/** 지시서 017b 2-4: 속성 조건 특성에 더한 상시 소효과가 공허전에서 실제로 발동한다 */
import { describe, expect, it } from 'vitest';
import { getRole, tables } from '../data';
import { resolveCombat } from './combat';
import { mercToUnit, type MercenaryState } from './game';
import { computeEffectiveStats, traitMultiplier } from './stats';
import { createMonster } from './unit';

const merc = (id: string, level: number) => {
  const m = tables.roster.find((r) => r.id === id)!;
  const state: MercenaryState = {
    id: m.id, name: m.name, role: m.role, element: m.element, level, exp: 0,
    initialLevel: m.initialLevel, growth: m.growth, affiliation: { kind: 'guild' },
    profile: { background: m.background, world: m.world, race: m.race },
  };
  return mercToUnit(tables, state);
};
const withoutTrait = (u: ReturnType<typeof merc>, id: string) => ({ ...u, traits: (u.traits ?? []).filter((t) => t.id !== id) });

describe('017b: 상시 소효과', () => {
  it('속성 친화(화염, 쿠로세 렌 Lv50)는 공허 상대로 피해 +4%가 켜진다', () => {
    const u = merc('m02', 50);
    expect(u.traits?.some((t) => t.id === 'affinity_fire')).toBe(true);
    expect(traitMultiplier(tables, u, 'damageMul', { opponentElement: 'void' }) - traitMultiplier(tables, withoutTrait(u, 'affinity_fire'), 'damageMul', { opponentElement: 'void' })).toBeCloseTo(0.04, 9);
  });

  it('공명(윤서아 Lv40)도 공허 상대로 +4%', () => {
    const u = merc('m04', 40);
    expect(traitMultiplier(tables, u, 'damageMul', { opponentElement: 'void' }) - traitMultiplier(tables, withoutTrait(u, 'resonance'), 'damageMul', { opponentElement: 'void' })).toBeCloseTo(0.04, 9);
  });

  it('서리의 결정(시라유키 하루카 Lv35)은 상시 에너지공격 +4%', () => {
    const u = merc('m14', 35);
    const on = computeEffectiveStats(tables, u, { opponentElement: 'void' }).eAtk;
    const off = computeEffectiveStats(tables, withoutTrait(u, 'unique_m14'), { opponentElement: 'void' }).eAtk;
    // statMul은 같은 스탯끼리 합한 뒤 곱한다: 차이 = 특성 전 스탯 × 0.04
    expect(on - off).toBeCloseTo(u.stats.eAtk * 0.04, 2);
  });

  it('실제 공허전에서 같은 시드면 특성이 있는 쪽의 첫 피해가 4% 크다', () => {
    const u = merc('m02', 50);
    const foe = createMonster(tables, { id: 'z', name: 'z', element: 'void', role: 'shield', level: 60, grade: 'high', monsterId: 'husk_guard' });
    const fight = (unit: typeof u) =>
      resolveCombat(tables, { allies: [{ unit, row: getRole(tables, unit.role).defaultRow }], enemies: [{ unit: foe, row: 'front' }], seed: '017b' }).events;
    const firstHit = (ev: ReturnType<typeof fight>) => {
      for (const e of ev) if (e.type === 'action' && e.actor === 'a0') for (const f of e.effects) if (f.kind === 'damage' && !f.evaded) return f.amount;
      throw new Error('피해 없음');
    };
    const ratio = firstHit(fight(u)) / firstHit(fight(withoutTrait(u, 'affinity_fire')));
    // damageMul은 합산 배율이라 기대 비율 = (1 + 합 + 0.04) / (1 + 합). 피해는 정수로 반올림되어 조금 흔들린다
    const want = traitMultiplier(tables, u, 'damageMul', { opponentElement: 'void', round: 1, firstAction: true }) / traitMultiplier(tables, withoutTrait(u, 'affinity_fire'), 'damageMul', { opponentElement: 'void', round: 1, firstAction: true });
    expect(want).toBeGreaterThan(1);
    expect(Math.abs(ratio - want)).toBeLessThan(0.01);
  });
});
