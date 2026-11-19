import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import {
  advanceDay,
  dispatch,
  expToNextLevel,
  GameError,
  getMerc,
  isAvailable,
  levelUp,
  newGame,
  recruit,
  type GameState,
  type PartyMember,
} from './game';
import type { Rift } from './rift';

const opener = () =>
  newGame(tables, {
    seed: 'test',
    guildName: '새벽 길드',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: '주인공', element: 'fire', role: 'warrior', background: 'survivor' },
  });

/** 확실히 이기는/지는 리프트를 직접 끼워 넣는다. */
function withRift(state: GameState, patch: Partial<Rift> & { id: string }): GameState {
  const rift: Rift = {
    cityId: 'seoul',
    tier: 'crack',
    name: '시험 균열',
    appearedDay: state.day,
    deadlineDay: state.day + 3,
    durationDays: 1,
    enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
    reward: { zero: 100, arche: 20, materials: {} },
    ...patch,
  };
  return { ...state, rifts: [...state.rifts, rift] };
}

const strongEnemy = (count = 5) =>
  Array.from({ length: count }, () => ({ monsterId: 'devourer', grade: 'extreme', level: 35, row: 'front' as const }));

const guildParty = (state: GameState, ids?: string[]): PartyMember[] =>
  (ids ?? state.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => m.id))
    .slice(0, 5)
    .map((mercId) => ({ mercId, row: tables.roles.find((r) => r.id === getMerc(state, mercId).role)!.defaultRow }));

describe('새 게임', () => {
  it('개방자 주인공은 길드 용병으로 들어가고 길드 마스터 모드는 아니다', () => {
    const s = opener();
    expect(s.protagonist.mercId).toBe('hero');
    expect(getMerc(s, 'hero').isProtagonist).toBe(true);
    const gm = newGame(tables, {
      seed: 't',
      guildName: 'g',
      baseCityId: 'tokyo',
      protagonist: { mode: 'guildMaster', name: 'gm', background: 'citizen' },
    });
    expect(gm.protagonist.mercId).toBeUndefined();
    expect(gm.mercenaries.some((m) => m.isProtagonist)).toBe(false);
  });

  it('도시마다 다른 리프트 목록으로 시작한다', () => {
    const s = opener();
    for (const city of tables.cities) {
      expect(s.rifts.filter((r) => r.cityId === city.id)).toHaveLength(city.riftSpawn.initialCount);
    }
    for (const r of s.rifts) expect(r.enemies.every((e) => tables.monsters.find((m) => m.id === e.monsterId)?.element === 'void')).toBe(true);
  });

  it('같은 시드면 같은 시작 상태', () => {
    expect(opener()).toEqual(opener());
  });
});

describe('리프트 마감', () => {
  it('마감일이 지나면 사라진다', () => {
    let s = withRift(opener(), { id: 'T', deadlineDay: 2 });
    s = advanceDay(tables, s).state; // 2일: 아직 있음
    expect(s.rifts.some((r) => r.id === 'T')).toBe(true);
    const next = advanceDay(tables, s); // 3일: 사라짐
    expect(next.state.rifts.some((r) => r.id === 'T')).toBe(false);
    expect(next.events).toContainEqual({ type: 'riftExpired', riftId: 'T', name: '시험 균열' });
  });

  it('마감이 지난 리프트에는 보낼 수 없다', () => {
    const s = withRift(opener(), { id: 'T', deadlineDay: 0 });
    expect(() => dispatch(tables, s, 'T', guildParty(s, ['hero']))).toThrow(GameError);
  });

  it('마감 없는 리프트는 사라지지 않는다', () => {
    let s = withRift(opener(), { id: 'T', deadlineDay: null });
    for (let i = 0; i < 30; i++) s = advanceDay(tables, s).state;
    expect(s.rifts.some((r) => r.id === 'T')).toBe(true);
  });
});

describe('파견', () => {
  it('동시에 여러 파견을 보낼 수 있고 한 용병은 한 파견에만 간다', () => {
    let s = withRift(withRift(opener(), { id: 'A' }), { id: 'B', durationDays: 2 });
    s = dispatch(tables, s, 'A', guildParty(s, ['hero', 'm001']));
    expect(() => dispatch(tables, s, 'B', guildParty(s, ['m001']))).toThrow(/이미 파견/);
    s = dispatch(tables, s, 'B', guildParty(s, ['m002', 'm003']));
    expect(s.expeditions).toHaveLength(2);
    expect(isAvailable(s, 'hero')).toBe(false);
    expect(isAvailable(s, 'm004')).toBe(true);

    const d2 = advanceDay(tables, s);
    expect(d2.events.filter((e) => e.type === 'returned')).toHaveLength(1);
    expect(d2.state.expeditions.map((e) => e.rift.id)).toEqual(['B']);
    const d3 = advanceDay(tables, d2.state);
    expect(d3.state.expeditions).toHaveLength(0);
    expect(d3.state.reports.map((r) => r.rift.id)).toEqual(['A', 'B']);
  });

  it('길드 소속이 아닌 용병, 6인 파티는 보낼 수 없다', () => {
    const s = withRift(opener(), { id: 'A' });
    expect(() => dispatch(tables, s, 'A', [{ mercId: 'm005', row: 'back' }])).toThrow(/길드 소속/);
    const six = recruit(tables, { ...s, resources: { ...s.resources, zero: 99999 } }, 'm005');
    expect(() => dispatch(tables, six, 'A', guildParty(six, ['hero', 'm001', 'm002', 'm003', 'm004', 'm005']).concat({ mercId: 'm005', row: 'back' })),).toThrow();
  });
});

