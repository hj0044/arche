import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { advanceDayWithAutosave } from '../app/session';
import { advanceDay, dispatch, newGame, type GameState } from '../engine/game';
import { IndexedDbSaveRepository } from './indexedDb';
import { MemorySaveRepository, type SaveRepository } from './repository';
import { createSaveFile, isLoadable, parseSave, SAVE_FORMAT, SAVE_VERSION, SaveFormatError, serializeSave } from './saveFile';
import { SaveService } from './saveService';
import { savePolicy, saveLimits } from '../data';

/** 며칠 진행하고 파견 중인 상태까지 들어간 게임 */
function playedState(): GameState {
  let s = newGame(tables, {
    seed: 'save-test',
    guildName: '저장 길드',
    baseCityId: 'seoul',
    protagonist: { name: '마스터' },
  });
  for (let i = 0; i < 3; i++) s = advanceDay(tables, s).state;
  const rift = s.rifts.find((r) => r.cityId === 'seoul')!;
  s = dispatch(tables, s, rift.id, [
    { mercId: 'm03', row: 'back' },
    { mercId: 'm01', row: 'front' },
  ]);
  return advanceDay(tables, s).state;
}

const at = (minute: number) => new Date(Date.UTC(2032, 0, 1, 0, minute));

const repos: [string, () => SaveRepository][] = [
  ['메모리', () => new MemorySaveRepository()],
  ['IndexedDB', () => new IndexedDbSaveRepository(new IDBFactory())],
];

describe('세이브 파일 형식', () => {
  it('형식 이름과 버전 번호가 붙는다', () => {
    const file = createSaveFile(playedState(), 'manual');
    expect(file.format).toBe(SAVE_FORMAT);
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.summary.guildName).toBe('저장 길드');
  });

  it('JSON 왕복 후 상태가 같고, 이어서 진행한 결과도 같다', () => {
    const s = playedState();
    const back = parseSave(serializeSave(createSaveFile(s, 'manual'))).state;
    expect(back).toEqual(s);
    expect(advanceDay(tables, back)).toEqual(advanceDay(tables, s));
  });

  it('잘못된 파일과 더 새로운 버전은 거부한다', () => {
    expect(() => parseSave('not json')).toThrow(SaveFormatError);
    expect(() => parseSave({ format: 'other', version: 1 })).toThrow(/Arche/);
    expect(() => parseSave({ format: SAVE_FORMAT })).toThrow(/버전/);
    expect(() => parseSave({ format: SAVE_FORMAT, version: SAVE_VERSION + 1, state: {} })).toThrow(/새로운/);
    expect(() => parseSave({ format: SAVE_FORMAT, version: SAVE_VERSION, state: { day: 1 } })).toThrow(/손상/);
  });

  it('현재 버전이 아닌 옛 세이브는 마이그레이션 없이 "지원하지 않는 세이브"로 거절한다', () => {
    for (let v = 1; v < SAVE_VERSION; v++) {
      const old = { ...createSaveFile(playedState(), 'manual'), version: v };
      expect(() => parseSave(old)).toThrow(/지원하지 않는 세이브/);
      expect(isLoadable(old)).toBe(false);
    }
    expect(isLoadable(createSaveFile(playedState(), 'auto'))).toBe(true);
  });
});

