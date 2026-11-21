import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { makeAuditSaveFile } from '../app/auditSave';
import { autoParty } from './autoParty';
import {
  describeEffect,
  facilityLevel,
  facilitySlots,
  initialFacilities,
  injuryReductionDays,
  levelCost,
  scoutingRow,
  trainingExp,
  visibleRift,
} from './facilities';
import {
  advanceDay,
  assignBlockReason,
  assignToFacility,
  constructionBlockReason,
  dispatch,
  getMerc,
  isAvailable,
  mercToUnit,
  newGame,
  startConstruction,
  unassignFromFacility,
  type GameState,
} from './game';
import { rollInjuries } from './injury';
import { generateRift, type Rift } from './rift';
import { createRng } from './rng';

const FT = tables.facilities;
const gm = (seed = 'fac') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'gm', background: 'heir' } });
const opener = () =>
  newGame(tables, { seed: 'fac', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'fire', role: 'warrior', background: 'soldier' } });
const rich = (s: GameState, zero = 99999): GameState => ({ ...s, resources: { ...s.resources, zero } });
const withLevels = (s: GameState, levels: Record<string, number>): GameState => ({
  ...s,
  facilities: { ...s.facilities, levels: { ...s.facilities.levels, ...levels } },
});
const rift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  fog: { deadlineOffset: 1, levelOffset: 2, countOffset: 1, rewardU: 0.5 },
  territoryFactionId: null,
  deadlineDay: 9,
  durationDays: 1,
  enemies: [
    { monsterId: 'void_hound', grade: 'low', level: 10, row: 'front' },
    { monsterId: 'spore_spitter', grade: 'low', level: 10, row: 'back' },
  ],
  reward: { zero: 100, arche: 20, materials: {} },
  ...patch,
});

/** 합성 데이터: 레벨 7개짜리 시설과 새 시설(기존 효과 종류) 하나 */
const synthetic: GameTables = {
  ...tables,
  facilities: {
    ...FT,
    facilities: [
      ...FT.facilities.map((f) => (f.id === 'training' ? { ...f, maxLevel: 7 } : f)),
      {
        id: 'clinic2',
        name: '야전 병원',
        description: '부상 회복 보조',
        maxLevel: 7,
        startLevel: 0,
        cost: { zero: 100, zeroGrowth: 2, days: 1, daysStep: 2 },
        levelOverrides: { '4': { zero: 999 } },
        effect: { type: 'injuryReduction', base: 1, perLevel: 0 },
      },
    ],
  },
};

describe('레벨 확장(코드가 레벨 3개·시설 3개를 가정하지 않음)', () => {
  it('최대 레벨만 올려도 비용·일수·효과가 공식으로 계산된다', () => {
    for (let lv = 1; lv <= 7; lv++) {
      expect(levelCost(synthetic, 'training', lv)).toEqual({ zero: Math.round(150 * 1.8 ** (lv - 1)), days: 2 + (lv - 1) });
      const fs = { ...initialFacilities(synthetic), levels: { ...initialFacilities(synthetic).levels, training: lv } };
      expect(facilitySlots(synthetic, fs, 'training')).toBe(lv);
      expect(trainingExp(synthetic, fs, 'training')).toBe(10 + 5 * (lv - 1));
    }
  });

  it('레벨별 덮어쓰기 행을 쓴다', () => {
    expect(levelCost(synthetic, 'clinic2', 3)).toEqual({ zero: 400, days: 5 });
    expect(levelCost(synthetic, 'clinic2', 4)).toEqual({ zero: 999, days: 7 });
  });

  it('표 기반 효과(탐지소)는 표보다 높은 레벨에서 마지막 행을 이어받는다', () => {
    const t: GameTables = { ...tables, facilities: { ...FT, facilities: FT.facilities.map((f) => (f.id === 'scout' ? { ...f, maxLevel: 7 } : f)) } };
    const lv7 = scoutingRow(t, { ...initialFacilities(t), levels: { ...initialFacilities(t).levels, scout: 7 } });
    const lv3 = scoutingRow(t, { ...initialFacilities(t), levels: { ...initialFacilities(t).levels, scout: 3 } });
    expect(lv7).toEqual(lv3);
  });

  it('새 시설은 데이터 행만으로 추가되고, 같은 효과 종류는 합산된다', () => {
    let s = newGame(synthetic, { seed: 'syn', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'guildMaster', name: 'gm', background: 'heir' } });
    expect(s.facilities.levels).toHaveProperty('clinic2', 0);
    s = rich(s);
    for (let lv = 1; lv <= 7; lv++) {
      s = startConstruction(synthetic, s, 'training');
      for (let d = 0; d < levelCost(synthetic, 'training', lv).days; d++) s = advanceDay(synthetic, rich(s)).state;
      expect(facilityLevel(s.facilities, 'training')).toBe(lv);
    }
    expect(constructionBlockReason(synthetic, s, 'training')).toBe('최대 레벨');
    s = withLevels(s, { infirmary: 2, clinic2: 5 });
    expect(injuryReductionDays(synthetic, s.facilities)).toBe(2 + 1);
    expect(describeEffect(synthetic, 'clinic2', 5)).toMatch(/−1일/);
  });
});