describe('정산', () => {
  it('승리하면 보상 전액과 경험치를 받는다', () => {
    let s = withRift(opener(), { id: 'A', reward: { zero: 100, arche: 20, materials: {} } });
    const before = s.resources;
    s = dispatch(tables, s, 'A', guildParty(s));
    const { state } = advanceDay(tables, s);
    const report = state.reports[0];
    expect(report.outcome).toBe('victory');
    expect(state.resources.zero).toBe(before.zero + 100);
    expect(state.resources.arche).toBe(before.arche + 20);
    for (const g of report.expGains) {
      const m = getMerc(state, g.mercId);
      expect(g.exp).toBe(Math.round(tables.progression.expByOutcome.victory * m.growth.speed));
      expect(m.exp).toBe(g.exp);
    }
    expect(report.events?.at(-1)).toMatchObject({ type: 'end', outcome: 'victory' });
  });

  it('패배하면 보상이 없고 쓰러진 용병이 부상을 입으며, 마감이 남은 리프트는 돌아온다', () => {
    let s = withRift(opener(), { id: 'A', enemies: strongEnemy(), deadlineDay: 10 });
    const zero = s.resources.zero;
    s = dispatch(tables, s, 'A', guildParty(s));
    const { state } = advanceDay(tables, s);
    const report = state.reports[0];
    expect(report.outcome).toBe('defeat');
    expect(state.resources.zero).toBe(zero);
    expect(report.injuries.length).toBe(report.party.length);
    for (const inj of report.injuries) {
      expect(getMerc(state, inj.unitId).injury?.recoverDay).toBe(state.day + inj.days + 1);
      expect(isAvailable(state, inj.unitId)).toBe(false);
    }
    expect(state.rifts.some((r) => r.id === 'A')).toBe(true);
  });

  it('항로를 이기면 마감 없는 안정화된 통로로 남고, 다시 공략하면 보상이 줄어든다', () => {
    let s = withRift(opener(), { id: 'R', tier: 'route', reward: { zero: 100, arche: 20, materials: {} } });
    s = dispatch(tables, s, 'R', guildParty(s));
    let r = advanceDay(tables, s);
    expect(r.state.reports[0].stabilized).toBe(true);
    expect(r.state.stabilizedRoutes.map((x) => x.riftId)).toEqual(['R']);
    const passage = r.state.rifts.find((x) => x.id === 'R')!;
    expect(passage.stable).toBe(true);
    expect(passage.deadlineDay).toBeNull();

    s = dispatch(tables, r.state, 'R', guildParty(r.state, ['hero', 'm001', 'm002', 'm003']));
    r = advanceDay(tables, s);
    const again = r.state.reports.at(-1)!;
    expect(again.outcome).toBe('victory');
    expect(again.stabilized).toBe(false);
    expect(again.reward.zero).toBe(100 * tables.progression.stablePassageRewardRatio);
    expect(r.state.rifts.some((x) => x.id === 'R')).toBe(true);
  });
});

describe('부상 회복', () => {
  it('복귀 당일은 세지 않고, 부상 일수만큼 온전한 날이 지나야 다시 파견할 수 있다', () => {
    // 1일에 복귀하며 2일 부상 → 2일·3일 파견 불가, 4일 회복
    let s = opener();
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm001' ? { ...m, injury: { severity: 'heavy', recoverDay: s.day + 2 + 1 } } : m)) };
    s = withRift(s, { id: 'A', deadlineDay: 20 });
    expect(() => dispatch(tables, s, 'A', guildParty(s, ['m001']))).toThrow(/부상/);
    s = advanceDay(tables, s).state; // 2일
    expect(isAvailable(s, 'm001')).toBe(false);
    s = advanceDay(tables, s).state; // 3일
    expect(isAvailable(s, 'm001')).toBe(false);
    const d = advanceDay(tables, s); // 4일
    expect(getMerc(d.state, 'm001').injury).toBeUndefined();
    expect(d.events).toContainEqual({ type: 'recovered', mercId: 'm001' });
    expect(isAvailable(d.state, 'm001')).toBe(true);
  });
});