describe.each(repos)('세이브 서비스 (%s 저장소)', (_name, makeRepo) => {
  it('수동 저장과 불러오기 왕복에서 상태가 같다', async () => {
    const svc = new SaveService(makeRepo());
    const s = playedState();
    expect(await svc.saveManual('A', s)).toEqual({ status: 'saved' });
    expect(await svc.loadManual('A')).toEqual(s);
  });

  it('이미 저장이 있으면 확인을 요구하고, 확인하면 덮어쓴다', async () => {
    const svc = new SaveService(makeRepo());
    const s1 = playedState();
    const s2 = advanceDay(tables, s1).state;
    await svc.saveManual('A', s1);
    const res = await svc.saveManual('A', s2);
    expect(res.status).toBe('needsConfirm');
    if (res.status === 'needsConfirm') expect(res.existing.summary.day).toBe(s1.day);
    expect((await svc.loadManual('A'))?.day).toBe(s1.day);
    await svc.saveManual('A', s2, { overwrite: true });
    expect((await svc.loadManual('A'))?.day).toBe(s2.day);
  });

  it('수동 저장 슬롯은 개수 제한이 없고 서로 독립이다', async () => {
    const svc = new SaveService(makeRepo());
    const s = playedState();
    for (let i = 0; i < 25; i++) await svc.saveManual(`S${i}`, { ...s, guildName: `길드${i}` }, { now: at(i) });
    const slots = await svc.listSlots();
    expect(slots).toHaveLength(25);
    expect(slots[0].slotId).toBe('S24'); // 최근 저장이 먼저
    expect((await svc.loadManual('S7'))?.guildName).toBe('길드7');
  });

  it('자동 저장은 슬롯별로 최근 3개만 돌려 쓴다', async () => {
    const svc = new SaveService(makeRepo());
    let s = playedState();
    const days: number[] = [];
    for (let i = 0; i < 5; i++) {
      await svc.saveAuto('A', s, at(i));
      days.push(s.day);
      s = advanceDay(tables, s).state;
    }
    await svc.saveAuto('B', s, at(10));
    const slots = await svc.listSlots();
    const a = slots.find((x) => x.slotId === 'A')!;
    expect(a.autos).toHaveLength(savePolicy.autoSavesPerSlot);
    expect(a.autos.map((f) => f.summary.day)).toEqual(days.slice(-3).reverse());
    expect(slots.find((x) => x.slotId === 'B')!.autos).toHaveLength(1);
    expect((await svc.loadAuto('A', 0))?.day).toBe(days[4]);
    expect((await svc.loadAuto('A', 2))?.day).toBe(days[2]);
  });

  it('하루를 넘길 때 자동 저장한다', async () => {
    const svc = new SaveService(makeRepo());
    const s = playedState();
    const next = await advanceDayWithAutosave(tables, svc, 'A', s);
    expect(next.state.day).toBe(s.day + 1);
    expect(await svc.loadAuto('A')).toEqual(next.state);
  });

  it('파일로 내보내고 불러오면 새 슬롯에 같은 상태가 들어간다', async () => {
    const svc = new SaveService(makeRepo());
    const s = playedState();
    const text = svc.exportState(s);
    expect(JSON.parse(text).version).toBe(SAVE_VERSION);
    const { slotId, state } = await svc.importFile(text, 'imported');
    expect(slotId).toBe('imported');
    expect(state).toEqual(s);
    expect(await svc.loadManual('imported')).toEqual(s);
  });

  it('슬롯을 지우면 수동·자동 저장이 모두 사라진다', async () => {
    const svc = new SaveService(makeRepo());
    const s = playedState();
    await svc.saveManual('A', s);
    await svc.saveAuto('A', s);
    await svc.saveManual('B', s);
    await svc.deleteSlot('A');
    expect((await svc.listSlots()).map((x) => x.slotId)).toEqual(['B']);
  });
});

describe('세이브 v6(리프트 영역 세력)', () => {
  it('새 버전으로 저장하고 불러오면 의미 검증을 통과하고 영역 세력이 그대로다', () => {
    const s = playedState();
    const up = parseSave(serializeSave(createSaveFile(s, 'manual')), { ...tables, limits: saveLimits });
    expect(up.state.rifts.map((r) => r.territoryFactionId)).toEqual(s.rifts.map((r) => r.territoryFactionId));
    expect(up.state.rifts.some((r) => r.territoryFactionId !== null)).toBe(true);
  });

  it('없는 세력 id는 의미 검증에서 막는다', () => {
    const cur = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    cur.state.rifts[0].territoryFactionId = 'nope';
    expect(() => parseSave(cur, { ...tables, limits: saveLimits })).toThrow(SaveFormatError);
  });
});