describe('건설·강화', () => {
  it('시작 시 탐지소 Lv1, 나머지 Lv0', () => {
    expect(gm().facilities.levels).toEqual({ infirmary: 0, training: 0, scout: 1 });
  });

  it('제로를 즉시 내고, 완료일에 레벨이 오르며, 그 뒤 다음 건설이 가능하다', () => {
    let s = rich(gm(), 1000);
    const cost = levelCost(tables, 'infirmary', 1);
    s = startConstruction(tables, s, 'infirmary');
    expect(s.resources.zero).toBe(1000 - cost.zero);
    expect(s.facilities.construction).toMatchObject({ facilityId: 'infirmary', targetLevel: 1, completeDay: 1 + cost.days });
    expect(constructionBlockReason(tables, s, 'training')).toBe('다른 시설을 건설·강화 중');
    expect(() => startConstruction(tables, s, 'training')).toThrow(/건설·강화 중/);
    for (let d = 1; d < cost.days; d++) {
      s = advanceDay(tables, rich(s)).state;
      expect(facilityLevel(s.facilities, 'infirmary')).toBe(0);
    }
    const r = advanceDay(tables, rich(s));
    expect(facilityLevel(r.state.facilities, 'infirmary')).toBe(1);
    expect(r.events).toContainEqual({ type: 'facilityBuilt', facilityId: 'infirmary', level: 1 });
    expect(r.state.facilities.construction).toBeNull();
    expect(constructionBlockReason(tables, rich(r.state), 'training')).toBeNull();
  });

  it('제로 부족과 최대 레벨은 거부한다', () => {
    const poor = { ...gm(), resources: { zero: 10, arche: 0, materials: {} } };
    expect(() => startConstruction(tables, poor, 'infirmary')).toThrow(/제로 부족/);
    const maxed = withLevels(rich(gm()), { scout: FT.facilities.find((f) => f.id === 'scout')!.maxLevel });
    expect(() => startConstruction(tables, maxed, 'scout')).toThrow(/최대 레벨/);
  });
});

