import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { rollInjuries } from './injury';
import { generateRift, riftModifiers, riftReward, type Rift } from './rift';
import { createRng } from './rng';
import { getMerc, mercToUnit, newGame } from './game';

describe('리프트 등급 변형(지시서 015)', () => {
  it('변형 행으로 리프트가 생성되고, 레벨·적 수가 변형 범위 안이며 결정적이다', () => {
    const seen = new Set<string>();
    for (const city of tables.cities) {
      for (let i = 0; i < 300; i++) {
        const a = generateRift(tables, city.id, 1, `v${i}`, createRng(`var:${city.id}:${i}`));
        expect(generateRift(tables, city.id, 1, `v${i}`, createRng(`var:${city.id}:${i}`))).toEqual(a);
        const tier = tables.riftTiers.find((t) => t.id === a.tier)!;
        if (!tier.variants?.length) {
          expect(a.variant).toBeUndefined();
          continue;
        }
        const v = tier.variants.find((x) => x.id === a.variant)!;
        expect(v).toBeDefined();
        seen.add(`${a.tier}:${v.id}`);
        const [cLo, cHi] = v.enemyCount ?? tier.enemyCount;
        expect(a.enemies.length).toBeGreaterThanOrEqual(cLo);
        expect(a.enemies.length).toBeLessThanOrEqual(cHi);
        if (v.monsterGradeWeights) expect(Object.keys(v.monsterGradeWeights)).toContain(a.enemies[0].grade);
        for (const e of a.enemies) expect(tables.monsters.find((m) => m.id === e.monsterId)?.element).toBe('void');
      }
    }
    // 데이터에 있는 변형이 모두 실제로 나온다
    for (const t of tables.riftTiers) for (const v of t.variants ?? []) if ((tables.cities.some((c) => (c.riftSpawn.tierWeights[t.id] ?? 0) > 0))) expect(seen.has(`${t.id}:${v.id}`)).toBe(true);
  });

  it('시작 리프트(고정)는 첫 행(기본 변형)', () => {
    for (let i = 0; i < 20; i++) {
      const r = generateRift(tables, 'seoul', 1, 'x', createRng(`f${i}`), { tier: 'crack', grade: 'low' });
      expect(r.variant).toBe(tables.riftTiers.find((t) => t.id === 'crack')!.variants![0].id);
    }
  });

  it('보상·부상 배율은 데이터 한 곳(등급·변형)에서 바뀐다', () => {
    const base = generateRift(tables, 'seoul', 1, 'x', createRng('m'), { tier: 'crack', grade: 'low' });
    const t: GameTables = {
      ...tables,
      riftTiers: tables.riftTiers.map((x) =>
        x.id === 'crack' ? { ...x, rewardMultiplier: 2, injuryDaysMultiplier: 3, variants: x.variants!.map((v, i) => (i === 0 ? { ...v, rewardMultiplier: 1.5 } : v)) } : x,
      ),
    };
    expect(riftModifiers(tables, base)).toEqual({ reward: 1, injuryDays: 1 });
    expect(riftModifiers(t, base)).toEqual({ reward: 3, injuryDays: 3 });
    expect(riftReward(t, base, 'victory').zero).toBeGreaterThan(riftReward(tables, base, 'victory').zero * 2.9);
    const g = newGame(tables, { seed: 'u', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'g', background: 'heir' } });
    const unit = mercToUnit(tables, getMerc(g, 'm02'));
    const a = rollInjuries(tables, [unit], [unit.id], 'defeat', createRng('inj'), 0, 1)[0];
    const b = rollInjuries(tables, [unit], [unit.id], 'defeat', createRng('inj'), 0, 3)[0];
    expect(b.days).toBe(Math.max(tables.injuries.minimumDays, Math.round(a.days * 3)));
  });

  it('변형이 없는 등급(항로)은 예전과 같은 방식으로 생성된다', () => {
    const r: Rift = generateRift(tables, 'newyork', 1, 'x', createRng('route'), { tier: 'route' });
    expect(r.variant).toBeUndefined();
  });
});
