import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('시드 난수', () => {
  it('같은 시드면 같은 수열, 다른 시드면 다른 수열', () => {
    const seq = (seed: number | string) => {
      const r = createRng(seed);
      return Array.from({ length: 20 }, () => r.next());
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq('arche')).toEqual(seq('arche'));
    expect(seq(42)).not.toEqual(seq(43));
  });

  it('int는 양 끝을 포함한 범위 안의 정수', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 5);
      expect(Number.isInteger(v) && v >= 3 && v <= 5).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('상태를 꺼내 이어서 같은 수열을 만든다', () => {
    const a = createRng(7);
    a.next();
    const b = createRng(a.getState());
    expect(b.next()).toBe(a.next());
  });
});