describe('의무실', () => {
  it('치유사 감소와 합산하고 최소 1일을 지킨다', () => {
    const party = [mercToUnit(tables, getMerc(gm(), 'm01')), mercToUnit(tables, getMerc(gm(), 'm03'))]; // m03 치유사
    for (let seed = 0; seed < 100; seed++) {
      const base = rollInjuries(tables, party.slice(0, 1), ['m01'], 'defeat', createRng(seed))[0];
      const both = rollInjuries(tables, party, ['m01'], 'defeat', createRng(seed), 2)[0];
      expect(both.days).toBe(Math.max(1, base.days - 1 - 2));
    }
  });

  it('새로 입은 부상에 반영되고, 이미 부상 중인 용병에게는 소급하지 않는다', () => {
    let s = withLevels(gm(), { infirmary: 3 });
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm02' ? { ...m, injury: { severity: 'heavy', recoverDay: 9 } } : m)) };
    const strong = rift('D', { enemies: Array.from({ length: 5 }, () => ({ monsterId: 'devourer', grade: 'extreme', level: 70, row: 'front' as const })) });
    s = dispatch(tables, { ...s, rifts: [strong] }, 'D', [{ mercId: 'm01', row: 'front' }]);
    s = advanceDay(tables, s).state;
    const inj = s.reports[0].injuries[0];
    expect(inj.days).toBe(tables.injuries.minimumDays); // 최대 5일 − 3 → 최소 1일까지
    expect(getMerc(s, 'm02').injury!.recoverDay).toBe(9);
  });
});

describe('훈련소', () => {
  const ready = () => withLevels(rich(opener()), { training: 2 });

  it('배치 조건: 부상·파견 중·주인공·칸 수·길드 밖', () => {
    let s = ready();
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 5 } } : m)) };
    s = dispatch(tables, { ...s, rifts: [rift('A')] }, 'A', [{ mercId: 'm04', row: 'back' }]);
    expect(assignBlockReason(tables, s, 'training', 'm03')).toBe('부상 중');
    expect(assignBlockReason(tables, s, 'training', 'm04')).toBe('파견 중');
    expect(assignBlockReason(tables, s, 'training', 'hero')).toBe('주인공');
    expect(assignBlockReason(tables, s, 'training', 'm05')).toBe('길드 소속이 아님');
    s = assignToFacility(tables, s, 'training', 'm02');
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm05' ? { ...m, affiliation: { kind: 'guild' } } : m)) };
    s = assignToFacility(tables, s, 'training', 'm05');
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm06' ? { ...m, affiliation: { kind: 'guild' } } : m)) };
    expect(assignBlockReason(tables, s, 'training', 'm06')).toBe('칸이 가득 참');
    expect(assignBlockReason(tables, s, 'infirmary', 'm06')).toBe('배치할 수 없는 시설');
  });

  it('배치된 용병은 파견·자동 편성에서 빠지고, 해제는 즉시 된다', () => {
    let s = assignToFacility(tables, { ...ready(), rifts: [rift('A')] }, 'training', 'm02');
    expect(isAvailable(s, 'm02')).toBe(false);
    expect(() => dispatch(tables, s, 'A', [{ mercId: 'm02', row: 'back' }])).toThrow();
    expect(autoParty(tables, s, rift('A')).map((p) => p.mercId)).not.toContain('m02');
    s = unassignFromFacility(s, 'training', 'm02');
    expect(isAvailable(s, 'm02')).toBe(true);
  });

  it('하루 정산에서 경험치를 받고, 성장 한계면 받지 않으며, 충성도는 변하지 않는다', () => {
    let s = ready();
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm04' ? { ...m, level: m.growth.cap } : m)) };
    s = assignToFacility(tables, assignToFacility(tables, s, 'training', 'm02'), 'training', 'm04');
    const before = { m02: getMerc(s, 'm02'), m04: getMerc(s, 'm04') };
    const r = advanceDay(tables, s);
    const exp = trainingExp(tables, s.facilities, 'training');
    expect(getMerc(r.state, 'm02').exp).toBe(before.m02.exp + exp);
    expect(getMerc(r.state, 'm04').exp).toBe(before.m04.exp);
    expect(r.events).toContainEqual({ type: 'trained', facilityId: 'training', mercId: 'm02', exp });
    for (const id of ['m02', 'm04'] as const) {
      expect(getMerc(r.state, id).loyalty!.value).toBe(before[id].loyalty!.value);
      expect(getMerc(r.state, id).loyalty!.restStreak).toBe(0);
    }
    // 배치되지 않은 쿠로세 렌은 쉬어서 오른다
    expect(getMerc(r.state, 'm03').loyalty!.value).toBeGreaterThan(getMerc(s, 'm03').loyalty!.value);
  });

  it('이탈하면 자동으로 해제된다', () => {
    let s = ready();
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm02' ? { ...m, loyalty: { ...m.loyalty!, value: 0, dangerDays: 50 } } : m)) };
    s = assignToFacility(tables, s, 'training', 'm02');
    // 훈련 중에는 쉬는 날 상승이 없어 위험 구간이 이어진다 → 확률로 이탈
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      const r = advanceDay(tables, rich(s));
      s = r.state;
      gone = r.events.some((e) => e.type === 'unassigned' && e.mercId === 'm02' && e.reason === '이탈');
    }
    expect(gone).toBe(true);
    expect(s.facilities.assignments.training ?? []).not.toContain('m02');
  });
});