describe('도시 간 이동', () => {
  it('다른 도시 리프트는 왕복 이동 일수만큼 복귀가 늦다', () => {
    let s = withRift(opener(), { id: 'NY', cityId: 'newyork', durationDays: 1, deadlineDay: 10 });
    s = withRift(s, { id: 'TK', cityId: 'tokyo', durationDays: 1, deadlineDay: 10 });
    s = dispatch(tables, s, 'NY', guildParty(s, ['hero', 'm001']));
    s = dispatch(tables, s, 'TK', guildParty(s, ['m002', 'm003']));
    const ny = s.expeditions.find((e) => e.rift.id === 'NY')!;
    const tk = s.expeditions.find((e) => e.rift.id === 'TK')!;
    expect(ny.travelDays).toBe(1);
    expect(ny.returnDay).toBe(s.day + 1 + 2);
    expect(tk.travelDays).toBe(0);
    expect(tk.returnDay).toBe(s.day + 1);
  });

  it('이동하는 동안 마감이 지나면 보낼 수 없다', () => {
    const s = withRift(opener(), { id: 'NY', cityId: 'newyork', deadlineDay: 1 });
    expect(() => dispatch(tables, s, 'NY', guildParty(s, ['hero']))).toThrow(/이동/);
  });
});

describe('육성과 영입', () => {
  it('경험치가 차면 아르케를 내고 레벨을 올린다', () => {
    let s = opener();
    const need = expToNextLevel(tables, 1);
    expect(() => levelUp(tables, s, 'hero')).toThrow(/경험치/);
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'hero' ? { ...m, exp: need + 5 } : m)) };
    const up = levelUp(tables, s, 'hero');
    expect(getMerc(up, 'hero').level).toBe(2);
    expect(getMerc(up, 'hero').exp).toBe(5);
    expect(up.resources.arche).toBeLessThan(s.resources.arche);
  });

  it('성장 한계에서는 더 오르지 않는다', () => {
    const s = opener();
    const capped = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm001' ? { ...m, level: m.growth.cap, exp: 99999 } : m)) };
    expect(() => levelUp(tables, capped, 'm001')).toThrow(/한계/);
  });

  it('성장 속도가 빠른 용병이 경험치를 더 받는다', () => {
    let s = withRift(opener(), { id: 'A' });
    s = dispatch(tables, s, 'A', guildParty(s, ['m002', 'm003'])); // 속도 1.2, 0.9
    const { state } = advanceDay(tables, s);
    const gain = Object.fromEntries(state.reports[0].expGains.map((g) => [g.mercId, g.exp]));
    expect(gain.m002).toBeGreaterThan(gain.m003);
  });

  it('무소속만 영입할 수 있고 제로를 쓴다', () => {
    const s = opener();
    const r = recruit(tables, s, 'm005');
    expect(getMerc(r, 'm005').affiliation).toEqual({ kind: 'guild' });
    expect(r.resources.zero).toBeLessThan(s.resources.zero);
    expect(() => recruit(tables, s, 'm008')).toThrow(/영입 대상/);
  });
});

describe('며칠 진행 시나리오', () => {
  /** 매일 파견 가능한 용병을 모아 가장 쉬운 리프트에 보내고 하루를 넘긴다. */
  function playDays(t: GameTables, start: GameState, days: number) {
    let s = start;
    const log: string[] = [];
    for (let d = 0; d < days; d++) {
      const free = s.mercenaries.filter((m) => m.affiliation.kind === 'guild' && isAvailable(s, m.id)).map((m) => m.id);
      const target = [...s.rifts].filter((r) => r.cityId === s.baseCityId).sort((a, b) => a.enemies[0].level - b.enemies[0].level)[0];
      if (free.length && target) s = dispatch(t, s, target.id, guildParty(s, free));
      for (const m of s.mercenaries) {
        while (m.affiliation.kind === 'guild') {
          try {
            s = levelUp(t, s, m.id);
          } catch {
            break;
          }
        }
      }
      const r = advanceDay(t, s);
      s = r.state;
      log.push(`${s.day}: ${r.events.map((e) => e.type).join(',')}`);
    }
    return { s, log };
  }

  it('20일을 진행해도 규칙이 깨지지 않고 결정적이다', () => {
    const a = playDays(tables, opener(), 20);
    const b = playDays(tables, opener(), 20);
    expect(a.s).toEqual(b.s);
    expect(a.s.day).toBe(21);
    expect(a.s.reports.length).toBeGreaterThan(3);
    expect(a.s.resources.zero).toBeGreaterThan(0);
    // 마감 지난 리프트가 남아 있지 않다
    for (const r of a.s.rifts) expect(r.deadlineDay === null || r.deadlineDay >= a.s.day).toBe(true);
    // 동시에 두 파견에 들어간 용병이 없다
    const ids = a.s.expeditions.flatMap((e) => e.party.map((p) => p.mercId));
    expect(new Set(ids).size).toBe(ids.length);
    // 성장 한계를 넘은 용병이 없다
    for (const m of a.s.mercenaries) expect(m.level).toBeLessThanOrEqual(m.growth.cap);
  });
});
