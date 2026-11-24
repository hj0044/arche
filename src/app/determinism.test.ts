import { describe, expect, it } from 'vitest';

import { legacyTables as tables } from '../testing/legacyTables';
import { advanceDay, dispatch, newGame, type GameState, type PartyMember } from '../engine/game';
import { createSaveFile, parseSave, serializeSave } from '../storage/saveFile';

/**
 * 결정성 회귀: 고정 시드 새 게임에서 리프트 하나를 파견한 상태를 복제해,
 * 한쪽은 메모리 상태 그대로, 다른 쪽은 저장 형식으로 직렬화했다가 다시 읽은 상태로 10일 진행한다.
 * 매일 상태와 이벤트가 깊게 같아야 한다.
 */
function start(party: PartyMember[]): GameState {
  const s = newGame(tables, {
    seed: 'audit-20261120',
    guildName: '검수 길드',
    baseCityId: 'seoul',
    protagonist: { name: '검수자' },
  });
  return dispatch(tables, s, 'r1', party);
}

describe.each([
  ['4인 파티', [{ mercId: 'm01', row: 'front' }, { mercId: 'm02', row: 'back' }, { mercId: 'm03', row: 'back' }, { mercId: 'm04', row: 'back' }]],
  ['3인 파티', [{ mercId: 'm02', row: 'back' }, { mercId: 'm03', row: 'back' }, { mercId: 'm04', row: 'back' }]],
] as [string, PartyMember[]][])('결정성 회귀(%s)', (_label, party) => {
  it('메모리 상태와 저장 왕복 상태를 10일 진행하면 매일 상태·이벤트가 같다', () => {
    const origin = start(party);
    let memory = structuredClone(origin);
    let loaded = parseSave(serializeSave(createSaveFile(origin, 'manual'))).state;
    expect(loaded).toEqual(memory);
    for (let day = 0; day < 10; day++) {
      const a = advanceDay(tables, memory);
      const b = advanceDay(tables, loaded);
      expect(b.events).toEqual(a.events);
      expect(b.state).toEqual(a.state);
      memory = a.state;
      loaded = b.state;
    }
    expect(memory.reports.length).toBeGreaterThan(0);
  });
});

describe('결정성 회귀(충성도: 미납·거부·이탈이 일어나는 길드)', () => {
  it('저장 왕복 상태와 메모리 상태를 20일 진행하면 충성도·거부·이탈까지 매일 같다', () => {
    let origin = start([{ mercId: 'm02', row: 'back' }, { mercId: 'm03', row: 'back' }]);
    origin = {
      ...origin,
      resources: { zero: 0, arche: 0, materials: {} },
      mercenaries: origin.mercenaries.map((m) => (m.loyalty ? { ...m, loyalty: { ...m.loyalty, value: 12 } } : m)),
    };
    let memory = structuredClone(origin);
    let loaded = parseSave(serializeSave(createSaveFile(origin, 'manual'))).state;
    const kinds = new Set<string>();
    for (let day = 0; day < 20; day++) {
      const a = advanceDay(tables, memory);
      const b = advanceDay(tables, loaded);
      expect(b.events).toEqual(a.events);
      expect(b.state).toEqual(a.state);
      for (const e of a.events) kinds.add(e.type);
      memory = a.state;
      // 하루마다 저장 형식으로 다시 왕복한다
      loaded = parseSave(serializeSave(createSaveFile(b.state, 'auto'))).state;
    }
    expect(kinds.has('refused')).toBe(true);
    expect(kinds.has('departed')).toBe(true);
  });
});

describe('결정성 회귀(대기 하락·무소속 이동)', () => {
  it('대기 하락과 이동이 일어나는 길드를 15일 동안 매일 저장 왕복해도 상태·이벤트가 같다', () => {
    const t = { ...tables, poaching: { ...tables.poaching, dailyChance: 0.2 } };
    let origin = start([{ mercId: 'm02', row: 'back' }]);
    origin = {
      ...origin,
      resources: { ...origin.resources, zero: 99999 },
      mercenaries: origin.mercenaries.map((m) => (m.loyalty ? { ...m, loyalty: { ...m.loyalty, restStreak: 6 } } : m)),
    };
    let memory = structuredClone(origin);
    let loaded = parseSave(serializeSave(createSaveFile(origin, 'manual'))).state;
    const kinds = new Set<string>();
    const reasons = new Set<string>();
    for (let day = 0; day < 15; day++) {
      const a = advanceDay(t, memory);
      const b = advanceDay(t, loaded);
      expect(b.events).toEqual(a.events);
      expect(b.state).toEqual(a.state);
      for (const e of a.events) kinds.add(e.type);
      for (const m of a.state.mercenaries) for (const r of m.loyalty?.recent ?? []) reasons.add(r.reason);
      memory = a.state;
      loaded = parseSave(serializeSave(createSaveFile(b.state, 'auto'))).state;
    }
    expect(kinds.has('poached')).toBe(true);
    expect(reasons.has('idleDecay')).toBe(true);
  });
});

describe('결정성 회귀(거점 시설: 건설 진행과 훈련 배치)', () => {
  it('건설 진행과 훈련 배치가 있는 길드를 15일 동안 매일 저장 왕복해도 상태·이벤트가 같다', async () => {
    const { startConstruction, assignToFacility } = await import('../engine/game');
    let origin = start([{ mercId: 'm01', row: 'front' }]);
    origin = { ...origin, resources: { ...origin.resources, zero: 5000 }, facilities: { ...origin.facilities, levels: { ...origin.facilities.levels, training: 2 } } };
    origin = startConstruction(tables, origin, 'infirmary');
    origin = assignToFacility(tables, assignToFacility(tables, origin, 'training', 'm02'), 'training', 'm03');
    let memory = structuredClone(origin);
    let loaded = parseSave(serializeSave(createSaveFile(origin, 'manual'))).state;
    const kinds = new Set<string>();
    for (let day = 0; day < 15; day++) {
      const a = advanceDay(tables, memory);
      const b = advanceDay(tables, loaded);
      expect(b.events).toEqual(a.events);
      expect(b.state).toEqual(a.state);
      for (const e of a.events) kinds.add(e.type);
      memory = a.state;
      loaded = parseSave(serializeSave(createSaveFile(b.state, 'auto'))).state;
    }
    expect(kinds.has('facilityBuilt')).toBe(true);
    expect(kinds.has('trained')).toBe(true);
  });
});