describe('탐지소', () => {
  const at = (lv: number) => withLevels(gm(), { scout: lv });
  const r = rift('R', { omen: { textId: tables.omens[0].id } });

  it('Lv1: 속성 공개, 마감·레벨·수·보상은 범위, 징조 숨김', () => {
    const v = visibleRift(tables, at(1).facilities, r);
    expect(v.elements).toEqual(['void']);
    expect(v.deadline).toEqual([9 - 1, 9 - 1 + FT.fog.deadlineWidth]);
    expect(v.level).toEqual([10 - 2, 10 - 2 + FT.fog.levelWidth]);
    expect(v.count).toEqual([2 - 1, 2 - 1 + FT.fog.countWidth]);
    expect(v.monsterCounts).toBeNull();
    expect(v.victoryReward.zero[0]).toBeLessThan(v.victoryReward.zero[1]);
    expect(v.omen).toBeUndefined();
    expect(v.omenHidden).toBe(true);
    expect(v.blurred).toBe(true);
  });

  it('실제 값은 범위 안에 있다', () => {
    for (let i = 0; i < 100; i++) {
      const g = generateRift(tables, 'newyork', 1, `x${i}`, createRng(`fog-${i}`));
      const v = visibleRift(tables, at(1).facilities, g);
      const lv = Math.max(...g.enemies.map((e) => e.level));
      expect(lv).toBeGreaterThanOrEqual(v.level[0]);
      expect(lv).toBeLessThanOrEqual(v.level[1]);
      expect(g.enemies.length).toBeGreaterThanOrEqual(v.count[0]);
      expect(g.enemies.length).toBeLessThanOrEqual(v.count[1]);
      expect(g.deadlineDay!).toBeGreaterThanOrEqual(v.deadline![0]);
      expect(g.deadlineDay!).toBeLessThanOrEqual(v.deadline![1]);
    }
  });

  it('Lv2: 레벨·수·마감 정확, 보상은 범위 / Lv3: 보상 정확과 징조 공개', () => {
    const v2 = visibleRift(tables, at(2).facilities, r);
    expect(v2.level).toEqual([10, 10]);
    expect(v2.count).toEqual([2, 2]);
    expect(v2.deadline).toEqual([9, 9]);
    expect(v2.monsterCounts).toEqual({ void_hound: 1, spore_spitter: 1 });
    expect(v2.victoryReward.zero[0]).toBeLessThan(v2.victoryReward.zero[1]);
    expect(v2.omen).toBeUndefined();
    const v3 = visibleRift(tables, at(3).facilities, r);
    expect(v3.victoryReward.zero[0]).toBe(v3.victoryReward.zero[1]);
    expect(v3.omen).toEqual(r.omen);
    expect(v3.blurred).toBe(false);
  });

  it('흐림은 결정적이고 볼 때마다 같으며, 실제 리프트는 바뀌지 않는다', () => {
    const g = generateRift(tables, 'seoul', 1, 'g', createRng('det'));
    const copy = structuredClone(g);
    const a = visibleRift(tables, at(1).facilities, g);
    const b = visibleRift(tables, at(1).facilities, g);
    expect(a).toEqual(b);
    expect(g).toEqual(copy);
    expect(generateRift(tables, 'seoul', 1, 'g', createRng('det')).fog).toEqual(g.fog);
  });

  it('자동 편성은 보이는 정보만 쓴다(속성이 공개되지 않으면 상성을 점수에 넣지 않음)', () => {
    // 탐지소 Lv0이면 속성 미공개 → 같은 분류 동레벨 후보는 id 순(상성 무시)
    const hidden = withLevels(gm(), { scout: 0 });
    expect(visibleRift(tables, hidden.facilities, r).elements).toBeNull();
    const s = { ...hidden, mercenaries: hidden.mercenaries.map((m) => (m.id === 'm07' ? { ...m, affiliation: { kind: 'guild' as const } } : m)) };
    // 지원 후보: 마야 참(m03, 빛, Lv3)과 백서린(m07, 냉기, Lv3). 속성이 보이면 m03, 안 보이면 id 순으로 m03 — 그래서 반대로 확인
    const flipped = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, element: 'frost' } : m.id === 'm07' ? { ...m, element: 'light' } : m)) };
    const supportOf = (st: GameState) =>
      autoParty(tables, st, r).filter((p) => ['healer', 'commander'].includes(getMerc(st, p.mercId).role))[0].mercId;
    expect(supportOf(flipped)).toBe('m03'); // 숨김: 상성 무시, id 순
    expect(supportOf(withLevels(flipped, { scout: 1 }))).toBe('m07'); // 공개: 빛(m07)이 어둠에 유리
  });
});

