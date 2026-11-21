// 지시서 014: Codex 3차 검수(충성도·거점 시설) 반영 테스트
import { describe, expect, it } from 'vitest';
import { saveLimits, tables, type GameTables } from '../data';
import { createSaveFile, parseSave, serializeSave } from '../storage/saveFile';
import { initialFacilities, visibleRift } from './facilities';
import { advanceDay, assignToFacility, dispatch, getMerc, newGame, upkeepPerDay, type GameState } from './game';
import { loyaltyDelta } from './loyalty';
import { generateRift, type Rift } from './rift';
import { createRng } from './rng';

const gm = (seed = 'r014') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'gm', background: 'heir' } });
const guildIds = (s: GameState) => s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => m.id);
const withZero = (s: GameState, zero: number): GameState => ({ ...s, resources: { ...s.resources, zero } });
const setLoyaltyValue = (s: GameState, values: Record<string, number>): GameState => ({
  ...s,
  mercenaries: s.mercenaries.map((m) => (values[m.id] !== undefined ? { ...m, loyalty: { ...m.loyalty!, value: values[m.id] } } : m)),
});
const reasonsOn = (s: GameState, id: string) => getMerc(s, id).loyalty!.recent.filter((r) => r.day === s.day).map((r) => r.reason);
const easyRift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  deadlineDay: 30,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  territoryFactionId: null,
  ...patch,
});

describe('훈련과 미납이 같은 날', () => {
  it('훈련 경험치는 받고, 충성도는 미납만큼 깎인다(훈련은 휴식 감쇠만 막는다)', () => {
    let s = gm();
    s = { ...s, facilities: { ...s.facilities, levels: { ...s.facilities.levels, training: 1 } } };
    const id = guildIds(s)[0];
    s = assignToFacility(tables, s, 'training', id);
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, loyalty: { ...m.loyalty!, restStreak: 7 } } : m)) };
    const before = getMerc(s, id);
    const { state, events } = advanceDay(tables, withZero(s, 0));
    const after = getMerc(state, id);
    expect(events).toContainEqual(expect.objectContaining({ type: 'trained', mercId: id }));
    expect(after.exp).toBeGreaterThan(before.exp);
    expect(reasonsOn(state, id)).toEqual(['unpaidDay']);
    expect(after.loyalty!.value).toBeCloseTo(before.loyalty!.value + loyaltyDelta(tables, before.profile.background, 'unpaidDay'));
    expect(after.loyalty!.restStreak).toBe(0);
  });
});

describe('유지비 납부 순서', () => {
  it('돈이 모자라면 충성도가 낮은 용병부터 낸다', () => {
    const base = gm();
    // id 순과 반대로 충성도를 줘서 배열 순서와 다르게 만든다: 마지막 id가 가장 낮다.
    const ids = [...guildIds(base)].sort();
    const values = Object.fromEntries(ids.map((id, i) => [id, 80 - i * 10]));
    let s = setLoyaltyValue(base, values);
    const lowest = ids.at(-1)!;
    s = withZero(s, upkeepPerDay(tables, getMerc(s, lowest)));
    const ev = advanceDay(tables, s).events.find((e) => e.type === 'upkeep');
    if (ev?.type !== 'upkeep') throw new Error('유지비 이벤트 없음');
    expect(ev.unpaidMercIds).not.toContain(lowest);
    // 못 낸 용병도 낮은 충성도 순으로 기록된다
    expect(ev.unpaidMercIds).toEqual(ids.slice(0, -1).reverse());
  });

  it('충성도가 같으면 id 순으로 낸다', () => {
    const base = gm();
    const ids = [...guildIds(base)].sort();
    let s = setLoyaltyValue(base, Object.fromEntries(ids.map((id) => [id, 50])));
    s = withZero(s, upkeepPerDay(tables, getMerc(s, ids[0])));
    const ev = advanceDay(tables, s).events.find((e) => e.type === 'upkeep');
    if (ev?.type !== 'upkeep') throw new Error('유지비 이벤트 없음');
    expect(ev.unpaidMercIds).not.toContain(ids[0]);
    expect(ev.unpaidMercIds).toEqual(ids.slice(1));
  });

  it('그날 복귀 보상으로 유지비를 낼 수 있으면 미납이 생기지 않는다', () => {
    let s = withZero(gm(), 0);
    s = { ...s, rifts: [easyRift('E')] };
    s = dispatch(tables, s, 'E', guildIds(s).map((id) => ({ mercId: id, row: 'front' as const })));
    const { state, events } = advanceDay(tables, s);
    expect(state.reports.at(-1)?.outcome).toBe('victory');
    const ev = events.find((e) => e.type === 'upkeep');
    expect(ev).toMatchObject({ type: 'upkeep', unpaid: 0, unpaidMercIds: [] });
    // 보상이 유지비보다 먼저 들어오므로 이벤트 순서도 복귀 → 유지비
    expect(events.findIndex((e) => e.type === 'returned')).toBeLessThan(events.findIndex((e) => e.type === 'upkeep'));
    for (const id of guildIds(state)) expect(getMerc(state, id).unpaidUpkeep).toBeUndefined();
  });
});

