import { describe, expect, it } from 'vitest';
import { makeAuditSaveFile } from '../app/auditSave';
import { saveLimits, tables } from '../data';
import { advanceDay, dispatch } from '../engine/game';
import { MemorySaveRepository } from './repository';
import { createSaveFile, parseSave, serializeSave, SaveFormatError } from './saveFile';
import { validateSemantics } from './saveSemantics';
import { SaveService } from './saveService';

const semantic = { ...tables, limits: saveLimits };
/** 검수용 고정 세이브의 JSON 사본(파견·복귀 보고가 든 상태도 만든다) */
const audit = (played = false) => {
  const file = makeAuditSaveFile();
  if (played) {
    let s = dispatch(tables, file.state, 'r1', [{ mercId: 'hero', row: 'front' }, { mercId: 'm02', row: 'back' }]);
    s = advanceDay(tables, s).state;
    s = dispatch(tables, s, s.rifts[0].id, [{ mercId: 'm03', row: 'back' }, { mercId: 'm04', row: 'back' }]);
    return JSON.parse(serializeSave(createSaveFile(s, 'manual')));
  }
  return JSON.parse(serializeSave(file));
};
const problemsOf = (raw: unknown) => {
  try {
    parseSave(raw, semantic);
  } catch (e) {
    if (e instanceof SaveFormatError) return e.problems;
    throw e;
  }
  return [];
};
const riftIndex = (raw: any, id: string) => raw.state.rifts.findIndex((r: any) => r.id === id);

