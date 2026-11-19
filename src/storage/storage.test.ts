import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { advanceDayWithAutosave } from '../app/session';
import { advanceDay, dispatch, newGame, type GameState } from '../engine/game';
import { IndexedDbSaveRepository } from './indexedDb';
import { MemorySaveRepository, type SaveRepository } from './repository';
import { createSaveFile, parseSave, SAVE_FORMAT, SAVE_VERSION, SaveFormatError, serializeSave } from './saveFile';
import { AUTO_SAVES_PER_SLOT, SaveService } from './saveService';

/** 며칠 진행하고 파견 중인 상태까지 들어간 게임 */
function playedState(): GameState {
  let s = newGame(tables, {
    seed: 'save-test',
    guildName: '저장 길드',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: '주인공', element: 'light', role: 'healer', background: 'researcher' },
  });
  for (let i = 0; i < 3; i++) s = advanceDay(tables, s).state;
  const rift = s.rifts.find((r) => r.cityId === 'seoul')!;
  s = dispatch(tables, s, rift.id, [
    { mercId: 'hero', row: 'back' },
    { mercId: 'm001', row: 'front' },
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
    expect(a.autos).toHaveLength(AUTO_SAVES_PER_SLOT);
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
