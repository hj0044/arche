import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { advanceDay, dispatch, newGame, type GameState } from './game';
import { deadlineMultiplier, isPreemptable, preemptionChance, rollPreemption } from './preemption';
import { generateRift, pickTerritoryFaction, type Rift } from './rift';
import { createRng, seedFromString } from './rng';

const opener = (seed = 'pre') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'p' } });

const rift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: `균열 ${id}`,
  appearedDay: 1,
  deadlineDay: 10,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  territoryFactionId: 'rrb',
  ...patch,
});

/** 선점 표만 바꾼 데이터 */
const withPre = (patch: Partial<GameTables['riftPreemption']>): GameTables => ({ ...tables, riftPreemption: { ...tables.riftPreemption, ...patch } });

describe('선점 확률(표 값 기준)', () => {
  const T = tables.riftPreemption;
  it('등급 기본값 × 마감 임박 보정', () => {
    expect(preemptionChance(tables, rift('a', { deadlineDay: 10 }), 5)).toBeCloseTo(T.baseChanceByTier.crack);
    expect(preemptionChance(tables, rift('a', { tier: 'gate', deadlineDay: 10 }), 5)).toBeCloseTo(T.baseChanceByTier.gate);
    expect(preemptionChance(tables, rift('a', { tier: 'route', deadlineDay: 10 }), 5)).toBeCloseTo(T.baseChanceByTier.route);
    expect(preemptionChance(tables, rift('a', { deadlineDay: 7 }), 5)).toBeCloseTo(T.baseChanceByTier.crack * deadlineMultiplier(tables, 2));
    expect(preemptionChance(tables, rift('a', { deadlineDay: 6 }), 5)).toBeCloseTo(T.baseChanceByTier.crack * deadlineMultiplier(tables, 1));
  });

  it('마감이 가까울수록 확률이 오른다', () => {
    const p = (left: number) => preemptionChance(tables, rift('a', { deadlineDay: 5 + left }), 5);
    expect(p(1)).toBeGreaterThan(p(2));
    expect(p(2)).toBeGreaterThan(p(3));
    expect(p(0)).toBeGreaterThanOrEqual(p(1));
    expect(deadlineMultiplier(tables, 1)).toBe(2);
    expect(deadlineMultiplier(tables, 2)).toBe(1.5);
    expect(deadlineMultiplier(tables, 3)).toBe(1);
  });

  it('안정화된 통로(마감 없음)와 그날 생긴 리프트는 판정하지 않는다', () => {
    expect(isPreemptable(tables, rift('a', { deadlineDay: null, stable: true }), 5)).toBe(false);
    expect(preemptionChance(tables, rift('a', { deadlineDay: null, stable: true }), 5)).toBe(0);
    expect(preemptionChance(tables, rift('a', { appearedDay: 5 }), 5)).toBe(0);
    expect(preemptionChance(tables, rift('a', { appearedDay: 4 }), 5)).toBeGreaterThan(0);
  });

  it('제외 조건은 데이터로 끌 수 있다', () => {
    const t = withPre({ exclude: { noDeadline: true, appearedToday: false } });
    expect(preemptionChance(t, rift('a', { appearedDay: 5 }), 5)).toBeGreaterThan(0);
  });

  it('데이터 값을 바꾸면 결과가 따라 바뀐다', () => {
    const rifts = Array.from({ length: 30 }, (_, i) => rift(`r${i}`));
    expect(rollPreemption(withPre({ baseChanceByTier: { crack: 1 } }), { seed: 's', rifts }, 5)).toHaveLength(30);
    expect(rollPreemption(withPre({ baseChanceByTier: { crack: 0 } }), { seed: 's', rifts }, 5)).toHaveLength(0);
  });

  it('같은 입력과 시드면 같은 결과, 시드가 다르면 다를 수 있다', () => {
    const t = withPre({ baseChanceByTier: { crack: 0.5 } });
    const rifts = Array.from({ length: 40 }, (_, i) => rift(`r${i}`));
    const ids = (seed: string) => rollPreemption(t, { seed, rifts }, 5).map((r) => r.id);
    expect(ids('a')).toEqual(ids('a'));
    expect(ids('a')).not.toEqual(ids('b'));
  });

  it('새 등급(표에 없는 등급)은 기본값을 쓰고, 표에 행을 넣으면 코드 수정 없이 쓴다', () => {
    expect(preemptionChance(tables, rift('a', { tier: 'abyss' }), 5)).toBe(T.defaultBaseChance);
    const t = withPre({ baseChanceByTier: { ...T.baseChanceByTier, abyss: 0.2 } });
    expect(preemptionChance(t, rift('a', { tier: 'abyss' }), 5)).toBeCloseTo(0.2);
  });
});