describe('세이브 v15(지시서 026c, AGENTS.md: 마이그레이션 없음)', () => {
  it('버전은 15이고 v14 세이브는 지원하지 않는 세이브로 거절한다', () => {
    expect(SAVE_VERSION).toBe(15);
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(() => parseSave(JSON.stringify({ ...file, version: 14 }))).toThrow(/지원하지 않는 세이브/);
  });
  it('삭제한 세력 id(웨이포인트·옛 무소속 행)가 들어 있는 세이브는 의미 검증에서 거절한다', () => {
    const s = playedState();
    for (const bad of ['way' + 'point', 'fr' + 'ee']) {
      const c = structuredClone(s);
      c.mercenaries.find((m) => m.affiliation.kind === 'unaffiliated')!.affiliation = { kind: 'faction', factionId: bad };
      expect(() => parseSave(serializeSave(createSaveFile(c, 'manual')), { ...tables, limits: saveLimits })).toThrow(/세력/);
    }
  });
  it('무소속 계약자(affiliation.kind unaffiliated)를 저장하고 불러올 수 있다', () => {
    const s = playedState();
    expect(s.mercenaries.filter((m) => m.affiliation.kind === 'unaffiliated')).toHaveLength(10); // 026d 재배분
    const back = parseSave(serializeSave(createSaveFile(s, 'manual')), { ...tables, limits: saveLimits });
    expect(back.state).toEqual(s);
  });
});

describe('세이브 v14(지시서 028a, AGENTS.md: 마이그레이션 없음)', () => {
  it('v13 세이브는 지원하지 않는 세이브로 거절한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(() => parseSave(JSON.stringify({ ...file, version: 13 }))).toThrow(/지원하지 않는 세이브/);
  });
  it('리그 상태(시즌 정산 뒤 이력 포함)를 저장하고 불러오면 그대로 돌아오고 의미 검증을 통과한다', async () => {
    const { settleSeason } = await import('../engine/league/league');
    const s = playedState();
    settleSeason(tables, s.league);
    expect(s.league.history).toHaveLength(1);
    const raw = serializeSave(createSaveFile(s, 'manual'));
    const back = parseSave(raw, { ...tables, limits: saveLimits });
    expect(back.state).toEqual(s);
  });
  it('리그 무결성: 등급 팀 수·규모 인원·이름 중복이 어긋나면 거절한다', () => {
    const s = playedState();
    const bad = (f: (lg: GameState['league']) => void) => {
      const c = structuredClone(s);
      f(c.league);
      return () => parseSave(serializeSave(createSaveFile(c, 'manual')), { ...tables, limits: saveLimits });
    };
    expect(bad((lg) => (lg.teams[0].tier = lg.teams[0].tier === 'mijin' ? 'gyeokjin' : 'mijin'))).toThrow(/팀 수/);
    expect(bad((lg) => (lg.members = lg.members.filter((m) => m.teamId !== lg.teams[0].id)))).toThrow(/인원/);
    expect(bad((lg) => (lg.members[1].name = lg.members[0].name))).toThrow(/이름 중복/);
    expect(bad(() => {})).not.toThrow();
  });
});

describe('세이브 v13(지시서 027, AGENTS.md: 마이그레이션 없음)', () => {
  /** 파견에서 돌아와 활약도 기록이 생길 때까지 진행 */
  const withActivity = (): GameState => {
    let s = playedState();
    for (let i = 0; i < 6 && !s.mercenaries.some((m) => m.activity); i++) s = advanceDay(tables, s).state;
    return s;
  };
  it('v12 세이브는 지원하지 않는 세이브로 거절한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(() => parseSave(JSON.stringify({ ...file, version: 12 }))).toThrow(/지원하지 않는 세이브/);
  });
  it('활약도 기록을 저장하고 불러오면 그대로 돌아오고 의미 검증을 통과한다', () => {
    const s = withActivity();
    const m = s.mercenaries.find((x) => x.activity)!;
    expect(m.activity!.career.sorties).toBeGreaterThan(0);
    const back = parseSave(serializeSave(createSaveFile(s, 'manual')), { ...tables, limits: saveLimits });
    expect(back.state).toEqual(s);
  });
  it('무결성: 시즌 합계가 통산을 넘거나, 클리어가 출전보다 많거나, 없는 항목 id면 거절한다', () => {
    const s = withActivity();
    const id = s.mercenaries.find((x) => x.activity)!.id;
    const bad = (f: (a: NonNullable<GameState['mercenaries'][number]['activity']>) => void) => {
      const c = structuredClone(s);
      f(c.mercenaries.find((x) => x.id === id)!.activity!);
      return () => parseSave(serializeSave(createSaveFile(c, 'manual')), { ...tables, limits: saveLimits });
    };
    expect(bad((a) => (a.season.items.damage = a.career.items.damage + 1))).toThrow(/통산/);
    expect(bad((a) => (a.career.clears = a.career.sorties + 1))).toThrow(/출전/);
    expect(bad((a) => (a.career.items.bogus = 1))).toThrow(/활약도 항목/);
    expect(bad((a) => (a.season.no = 99))).toThrow(/시즌/);
    expect(bad(() => {})).not.toThrow();
  });
});

