import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { advanceDay, dispatch, newGame } from '../engine/game';
import { MemorySaveRepository } from './repository';
import { createSaveFile, parseSave, SAVE_VERSION, SaveFormatError, serializeSave } from './saveFile';
import { validate } from './saveSchema';
import { SaveService } from './saveService';

/** 검수용 고정 세이브와 같은 상태(npm run make-audit-save) */
function auditFile() {
  let state = newGame(tables, {
    seed: 'audit-20261120',
    guildName: '검수 길드',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: '검수자', element: 'fire', role: 'warrior', background: 'survivor' },
  });
  // 파견·복귀 보고까지 들어간 상태도 스키마를 통과해야 한다.
  state = dispatch(tables, state, 'r1', [{ mercId: 'hero', row: 'front' }, { mercId: 'm02', row: 'back' }]);
  for (let i = 0; i < 3; i++) state = advanceDay(tables, state).state;
  return JSON.parse(serializeSave(createSaveFile(state, 'manual', new Date('2026-11-20T00:00:00Z'))));
}

const errorOf = (raw: unknown) => {
  try {
    parseSave(raw);
  } catch (e) {
    return e as SaveFormatError;
  }
  throw new Error('통과하면 안 된다');
};

describe('세이브 스키마 검증', () => {
  it('정상 v2 세이브는 통과한다(파견과 복귀 보고 포함)', () => {
    const raw = auditFile();
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.state.reports.length).toBeGreaterThan(0);
    expect(validate(raw)).toEqual([]);
    expect(parseSave(raw).state.day).toBe(raw.state.day);
  });

  it('이전 버전(v1)은 계속 거부한다', () => {
    expect(errorOf({ ...auditFile(), version: 1 }).message).toMatch(/지원하지 않는 세이브/);
  });

  it('resources가 없는 v2는 필드 경로가 든 오류로 거부한다', () => {
    const raw = auditFile();
    delete raw.state.resources;
    const e = errorOf(raw);
    expect(e).toBeInstanceOf(SaveFormatError);
    expect(e.message).toContain('state.resources 없음');
    expect(e.problems).toEqual(['state.resources 없음']);
  });

  it.each([
    ['state.seed', (r: any) => delete r.state.seed, 'state.seed 없음'],
    ['state.day 문자열', (r: any) => (r.state.day = '3'), 'state.day: 숫자가 아님'],
    ['용병 성장 수치', (r: any) => delete r.state.mercenaries[2].growth, 'state.mercenaries[2].growth 없음'],
    ['리프트 보상 제로', (r: any) => delete r.state.rifts[0].reward.zero, 'state.rifts[0].reward.zero 없음'],
    ['파견 목록이 배열 아님', (r: any) => (r.state.expeditions = {}), 'state.expeditions: 배열이 아님'],
    ['기록', (r: any) => delete r.state.records, 'state.records 없음'],
    ['봉투 종류', (r: any) => (r.kind = 'other'), 'kind: 허용되지 않은 값 "other"'],
    ['자원의 제로', (r: any) => (r.state.resources.zero = null), 'state.resources.zero: 숫자가 아님'],
  ])('%s 누락·손상을 잡는다', (_label, damage, expected) => {
    const raw = auditFile();
    damage(raw);
    expect(errorOf(raw).problems).toContain(expected);
  });

  it('검증에 실패하면 가져오기가 슬롯을 만들지 않는다', async () => {
    const svc = new SaveService(new MemorySaveRepository());
    const raw = auditFile();
    delete raw.state.resources;
    await expect(svc.importFile(JSON.stringify(raw), 'bad')).rejects.toThrow(/state\.resources 없음/);
    expect(await svc.listSlots()).toEqual([]);
    await svc.importFile(JSON.stringify(auditFile()), 'good');
    expect((await svc.listSlots()).map((s) => s.slotId)).toEqual(['good']);
  });
});