describe('하루 정산의 선점', () => {
  const always = withPre({ baseChanceByTier: { crack: 1, gate: 1, route: 1 } });

  it('선점되면 리프트가 사라지고 preempted 이벤트(세력 id)가 난다', () => {
    const s = { ...opener(), rifts: [rift('X', { territoryFactionId: 'archon' })] };
    const { state, events } = advanceDay(always, s);
    expect(state.rifts.some((r) => r.id === 'X')).toBe(false);
    expect(events).toContainEqual({ type: 'preempted', riftId: 'X', name: '균열 X', cityId: 'seoul', factionId: 'archon' });
  });

  it('출발한 리프트, 안정화된 통로, 그날 생긴 리프트는 선점되지 않는다', () => {
    let s: GameState = { ...opener(), rifts: [rift('GO', { durationDays: 3 }), rift('ST', { deadlineDay: null, stable: true })] };
    s = dispatch(always, s, 'GO', [{ mercId: 'm01', row: 'front' }]);
    const { state, events } = advanceDay(always, s);
    expect(state.rifts.some((r) => r.id === 'ST')).toBe(true);
    expect(state.expeditions.some((e) => e.rift.id === 'GO')).toBe(true);
    const pre = events.filter((e) => e.type === 'preempted').map((e) => (e as { riftId: string }).riftId);
    expect(pre).not.toContain('GO');
    expect(pre).not.toContain('ST');
    // 그날 새로 생긴 리프트는 남아 있다.
    for (const e of events) if (e.type === 'riftSpawned') expect(state.rifts.some((r) => r.id === e.riftId)).toBe(true);
  });

  it('선점은 결정적이다(같은 세이브면 같은 하루 결과)', () => {
    let a = opener('det-pre');
    let b = opener('det-pre');
    for (let i = 0; i < 30; i++) {
      const ra = advanceDay(tables, a);
      const rb = advanceDay(tables, b);
      expect(ra.events).toEqual(rb.events);
      a = ra.state;
      b = rb.state;
    }
  });
});

describe('영역 세력', () => {
  it('같은 시드면 같은 세력', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateRift(tables, 'seoul', 1, 'x', createRng(`t${i}`)).territoryFactionId).toBe(
        generateRift(tables, 'seoul', 1, 'x', createRng(`t${i}`)).territoryFactionId,
      );
    }
  });

  it('영향력이 0인 세력과 제외 세력(무소속)은 나오지 않는다', () => {
    const factions = tables.factions.map((f) => (f.id === 'rrb' ? { ...f, cityInfluence: { ...f.cityInfluence, seoul: 0 } } : f));
    const t = { ...tables, factions };
    const seen = new Set<string | null>();
    for (let i = 0; i < 300; i++) seen.add(pickTerritoryFaction(t, 'seoul', createRng(`w${i}`)));
    expect(seen.has('rrb')).toBe(false);
    expect(seen.has('free')).toBe(false);
    expect(seen.has(null)).toBe(false);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('고를 세력이 없으면 null(미정)', () => {
    expect(pickTerritoryFaction({ ...tables, factions: [] }, 'seoul', createRng('n'))).toBeNull();
    expect(pickTerritoryFaction(tables, 'atlantis', createRng('n'))).toBeNull();
  });

  it('새 세력을 행으로 더하면 코드 수정 없이 나온다', () => {
    const t = { ...tables, factions: [{ ...tables.factions[0], id: 'newco', name: '새 회사', cityInfluence: { seoul: 1000 } }] };
    expect(pickTerritoryFaction(t, 'seoul', createRng('n'))).toBe('newco');
  });

  it('기존 리프트 생성 결과(레벨·보상·흐림 등)는 변경 전과 같다(회귀, 이름 제외)', () => {
    // 해시는 지시서 013 이전 rift.ts의 generateRift로 같은 입력 120개를 만들고 이름만 뺀 값이다.
    // 영역 세력과 이름(1-2 교체)은 별도 난수 흐름이라 나머지 값은 그대로여야 한다.
    // 015의 등급 변형은 일부러 생성 결과를 바꾸므로, 변형을 뺀 데이터로 비교한다(변형이 없으면 예전과 같아야 한다).
    const t = { ...tables, riftTiers: tables.riftTiers.map(({ variants: _v, ...r }) => r) };
    const out: Omit<Rift, 'territoryFactionId' | 'name'>[] = [];
    for (const c of t.cities) {
      for (let i = 0; i < 40; i++) {
        const { territoryFactionId: _t, name: _n, ...r } = generateRift(t, c.id, 1 + i, `g${i}`, createRng(`reg:${c.id}:${i}`));
        out.push(r);
      }
    }
    expect(seedFromString(JSON.stringify(out))).toBe(1076688158);
  });
});