describe('세이브 v12(지시서 026, AGENTS.md: 마이그레이션 없음)', () => {
  it('v11 세이브(삭제한 세력 id가 있는 세이브 포함)는 지원하지 않는 세이브로 거절한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(() => parseSave(JSON.stringify({ ...file, version: 11 }))).toThrow(/지원하지 않는 세이브/);
    const old = { ...file, version: 11, state: { ...file.state, mercenaries: file.state.mercenaries.map((m: { id: string }) => (m.id === 'm16' ? { ...m, affiliation: { kind: 'faction', factionId: 'dokk' + 'aebi' } } : m)) } };
    expect(() => parseSave(JSON.stringify(old))).toThrow(/지원하지 않는 세이브/);
  });
  it('v12 세이브에서 없는 세력 id는 의미 검증에서 거절한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    const bad = { ...file, state: { ...file.state, mercenaries: file.state.mercenaries.map((m: { id: string }) => (m.id === 'm16' ? { ...m, affiliation: { kind: 'faction', factionId: 'dokk' + 'aebi' } } : m)) } };
    expect(() => parseSave(JSON.stringify(bad), { ...tables, limits: saveLimits })).toThrow(SaveFormatError);
    expect(parseSave(JSON.stringify(file), { ...tables, limits: saveLimits }).state.mercenaries.find((m) => m.id === 'm16')!.affiliation).toEqual({ kind: 'faction', factionId: 'indie' });
  });
});

describe('세이브 v11(지시서 022, AGENTS.md: 마이그레이션 없음)', () => {
  it('v10 세이브(주인공이 있던 세이브 포함)는 지원하지 않는 세이브로 거절한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(() => parseSave(JSON.stringify({ ...file, version: 10 }))).toThrow(/지원하지 않는 세이브/);
    const withHero = { ...file, version: 10, state: { ...file.state, protagonist: { mode: 'opener', name: 'p', background: 'survivor', mercId: 'hero' } } };
    expect(() => parseSave(JSON.stringify(withHero))).toThrow(/지원하지 않는 세이브/);
  });
  it('protagonist는 이름·배경만 저장한다', () => {
    const file = JSON.parse(serializeSave(createSaveFile(playedState(), 'manual')));
    expect(Object.keys(file.state.protagonist).sort()).toEqual(['background', 'name']);
  });
  it('저장하고 불러오면 그대로 돌아오고 성장 속도 필드가 없다', () => {
    const s = playedState();
    const raw = serializeSave(createSaveFile(s, 'manual'));
    expect(raw).not.toMatch(/"speed"/);
    const back = parseSave(raw, { ...tables, limits: saveLimits });
    expect(back.state).toEqual(s);
    for (const m of back.state.mercenaries) expect(Object.keys(m.growth)).toEqual(['cap']);
  });
});

describe('세이브 v8(특성 단계)', () => {
  it('traitRanks를 저장하고 불러오면 그대로 돌아오고 의미 검증을 통과한다', () => {
    const s = playedState();
    const withRanks = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm01' ? { ...m, traitRanks: { sturdy: 1 } } : m)) };
    const up = parseSave(serializeSave(createSaveFile(withRanks, 'manual')), { ...tables, limits: saveLimits });
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(8);
    expect(up.state.mercenaries.find((m) => m.id === 'm01')?.traitRanks).toEqual({ sturdy: 1 });
  });
  it('없는 특성이나 범위 밖 단계는 거절한다', () => {
    const s = playedState();
    const bad = (traitRanks: Record<string, number>) =>
      serializeSave(createSaveFile({ ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm01' ? { ...m, traitRanks } : m)) }, 'manual'));
    expect(() => parseSave(bad({ nope: 1 }), { ...tables, limits: saveLimits })).toThrow(SaveFormatError);
    expect(() => parseSave(bad({ sturdy: 9 }), { ...tables, limits: saveLimits })).toThrow(SaveFormatError);
  });
});