describe('세이브 의미 검증', () => {
  it('정상 세이브와 make-audit-save 세이브는 통과한다(파견·보고 포함)', () => {
    expect(problemsOf(audit())).toEqual([]);
    expect(problemsOf(audit(true))).toEqual([]);
    const played = audit(true);
    expect(played.state.expeditions.length).toBe(1);
    expect(played.state.reports.length).toBe(1);
  });

  it('검수 재현: r1의 enemies가 빈 세이브는 경로와 함께 거부하고 슬롯을 만들지 않는다', async () => {
    const raw = audit();
    const i = riftIndex(raw, 'r1');
    raw.state.rifts[i].enemies = [];
    expect(problemsOf(raw)).toContain(`state.rifts[${i}].enemies 비어 있음`);
    const svc = new SaveService(new MemorySaveRepository());
    await expect(svc.importFile(JSON.stringify(raw), 'bad')).rejects.toThrow(`state.rifts[${i}].enemies 비어 있음`);
    expect(await svc.listSlots()).toEqual([]);
  });

  it('불러오기(슬롯 → 게임)도 같은 검사를 거친다', async () => {
    const repo = new MemorySaveRepository();
    const raw = audit();
    raw.state.rifts[0].enemies[0].monsterId = 'ghost';
    await repo.put({ key: 'X/manual', slotId: 'X', kind: 'manual', seq: 0, file: raw });
    const svc = new SaveService(repo);
    await expect(svc.loadManual('X')).rejects.toThrow(/없는 몬스터 id "ghost"/);
    expect(svc.isLoadable(raw)).toBe(false);
  });

  it('존재하지 않는 몬스터 id', () => {
    const raw = audit();
    raw.state.rifts[2].enemies[0].monsterId = 'no_such_monster';
    expect(problemsOf(raw)).toContain('state.rifts[2].enemies[0].monsterId: 없는 몬스터 id "no_such_monster"');
  });

  it('존재하지 않는 용병 id를 가진 파견', () => {
    const raw = audit(true);
    raw.state.expeditions[0].party[0].mercId = 'm99';
    expect(problemsOf(raw)).toContain(`state.expeditions[0].party[0].mercId: 세이브에 없는 ${tables.terms.merc} "m99"`);
  });

  it('같은 용병이 중복된 파티', () => {
    const raw = audit(true);
    raw.state.expeditions[0].party[1].mercId = raw.state.expeditions[0].party[0].mercId;
    expect(problemsOf(raw)).toContain(`state.expeditions[0].party[1].mercId: 같은 파티에 중복된 ${tables.terms.merc} "${raw.state.expeditions[0].party[0].mercId}"`);
  });

  it.each([
    ['리프트 소요 0', (r: any) => (r.state.rifts[0].durationDays = 0), /state\.rifts\[0\]\.durationDays: 범위 \d+~\d+ 밖\(0\)/],
    ['몬스터 레벨 0', (r: any) => (r.state.rifts[0].enemies[0].level = 0), /state\.rifts\[0\]\.enemies\[0\]\.level: 범위 \d+~\d+ 밖\(0\)/],
    ['용병 레벨 음수', (r: any) => (r.state.mercenaries[1].level = -3), /state\.mercenaries\[1\]\.level: 범위 1~\d+ 밖\(-3\)/],
    ['제로 음수', (r: any) => (r.state.resources.zero = -5), /state\.resources\.zero: 0보다 작음\(-5\)/],
    ['날짜 0', (r: any) => (r.state.day = 0), /state\.day: 1보다 작음\(0\)/],
    ['보상 음수', (r: any) => (r.state.rifts[1].reward.arche = -1), /state\.rifts\[1\]\.reward\.arche: 0보다 작음/],
  ])('%s를 잡는다', (_label, damage, pattern) => {
    const raw = audit();
    damage(raw);
    expect(problemsOf(raw).some((p) => pattern.test(p))).toBe(true);
  });

  it.each([
    ['도시', (r: any) => (r.state.rifts[0].cityId = 'paris'), 'state.rifts[0].cityId: 없는 도시 id "paris"'],
    ['세력', (r: any) => (r.state.mercenaries.find((m: any) => m.affiliation.kind === 'faction').affiliation.factionId = 'ironhound'), /affiliation\.factionId: 없는 세력 id "ironhound"/],
    ['리프트 등급', (r: any) => (r.state.rifts[0].tier = 'portal'), 'state.rifts[0].tier: 없는 리프트 등급 id "portal"'],
    ['몬스터 등급', (r: any) => (r.state.rifts[0].enemies[0].grade = 'boss'), 'state.rifts[0].enemies[0].grade: 없는 몬스터 등급 id "boss"'],
    ['배경', (r: any) => (r.state.mercenaries[1].profile.background = 'pirate'), 'state.mercenaries[1].profile.background: 없는 배경 id "pirate"'],
    ['파견 리프트가 목록에도 있음', (r: any) => r.state.rifts.push(structuredClone(r.state.expeditions[0].rift)), /state\.expeditions\[0\]\.rift\.id: 파견 중인 리프트 "[^"]+"가 리프트 목록에도 있음/],
    ['복귀 보고의 리프트 손상', (r: any) => (r.state.reports[0].rift.enemies = []), 'state.reports[0].rift.enemies 비어 있음'],
    ['주인공 용병 없음', (r: any) => (r.state.protagonist.mercId = 'nobody'), `state.protagonist.mercId: 세이브에 없는 ${tables.terms.merc} "nobody"`],
  ])('참조: %s', (_label, damage, expected) => {
    const raw = audit(true);
    damage(raw);
    const problems = problemsOf(raw);
    if (typeof expected === 'string') expect(problems).toContain(expected);
    else expect(problems.some((p) => expected.test(p))).toBe(true);
  });

  it('검사기는 데이터 표를 인자로 받는다(표를 바꾸면 결과가 바뀐다)', () => {
    const state = audit().state;
    expect(validateSemantics(state, semantic)).toEqual([]);
    const noVoidHound = { ...semantic, monsters: tables.monsters.filter((m) => m.id !== 'void_hound') };
    const used = state.rifts.some((r: any) => r.enemies.some((e: any) => e.monsterId === 'void_hound'));
    expect(validateSemantics(state, noVoidHound).length > 0).toBe(used);
  });
});