describe('합성 데이터(새 등급·새 세력)', () => {
  it('등급·세력 행을 더해도 코드 수정 없이 생성·선점·하루 진행이 된다', () => {
    const crack = tables.riftTiers.find((r) => r.id === 'crack')!;
    const t: GameTables = {
      ...tables,
      riftTiers: [...tables.riftTiers, { ...crack, id: 'abyss', name: '심연' }],
      cities: tables.cities.map((c) => ({ ...c, riftSpawn: { ...c.riftSpawn, tierWeights: { abyss: 1 } } })),
      factions: [...tables.factions, { ...tables.factions[0], id: 'newco', name: '새 회사', cityInfluence: { seoul: 5, tokyo: 5, newyork: 5 } }],
      riftPreemption: { ...tables.riftPreemption, baseChanceByTier: { abyss: 0.3 } },
    };
    let s = newGame(t, { seed: 'syn', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'p' } });
    let preempted = 0;
    const factionsSeen = new Set<string | null>();
    for (let i = 0; i < 20; i++) {
      const r = advanceDay(t, s);
      s = r.state;
      preempted += r.events.filter((e) => e.type === 'preempted').length;
      for (const x of s.rifts) factionsSeen.add(x.territoryFactionId);
    }
    expect(s.rifts.some((r) => r.tier === 'abyss')).toBe(true);
    expect(preempted).toBeGreaterThan(0);
    expect(factionsSeen.has('newco')).toBe(true);
  });
});


describe('리프트 이름(지시서 013 1-2)', () => {
  const strip = ({ name: _n, ...r }: Rift) => r;
  it('이름은 "도시 이름 + 등급 이름 목록 중 하나"이고, 겹치는 이름을 피한다', () => {
    const tier = tables.riftTiers.find((t) => t.id === 'route')!;
    const all = tier.names.map((n) => `뉴욕 ${n}`);
    const taken = all.slice(0, -1);
    for (let i = 0; i < 20; i++) {
      const r = generateRift(tables, 'newyork', 1, 'x', createRng(`n${i}`), { tier: 'route' }, taken);
      expect(r.name).toBe(all.at(-1));
    }
  });
  it('고를 이름이 모자라면 겹침을 허용한다', () => {
    const tier = tables.riftTiers.find((t) => t.id === 'gate')!;
    const r = generateRift(tables, 'tokyo', 1, 'x', createRng('full'), { tier: 'gate' }, tier.names.map((n) => `도쿄 ${n}`));
    expect(tier.names.map((n) => `도쿄 ${n}`)).toContain(r.name);
  });
  it('겹침 목록이 달라도 이름 말고 다른 값은 같다(별도 난수 흐름)', () => {
    for (let i = 0; i < 20; i++) {
      const a = generateRift(tables, 'seoul', 3, 'x', createRng(`k${i}`));
      const b = generateRift(tables, 'seoul', 3, 'x', createRng(`k${i}`), undefined, [a.name]);
      expect(b.name).not.toBe(a.name);
      expect(strip(b)).toEqual(strip(a));
    }
  });
  it('하루 진행에서 같은 도시의 활성 리프트(목록·파견 중) 이름이 겹치지 않는다', () => {
    let s = opener('names');
    for (let d = 0; d < 40; d++) {
      s = advanceDay(tables, s).state;
      for (const c of tables.cities) {
        const names = [...s.rifts, ...s.expeditions.map((e) => e.rift)].filter((r) => r.cityId === c.id).map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });
});
