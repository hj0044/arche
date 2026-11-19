/**
 * 시드 기반 난수 생성기(mulberry32). 같은 시드면 같은 수열을 낸다.
 * 상태는 32비트 정수 하나라서 세이브에 그대로 넣을 수 있다.
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max] 정수 */
  int(min: number, max: number): number;
  /** [min, max) 실수 */
  float(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  getState(): number;
}

export function seedFromString(text: string): number {
  // FNV-1a 32비트
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? seedFromString(seed) : seed) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('빈 목록에서 고를 수 없다');
      return items[Math.floor(next() * items.length)];
    },
    getState: () => state,
  };
}
