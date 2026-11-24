/**
 * 세이브 의미 검증: 스키마(형식) 검사를 통과한 상태에 대해
 * 값 범위(유한한 수, 데이터 표의 최소·범위)와 참조(데이터 id, 세이브 안의 용병·리프트)를 확인한다.
 * 데이터 표는 인자로 받아 저장소가 엔진이나 화면에 의존하지 않게 한다.
 * 결과는 스키마 검사와 같은 "필드 경로 + 문제" 문자열 목록이다.
 */
import type { GameTables, Range, SaveLimits } from '../data';
import { facilitySlots } from '../engine/facilities';
import type { GameState } from '../engine/game';

/** 의미 검증에 필요한 데이터 표 */
export type SemanticTables = Pick<
  GameTables,
  | 'cities'
  | 'factions'
  | 'riftTiers'
  | 'monsterGrades'
  | 'monsters'
  | 'materials'
  | 'omens'
  | 'elements'
  | 'roles'
  | 'backgrounds'
  | 'worlds'
  | 'races'
  | 'injuries'
  | 'combat'
  | 'loyalty'
  | 'facilities'
  | 'terms'
  | 'traits'
> & { limits: SaveLimits };

export function validateSemantics(state: GameState, t: SemanticTables): string[] {
  const errors: string[] = [];
  /** 화면 용어(계약자) */
  const M = t.terms.merc;
  const has = (rows: { id: string }[], id: string) => rows.some((r) => r.id === id);
  const ref = (path: string, rows: { id: string }[], id: string | undefined, what: string) => {
    if (id !== undefined && !has(rows, id)) errors.push(`${path}: 없는 ${what} id "${id}"`);
  };
  const atLeast = (path: string, v: number, min: number) => {
    if (!Number.isFinite(v)) errors.push(`${path}: 유한한 수가 아님`);
    else if (v < min) errors.push(`${path}: ${min}보다 작음(${v})`);
  };
  const within = (path: string, v: number, [lo, hi]: Range) => {
    if (!Number.isFinite(v)) errors.push(`${path}: 유한한 수가 아님`);
    else if (v < lo || v > hi) errors.push(`${path}: 범위 ${lo}~${hi} 밖(${v})`);
  };
  const L = t.limits;

  // ── 기본 값
  atLeast('state.day', state.day, L.minDay);
  atLeast('state.resources.zero', state.resources.zero, 0);
  atLeast('state.resources.arche', state.resources.arche, 0);
  for (const [k, v] of Object.entries(state.resources.materials)) {
    ref(`state.resources.materials.${k}`, t.materials, k, '재료');
    atLeast(`state.resources.materials.${k}`, v, 0);
  }
  ref('state.baseCityId', t.cities, state.baseCityId, '도시');
  ref('state.protagonist.background', t.backgrounds, state.protagonist.background, '배경');
  atLeast('state.counters.rift', state.counters.rift, 0);
  atLeast('state.counters.expedition', state.counters.expedition, 0);
  atLeast('state.records.victories', state.records.victories, 0);
  for (const [tier, n] of Object.entries(state.records.victoriesByTier)) {
    ref(`state.records.victoriesByTier.${tier}`, t.riftTiers, tier, '리프트 등급');
    atLeast(`state.records.victoriesByTier.${tier}`, n, 0);
  }

  // ── 용병
  const mercIds = new Set<string>();
  state.mercenaries.forEach((m, i) => {
    const p = `state.mercenaries[${i}]`;
    if (mercIds.has(m.id)) errors.push(`${p}.id: 중복된 ${M} id "${m.id}"`);
    mercIds.add(m.id);
    ref(`${p}.element`, t.elements, m.element, '속성');
    ref(`${p}.role`, t.roles, m.role, '역할');
    ref(`${p}.profile.background`, t.backgrounds, m.profile.background, '배경');
    ref(`${p}.profile.hometown`, t.cities, m.profile.hometown, '도시');
    // 특성 단계(지시서 016): 있는 특성 id, 1 ~ maxRank
    for (const [id, rank] of Object.entries(m.traitRanks ?? {})) {
      const tr = t.traits.traits.find((x) => x.id === id);
      if (!tr) errors.push(`${p}.traitRanks.${id}: 없는 특성 id`);
      else within(`${p}.traitRanks.${id}`, rank, [1, tr.maxRank]);
    }
    ref(`${p}.profile.world`, t.worlds, m.profile.world, '세계');
    ref(`${p}.profile.race`, t.races, m.profile.race, '종족');
    if (m.affiliation.kind === 'faction') ref(`${p}.affiliation.factionId`, t.factions, m.affiliation.factionId, '세력');
    else if (m.affiliation.kind !== 'guild') errors.push(`${p}.affiliation.kind: 허용되지 않은 값 "${m.affiliation.kind}"`);
    atLeast(`${p}.growth.cap`, m.growth.cap, L.minMercLevel);
    atLeast(`${p}.initialLevel`, m.initialLevel, L.minMercLevel);
    within(`${p}.level`, m.level, [L.minMercLevel, Math.max(L.minMercLevel, m.growth.cap)]);
    atLeast(`${p}.exp`, m.exp, 0);
    if (m.injury) {
      if (!t.injuries.severities.some((s) => s.id === m.injury!.severity)) errors.push(`${p}.injury.severity: 없는 부상 등급 id "${m.injury.severity}"`);
      atLeast(`${p}.injury.recoverDay`, m.injury.recoverDay, L.minDay);
    }
    // 충성도: 주인공을 뺀 모든 용병이 같은 틀로 갖는다(길드 밖은 시작값 보관). 주인공은 없다.
    if (!m.isProtagonist && !m.loyalty) errors.push(`${p}.loyalty 없음`);
    if (m.isProtagonist && m.loyalty) errors.push(`${p}.loyalty: 주인공에게 충성도가 있음`);
    if (m.loyalty) {
      within(`${p}.loyalty.value`, m.loyalty.value, t.loyalty.range);
      atLeast(`${p}.loyalty.dangerDays`, m.loyalty.dangerDays, 0);
      atLeast(`${p}.loyalty.restStreak`, m.loyalty.restStreak, 0);
      m.loyalty.recent.forEach((r, j) => {
        if (!(r.reason in t.loyalty.changes)) errors.push(`${p}.loyalty.recent[${j}].reason: 없는 변동 요인 "${r.reason}"`);
      });
    }
    if (m.departedDay !== undefined) atLeast(`${p}.departedDay`, m.departedDay, L.minDay);
    if (m.unpaidUpkeep) {
      atLeast(`${p}.unpaidUpkeep.days`, m.unpaidUpkeep.days, 0);
      atLeast(`${p}.unpaidUpkeep.zero`, m.unpaidUpkeep.zero, 0);
    }
  });
  if (state.protagonist.mode === 'opener') {
    if (!state.protagonist.mercId) errors.push('state.protagonist.mercId 없음');
    else if (!mercIds.has(state.protagonist.mercId)) errors.push(`state.protagonist.mercId: 세이브에 없는 ${M} "${state.protagonist.mercId}"`);
  }
  const isGuild = (id: string) => state.mercenaries.find((m) => m.id === id)?.affiliation.kind === 'guild';

  // ── 리프트(목록, 파견, 보고가 같은 검사를 쓴다)
  const checkRift = (p: string, r: GameState['rifts'][number]) => {
    ref(`${p}.cityId`, t.cities, r.cityId, '도시');
    const tier = t.riftTiers.find((x) => x.id === r.tier);
    if (!tier) errors.push(`${p}.tier: 없는 리프트 등급 id "${r.tier}"`);
    if (r.enemies.length < L.minEnemiesPerRift) errors.push(r.enemies.length === 0 ? `${p}.enemies 비어 있음` : `${p}.enemies: ${L.minEnemiesPerRift}개보다 적음`);
    r.enemies.forEach((e, j) => {
      const ep = `${p}.enemies[${j}]`;
      ref(`${ep}.monsterId`, t.monsters, e.monsterId, '몬스터');
      const grade = t.monsterGrades.find((g) => g.id === e.grade);
      if (!grade) errors.push(`${ep}.grade: 없는 몬스터 등급 id "${e.grade}"`);
      else within(`${ep}.level`, e.level, grade.level);
    });
    if (tier) within(`${p}.durationDays`, r.durationDays, tier.durationDays);
    if (tier && r.variant !== undefined && !tier.variants?.some((v) => v.id === r.variant)) errors.push(`${p}.variant: 리프트 등급 "${r.tier}"에 없는 변형 id "${r.variant}"`);
    atLeast(`${p}.appearedDay`, r.appearedDay, L.minDay);
    if (r.deadlineDay !== null) atLeast(`${p}.deadlineDay`, r.deadlineDay, r.appearedDay);
    atLeast(`${p}.reward.zero`, r.reward.zero, 0);
    atLeast(`${p}.reward.arche`, r.reward.arche, 0);
    for (const [k, v] of Object.entries(r.reward.materials)) {
      ref(`${p}.reward.materials.${k}`, t.materials, k, '재료');
      atLeast(`${p}.reward.materials.${k}`, v, 0);
    }
    if (r.omen) ref(`${p}.omen.textId`, t.omens, r.omen.textId, '징조 문구');
    if (r.territoryFactionId !== null) ref(`${p}.territoryFactionId`, t.factions, r.territoryFactionId, '세력');
    const fog = t.facilities.fog;
    within(`${p}.fog.deadlineOffset`, r.fog.deadlineOffset, [0, fog.deadlineWidth]);
    within(`${p}.fog.levelOffset`, r.fog.levelOffset, [0, fog.levelWidth]);
    within(`${p}.fog.countOffset`, r.fog.countOffset, [0, fog.countWidth]);
    within(`${p}.fog.rewardU`, r.fog.rewardU, [0, 1]);
  };
  const checkParty = (p: string, party: { mercId: string }[], requireGuild: boolean) => {
    if (party.length < L.minPartySize) errors.push(`${p} 비어 있음`);
    if (party.length > t.combat.party.maxSize) errors.push(`${p}: 최대 ${t.combat.party.maxSize}명을 넘음(${party.length})`);
    const seen = new Set<string>();
    party.forEach((m, j) => {
      if (!mercIds.has(m.mercId)) errors.push(`${p}[${j}].mercId: 세이브에 없는 ${M} "${m.mercId}"`);
      else if (requireGuild && !isGuild(m.mercId)) errors.push(`${p}[${j}].mercId: 길드 소속이 아닌 ${M} "${m.mercId}"`);
      if (seen.has(m.mercId)) errors.push(`${p}[${j}].mercId: 같은 파티에 중복된 ${M} "${m.mercId}"`);
      seen.add(m.mercId);
    });
  };

  const riftIds = new Set<string>();
  state.rifts.forEach((r, i) => {
    if (riftIds.has(r.id)) errors.push(`state.rifts[${i}].id: 중복된 리프트 id "${r.id}"`);
    riftIds.add(r.id);
    checkRift(`state.rifts[${i}]`, r);
  });

  // ── 파견
  const busy = new Map<string, string>();
  state.expeditions.forEach((ex, i) => {
    const p = `state.expeditions[${i}]`;
    checkRift(`${p}.rift`, ex.rift);
    if (riftIds.has(ex.rift.id)) errors.push(`${p}.rift.id: 파견 중인 리프트 "${ex.rift.id}"가 리프트 목록에도 있음`);
    checkParty(`${p}.party`, ex.party, true);
    ex.party.forEach((m, j) => {
      const other = busy.get(m.mercId);
      if (other && other !== ex.id) errors.push(`${p}.party[${j}].mercId: ${M} "${m.mercId}"가 다른 파견(${other})에도 있음`);
      busy.set(m.mercId, ex.id);
    });
    atLeast(`${p}.travelDays`, ex.travelDays, 0);
    atLeast(`${p}.departDay`, ex.departDay, L.minDay);
    atLeast(`${p}.returnDay`, ex.returnDay, ex.departDay);
  });

  // ── 복귀 보고
  state.reports.forEach((r, i) => {
    const p = `state.reports[${i}]`;
    checkRift(`${p}.rift`, r.rift);
    checkParty(`${p}.party`, r.party, false);
    r.expGains.forEach((g, j) => {
      if (!mercIds.has(g.mercId)) errors.push(`${p}.expGains[${j}].mercId: 세이브에 없는 ${M} "${g.mercId}"`);
      atLeast(`${p}.expGains[${j}].exp`, g.exp, 0);
    });
    r.injuries.forEach((inj, j) => {
      if (!mercIds.has(inj.unitId)) errors.push(`${p}.injuries[${j}].unitId: 세이브에 없는 ${M} "${inj.unitId}"`);
      if (!t.injuries.severities.some((s) => s.id === inj.severity)) errors.push(`${p}.injuries[${j}].severity: 없는 부상 등급 id "${inj.severity}"`);
    });
    atLeast(`${p}.day`, r.day, L.minDay);
    atLeast(`${p}.reward.zero`, r.reward.zero, 0);
    atLeast(`${p}.reward.arche`, r.reward.arche, 0);
  });

  // ── 거점 시설
  const fs = state.facilities;
  const facilityRows = t.facilities.facilities;
  for (const [id, lv] of Object.entries(fs.levels)) {
    const f = facilityRows.find((x) => x.id === id);
    if (!f) errors.push(`state.facilities.levels.${id}: 없는 시설 id "${id}"`);
    else within(`state.facilities.levels.${id}`, lv, [0, f.maxLevel]);
  }
  for (const f of facilityRows) if (!(f.id in fs.levels)) errors.push(`state.facilities.levels.${f.id} 없음`);
  if (fs.construction) {
    const c = fs.construction;
    const f = facilityRows.find((x) => x.id === c.facilityId);
    if (!f) errors.push(`state.facilities.construction.facilityId: 없는 시설 id "${c.facilityId}"`);
    else {
      if (c.targetLevel !== (fs.levels[c.facilityId] ?? 0) + 1) errors.push(`state.facilities.construction.targetLevel: 현재 레벨 + 1이 아님(${c.targetLevel})`);
      within('state.facilities.construction.targetLevel', c.targetLevel, [1, f.maxLevel]);
    }
    atLeast('state.facilities.construction.completeDay', c.completeDay, c.startDay);
    // 진행 중 공사: 시작일 ≤ 오늘 < 완료일(완료일이 된 날 시작에 반영되므로 오늘이 완료일 이상인 공사는 남아 있을 수 없다)
    if (c.startDay > state.day) errors.push(`state.facilities.construction.startDay: 오늘(${state.day})보다 미래에 시작한 공사(${c.startDay})`);
    if (c.completeDay <= state.day) errors.push(`state.facilities.construction.completeDay: 이미 끝났어야 할 공사(완료일 ${c.completeDay}, 오늘 ${state.day})`);
  }
  const placed = new Set<string>();
  for (const [id, ids] of Object.entries(fs.assignments)) {
    const p = `state.facilities.assignments.${id}`;
    if (!facilityRows.some((x) => x.id === id)) errors.push(`${p}: 없는 시설 id "${id}"`);
    else if (ids.length > facilitySlots(t as unknown as GameTables, fs, id)) errors.push(`${p}: 칸 수(${facilitySlots(t as unknown as GameTables, fs, id)})보다 많이 배치됨`);
    ids.forEach((mercId, j) => {
      const m = state.mercenaries.find((x) => x.id === mercId);
      if (!m) errors.push(`${p}[${j}]: 세이브에 없는 ${M} "${mercId}"`);
      else {
        if (m.affiliation.kind !== 'guild') errors.push(`${p}[${j}]: 길드 소속이 아닌 ${M} "${mercId}"`);
        if (m.isProtagonist) errors.push(`${p}[${j}]: 주인공은 배치할 수 없음`);
        if (m.injury) errors.push(`${p}[${j}]: 부상 중인 ${M} "${mercId}"`);
      }
      if (busy.has(mercId)) errors.push(`${p}[${j}]: 파견 중인 ${M} "${mercId}"`);
      if (placed.has(mercId)) errors.push(`${p}[${j}]: 두 곳에 배치된 ${M} "${mercId}"`);
      placed.add(mercId);
    });
  }

  return errors;
}
