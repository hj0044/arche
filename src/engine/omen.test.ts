import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { MemorySaveRepository } from '../storage/repository';
import { createSaveFile, parseSave, serializeSave } from '../storage/saveFile';
import { SaveService } from '../storage/saveService';
import { advanceDay, dispatch, newGame, type GameState } from './game';
import { generateRift, type Rift } from './rift';
import { createRng } from './rng';

const make = (tier: string, seed: string, t: GameTables = tables, id = 'r1'): Rift =>
  generateRift(t, 'newyork', 1, id, createRng(seed), { tier });

const withOmenChance = (chance: number): GameTables => ({
  ...tables,
  riftTiers: tables.riftTiers.map((r) => ({ ...r, omenChance: chance })),
});

function start(): GameState {
  return newGame(tables, {
    seed: 'omen',
    guildName: '징조 길드',
    baseCityId: 'newyork',
    protagonist: { mode: 'guildMaster', name: 'gm', background: 'heir' },
  });
}

describe('징조 표식 데이터', () => {
  it('표식 확률은 리프트 등급 데이터에 있다(균열 0, 관문 0, 항로 1)', () => {
    const chance = Object.fromEntries(tables.riftTiers.map((r) => [r.id, r.omenChance]));
    expect(chance).toEqual({ crack: 0, gate: 0, route: 1 });
  });

  it('문구는 3~4개이고 화면 규칙상 "공허" 대신 표기명을 쓴다', () => {
    expect(tables.omens.length).toBeGreaterThanOrEqual(3);
    expect(tables.omens.length).toBeLessThanOrEqual(4);
    for (const o of tables.omens) expect(o.text).not.toMatch(/공허/);
  });
});

describe('징조 표식 생성', () => {
  it('같은 시드와 입력이면 같은 리프트에 같은 표식과 문구가 붙는다', () => {
    expect(make('route', 's1')).toEqual(make('route', 's1'));
    expect(start()).toEqual(start());
    const texts = new Set(Array.from({ length: 40 }, (_, i) => make('route', `s${i}`).omen?.textId));
    expect(texts.size).toBeGreaterThan(1); // 리프트마다 시드로 문구를 고른다
  });

  it('항로에만 붙고 균열과 관문에는 붙지 않는다', () => {
    for (let i = 0; i < 100; i++) {
      expect(make('crack', `c${i}`).omen).toBeUndefined();
      expect(make('gate', `g${i}`).omen).toBeUndefined();
      const route = make('route', `r${i}`);
      expect(route.omen).toBeDefined();
      expect(tables.omens.some((o) => o.id === route.omen!.textId)).toBe(true);
    }
  });

  it('표식 확률을 바꿔도 리프트의 나머지 내용은 같다', () => {
    for (const tier of ['crack', 'gate', 'route']) {
      const off = make(tier, 'same', withOmenChance(0));
      const on = make(tier, 'same', withOmenChance(1));
      expect(off.omen).toBeUndefined();
      expect(on.omen).toBeDefined();
      const { omen: _omen, ...rest } = on;
      expect(rest).toEqual(off);
    }
  });

  it('하루가 지나며 새로 열리는 항로에도 표식이 붙는다', () => {
    let s = start();
    for (let i = 0; i < 60; i++) s = advanceDay(tables, s).state;
    const all = [...s.rifts, ...s.reports.map((r) => r.rift)];
    expect(all.some((r) => r.tier === 'route')).toBe(true);
    for (const r of all) expect(Boolean(r.omen)).toBe(r.tier === 'route');
  });
});

describe('징조 표식과 규칙', () => {
  const routeRift = (omen: boolean): Rift => ({
    id: 'R',
    cityId: 'newyork',
    tier: 'route',
    name: '시험 항로',
    appearedDay: 1,
    fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
    deadlineDay: 20,
    durationDays: 1,
    enemies: [
      { monsterId: 'devourer', grade: 'high', level: 30, row: 'front' },
      { monsterId: 'rift_caller', grade: 'high', level: 30, row: 'back' },
    ],
    reward: { zero: 500, arche: 80, materials: { earth_parts: 2 } },
    ...(omen ? { omen: { textId: tables.omens[0].id } } : {}),
  });

  /** 같은 시드에서 표식 유무만 다른 두 판을 정산까지 돌린다. */
  const settle = (omen: boolean) => {
    let s = start();
    s = { ...s, rifts: [routeRift(omen)], mercenaries: s.mercenaries.map((m) => (m.affiliation.kind === 'guild' ? { ...m, level: 32 } : m)) };
    const party = s.mercenaries
      .filter((m) => m.affiliation.kind === 'guild')
      .map((m) => ({ mercId: m.id, row: tables.roles.find((r) => r.id === m.role)!.defaultRow }));
    s = dispatch(tables, s, 'R', party);
    return advanceDay(tables, s).state;
  };

  it('같은 시드에서 표식 유무만 달라도 전투 결과와 보상이 같다', () => {
    const plain = settle(false);
    const marked = settle(true);
    const strip = (r: GameState['reports'][number]) => ({ ...r, rift: { ...r.rift, omen: undefined } });
    expect(marked.reports[0].rift.omen).toBeDefined();
    expect(strip(marked.reports[0])).toEqual(strip(plain.reports[0]));
    expect(marked.resources).toEqual(plain.resources);
    expect(marked.mercenaries).toEqual(plain.mercenaries);
  });

  it('항로를 이겨 안정화된 통로가 되어도 표식은 남는다', () => {
    const s = settle(true);
    expect(s.reports[0].outcome).toBe('victory');
    expect(s.rifts.find((r) => r.id === 'R')).toMatchObject({ stable: true, omen: { textId: tables.omens[0].id } });
  });
});

describe('징조 표식과 세이브', () => {
  it('저장과 불러오기 후에도 표식과 문구 id가 유지된다', async () => {
    const s = start();
    const marked = { ...s, rifts: [...s.rifts, make('route', 'save', tables, 'r-omen')] };
    const back = parseSave(serializeSave(createSaveFile(marked, 'manual'))).state;
    expect(back.rifts.at(-1)!.omen).toEqual(marked.rifts.at(-1)!.omen);

    const svc = new SaveService(new MemorySaveRepository());
    await svc.saveManual('A', marked);
    expect((await svc.loadManual('A'))!.rifts.at(-1)!.omen).toEqual(marked.rifts.at(-1)!.omen);
  });

  it('표식 필드가 없는 리프트는 표식 없음으로 읽는다', () => {
    const file = createSaveFile(start(), 'manual');
    const raw = JSON.parse(serializeSave(file));
    for (const r of raw.state.rifts) delete r.omen;
    const back = parseSave(raw).state;
    expect(back.rifts.every((r) => r.omen === undefined)).toBe(true);
  });
});