describe('철수와 충성도', () => {
  it('철수에는 승리·패배 변동이 붙지 않는다', () => {
    // 1라운드로 끝나게 해 양쪽이 살아 있으면 철수가 된다.
    const t: GameTables = { ...tables, combat: { ...tables.combat, maxRounds: 1 } };
    let s = withZero(gm(), 99999);
    s = { ...s, rifts: [easyRift('R', { enemies: [{ monsterId: 'void_hound', grade: 'mid', level: 25, row: 'front' }] })] };
    const party = guildIds(s);
    s = dispatch(t, s, 'R', party.map((id) => ({ mercId: id, row: 'front' as const })));
    const { state } = advanceDay(t, s);
    expect(state.reports.at(-1)?.outcome).toBe('retreat');
    for (const id of party) {
      const r = reasonsOn(state, id);
      expect(r).not.toContain('victory');
      expect(r).not.toContain('defeat');
    }
  });
});

describe('세이브 의미 검증: 진행 중 공사 일정', () => {
  const semantic = { ...tables, limits: saveLimits };
  const withJob = (startDay: number, completeDay: number) => {
    const s = withZero(gm(), 1000);
    return serializeSave(createSaveFile({ ...s, facilities: { ...s.facilities, construction: { facilityId: 'infirmary', targetLevel: 1, startDay, completeDay } } }, 'manual'));
  };
  it('미래에 시작하는 공사는 불러오기에서 거절된다', () => {
    expect(() => parseSave(withJob(30, 31), semantic)).toThrow(/미래에 시작한 공사/);
  });
  it('이미 끝났어야 할 공사도 거절된다', () => {
    expect(() => parseSave(withJob(1, 1), semantic)).toThrow(/이미 끝났어야 할 공사/);
  });
  it('정상 플레이로 시작한 공사는 진행 중 매일 통과한다', () => {
    let s = withZero(gm(), 1000);
    s = { ...s, facilities: initialFacilities(tables) };
    const start = s.day;
    s = { ...s, facilities: { ...s.facilities, construction: { facilityId: 'infirmary', targetLevel: 1, startDay: start, completeDay: start + 2 } } };
    for (let i = 0; i < 4; i++) {
      expect(() => parseSave(serializeSave(createSaveFile(s, 'auto')), semantic)).not.toThrow();
      s = advanceDay(tables, s).state;
    }
    expect(s.facilities.construction).toBeNull();
  });
});

describe('탐지소 Lv1 마감 범위(폭 2일, 코드 그대로)', () => {
  it('어떤 리프트든 실제 마감이 보이는 범위 안에 있고 폭은 데이터 값이다', () => {
    const fs = initialFacilities(tables); // 탐지소 Lv1
    for (const city of tables.cities) {
      for (let i = 0; i < 200; i++) {
        const r = generateRift(tables, city.id, 1 + (i % 9), `d${i}`, createRng(`dl:${city.id}:${i}`));
        const v = visibleRift(tables, fs, r).deadline!;
        expect(v[1] - v[0]).toBe(tables.facilities.fog.deadlineWidth);
        expect(r.deadlineDay!).toBeGreaterThanOrEqual(v[0]);
        expect(r.deadlineDay!).toBeLessThanOrEqual(v[1]);
      }
    }
  });
});