describe('세이브', () => {
  it('검수 세이브에 시설 상태가 있고, 배치·건설 중 상태도 저장 왕복된다', async () => {
    const { parseSave, serializeSave, createSaveFile } = await import('../storage/saveFile');
    const { saveLimits } = await import('../data');
    expect(makeAuditSaveFile().state.facilities.levels.scout).toBe(1);
    let s = startConstruction(tables, rich(withLevels(gm(), { training: 1 })), 'infirmary');
    s = assignToFacility(tables, s, 'training', 'm02');
    const back = parseSave(serializeSave(createSaveFile(s, 'manual')), { ...tables, limits: saveLimits }).state;
    expect(back.facilities).toEqual(s.facilities);
  });

  it('의미 검증: 없는 시설, 최대 레벨 초과, 주인공·부상 용병 배치, 칸 초과를 잡는다', async () => {
    const { parseSave, serializeSave, createSaveFile, SaveFormatError } = await import('../storage/saveFile');
    const { saveLimits } = await import('../data');
    const sem = { ...tables, limits: saveLimits };
    const problems = (mut: (raw: any) => void) => {
      const raw = JSON.parse(serializeSave(createSaveFile(withLevels(opener(), { training: 1 }), 'manual')));
      mut(raw);
      try {
        parseSave(raw, sem);
        return [];
      } catch (e) {
        return (e as InstanceType<typeof SaveFormatError>).problems;
      }
    };
    expect(problems((r) => (r.state.facilities.levels.lab = 1))).toContain('state.facilities.levels.lab: 없는 시설 id "lab"');
    expect(problems((r) => (r.state.facilities.levels.scout = 9)).some((p: string) => p.includes('state.facilities.levels.scout: 범위'))).toBe(true);
    expect(problems((r) => (r.state.facilities.assignments.training = ['hero']))).toContain('state.facilities.assignments.training[0]: 주인공은 배치할 수 없음');
    expect(problems((r) => (r.state.facilities.assignments.training = ['m02', 'm03'])).some((p: string) => p.includes('칸 수'))).toBe(true);
  });
});
