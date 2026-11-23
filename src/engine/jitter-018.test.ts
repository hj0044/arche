/**
 * 지시서 018 5번: 행동 순서 흔들림(speedJitter)의 결정성. 난수 흐름별 소비량을 세려고 rng를 감싼다.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getRole, tables, type GameTables } from '../data';

const draws = new Map<string, number>();
vi.mock('./rng', async (orig) => {
  const mod = await orig<typeof import('./rng')>();
  return {
    ...mod,
    createRng: (seed: number | string) => {
      const rng = mod.createRng(seed);
      const stream = typeof seed === 'string' ? (seed.endsWith(':init') ? 'init' : seed.endsWith(':hit') ? 'hit' : 'main') : 'other';
      const next = rng.next;
      const counted = () => {
        draws.set(stream, (draws.get(stream) ?? 0) + 1);
        return next();
      };
      return {
        ...rng,
        next: counted,
        int: (a: number, b: number) => a + Math.floor(counted() * (b - a + 1)),
        float: (a: number, b: number) => a + counted() * (b - a),
        chance: (p: number) => counted() < p,
        pick: <T,>(xs: readonly T[]) => xs[Math.floor(counted() * xs.length)],
      };
    },
  };
});

const { resolveCombat } = await import('./combat');
const { createRng } = await import('./rng');
const { createMercenary, createMonster } = await import('./unit');

const roles = ['shield', 'warrior', 'archer', 'mage', 'healer', 'commander'];
/** main(018 이전)에서도 같은 해시가 나오는 고정 전투 300개 */
function fightOf(i: number) {
  const r = createRng(`golden:${i}`);
  const allies = Array.from({ length: r.int(1, 5) }, (_, k) => {
    const u = createMercenary(tables, { id: `a${k}`, name: `a${k}`, element: r.pick(['fire', 'frost', 'earth', 'void']), role: r.pick(roles), level: r.int(1, 40) });
    return { unit: u, row: getRole(tables, u.role).defaultRow };
  });
  const enemies = Array.from({ length: r.int(1, 4) }, (_, k) => {
    const m = r.pick(tables.monsters);
    const u = createMonster(tables, { id: `e${k}`, name: m.name, element: m.element, role: m.role, level: r.int(1, 40), grade: r.pick(['low', 'mid']), monsterId: m.id });
    return { unit: u, row: getRole(tables, u.role).defaultRow };
  });
  return { allies, enemies, seed: `golden-seed:${i}` };
}
const withJitter = (j: number): GameTables => ({ ...tables, combat: { ...tables.combat, speedJitter: j } });

describe('018 5: 행동 순서 흔들림', () => {
  it('speedJitter 0이면 변경 전(main)과 전투 결과가 같다', () => {
    const h = createHash('sha256');
    for (let i = 0; i < 300; i++) h.update(JSON.stringify(resolveCombat(withJitter(0), fightOf(i)).events));
    expect(h.digest('hex')).toBe('ebfd2fffb044dc1bb8b0cc5217f75595ffc4d866213c562297bc655874aa9c52');
  });

  it('speedJitter > 0에서도 같은 시드 = 같은 결과(2,000개 시드)', () => {
    const t = withJitter(0.1);
    let changed = 0;
    for (let i = 0; i < 2000; i++) {
      const f = fightOf(i % 300);
      const seed = `jitter:${i}`;
      const a = JSON.stringify(resolveCombat(t, { ...f, seed }).events);
      expect(JSON.stringify(resolveCombat(t, { ...f, seed }).events)).toBe(a);
      if (a !== JSON.stringify(resolveCombat(withJitter(0), { ...f, seed }).events)) changed++;
    }
    expect(changed).toBeGreaterThan(0); // 흔들림이 실제로 순서를 바꾼다
  });

  it('흔들림 흐름의 소비량은 스탯·값과 상관없이 라운드 × 전체 유닛 수다', () => {
    for (const j of [0, 0.05, 0.1]) {
      for (let i = 0; i < 50; i++) {
        const f = fightOf(i);
        draws.clear();
        const r = resolveCombat(withJitter(j), f);
        expect(draws.get('init') ?? 0).toBe(r.rounds * (f.allies.length + f.enemies.length));
      }
    }
  });

  it('새 흐름은 기존 시드·시드:hit 흐름의 소비에 끼어들지 않는다', () => {
    let compared = 0;
    for (let i = 0; i < 300; i++) {
      const f = fightOf(i);
      draws.clear();
      const base = JSON.stringify(resolveCombat(withJitter(0), f).events);
      const before = { main: draws.get('main'), hit: draws.get('hit') };
      draws.clear();
      const jittered = JSON.stringify(resolveCombat(withJitter(0.05), f).events);
      // 흔들림이 순서를 바꾸지 않은 전투는 기존 흐름의 소비량과 결과가 그대로다
      if (jittered !== base) continue;
      compared++;
      expect({ main: draws.get('main'), hit: draws.get('hit') }).toEqual(before);
    }
    expect(compared).toBeGreaterThan(50);
  });
});
