import { getRiftTier, travelDays, type GameTables, type Outcome, type Row, type Stats, type UnlockRule } from '../data';
import { activeTraits, newlyUnlockedTraits, roleBaseStats, statsAtLevel, type GrowthRates } from './stats';
import { resolveCombat, validateParty, type CombatEvent, type CombatSlot } from './combat';
import { rollInjuries, type Injury } from './injury';
import { rollPreemption } from './preemption';
import { expShare, generateRift, riftEnemySlots, riftModifiers, riftReward, type Rift, type RiftReward } from './rift';
export { expPerMember, expPerMemberAt, expShare, riftLevel, riftReward, shareOf } from './rift';
import { createRng } from './rng';
import {
  assignedFacility,
  facilityLevel,
  facilitySlots,
  getFacility,
  initialFacilities,
  injuryReductionDays,
  levelCost,
  trainingExp,
  type FacilitiesState,
} from './facilities';
import { applyLoyalty, isLoyaltySimulated, loyaltyDelta, loyaltyTier, newLoyalty, type LoyaltyState } from './loyalty';
import { planOuterMissions, type OuterResult } from './outer';
import { MERC_ACTIVE_COUNT, roleDefaultSkills, type Affiliation, type Unit } from './unit';

export class GameError extends Error {}

export interface MercenaryState {
  id: string;
  name: string;
  element: string;
  role: string;
  level: number;
  /** 다음 레벨까지 쌓인 경험치 */
  exp: number;
  /** 개별 성장 수치(계약자마다 고정). cap: 성장 한계(최대 레벨) */
  growth: { cap: number };
  initialLevel: number;
  /** 표시용 프로필(1단계는 전투·성장에 영향 없음) */
  profile: MercProfile;
  affiliation: Affiliation;
  /** recoverDay가 되면 회복한다. 복귀 당일은 부상 일수에 세지 않는다. */
  injury?: { severity: string; recoverDay: number };
  /** 유지비 미납 누적(2단계부터 충성도 하락 요인) */
  unpaidUpkeep?: { days: number; zero: number };
  /** 충성도. 모든 계약자가 같은 틀로 갖는다. 시뮬레이션은 데이터가 정한 소속만(지금은 길드). */
  loyalty?: LoyaltyState;
  /** 충성도로 길드를 이탈한 날(무소속 이동 보호 기간 판정) */
  departedDay?: number;
  /** 특성 단계(지시서 016, 강화 대비). 없으면 1단계 */
  traitRanks?: Record<string, number>;
}

export interface MercProfile {
  age?: number;
  gender?: string;
  /** 도시 id */
  hometown?: string;
  /** backgrounds.json id */
  background: string;
  /** 조합 축 "세계" id */
  world: string;
  race: string;
}

/**
 * 플레이어(길드 마스터, 지시서 022). 전투에 참여하지 않고 계약자 목록·파티에 없다.
 * background는 저장만 하고 효과 없음(화면에서 고르지 않는다).
 */
export interface Protagonist {
  name: string;
  background: string;
}
export type ProtagonistSetup = { name: string; background?: string };

export interface PartyMember {
  mercId: string;
  row: Row;
}

export interface Expedition {
  id: string;
  rift: Rift;
  party: PartyMember[];
  departDay: number;
  /** 거점에서 리프트 도시까지 편도 이동 일수 */
  travelDays: number;
  returnDay: number;
}

export interface ExpGain {
  mercId: string;
  exp: number;
}

export interface ExpeditionReport {
  expeditionId: string;
  rift: Rift;
  party: PartyMember[];
  day: number;
  outcome: Outcome;
  rounds: number;
  combatSeed: string;
  /** 오래된 보고는 로그를 지워 세이브 크기를 줄인다 */
  events?: CombatEvent[];
  reward: RiftReward;
  expGains: ExpGain[];
  injuries: Injury[];
  stabilized: boolean;
}

export interface GameState {
  seed: string;
  day: number;
  guildName: string;
  baseCityId: string;
  protagonist: Protagonist;
  resources: { zero: number; arche: number; materials: Record<string, number> };
  mercenaries: MercenaryState[];
  rifts: Rift[];
  expeditions: Expedition[];
  reports: ExpeditionReport[];
  /** 승리로 안정화한 항로 기록(1단계는 기록만) */
  stabilizedRoutes: { riftId: string; name: string; day: number }[];
  counters: { rift: number; expedition: number };
  /** 영입 해금 조건 판정용 누적 기록 */
  records: { victories: number; victoriesByTier: Record<string, number> };
  /** 거점(시작 도시 한 곳)의 시설 */
  facilities: FacilitiesState;
  /** 세이브에 저장하는 게임 설정(지시서 022). autoOuter: 쉬는 계약자 외곽 임무 자동 배치 */
  settings: { autoOuter: boolean };
}

export type DayEvent =
  | { type: 'recovered'; mercId: string }
  | { type: 'returned'; expeditionId: string; outcome: Outcome }
  | { type: 'riftExpired'; riftId: string; name: string }
  | { type: 'riftSpawned'; riftId: string; cityId: string }
  /** 라이벌 선점(지시서 013): 리프트가 목록에서 사라진다. factionId는 영역 세력(없으면 null) */
  | { type: 'preempted'; riftId: string; name: string; cityId: string; factionId: string | null }
  | { type: 'upkeep'; paid: number; unpaid: number; unpaidMercIds: string[] }
  | { type: 'loyaltyTier'; mercId: string; from: string; to: string }
  | { type: 'departed'; mercId: string; factionId: string }
  | { type: 'facilityBuilt'; facilityId: string; level: number }
  | { type: 'trained'; facilityId: string; mercId: string; exp: number }
  | { type: 'unassigned'; facilityId: string; mercId: string; reason: string }
  | { type: 'poached'; mercId: string; fromFactionId: string; toFactionId: string; wasDeparted: boolean }
  | { type: 'refused'; mercId: string }
  /** 외곽 임무(지시서 022): 자동 배치 결과와 충성도 변동(불만) */
  | { type: 'outerMission'; results: (OuterResult & { loyaltyDelta: number })[] };

export interface NewGameOptions {
  seed: string;
  guildName: string;
  baseCityId: string;
  protagonist: ProtagonistSetup;
}

// ── 조회 ──────────────────────────────────────────────

export function getMerc(state: GameState, id: string): MercenaryState {
  const m = state.mercenaries.find((x) => x.id === id);
  if (!m) throw new GameError(`없는 용병: ${id}`);
  return m;
}

export const isGuildMember = (m: MercenaryState) => m.affiliation.kind === 'guild';

export function isOnExpedition(state: GameState, mercId: string): boolean {
  return state.expeditions.some((e) => e.party.some((p) => p.mercId === mercId));
}

/** 파견 가능: 길드 소속이고 부상이 없고 다른 파견 중이 아님 */
export function isAvailable(state: GameState, mercId: string): boolean {
  const m = getMerc(state, mercId);
  return isGuildMember(m) && !m.injury && !isOnExpedition(state, mercId) && !refusedToday(state, m) && !assignedFacility(state.facilities, mercId);
}

/** 오늘 파견을 거부했는가(하루 시작 때 정해진 채 그날 유지) */
export function refusedToday(state: GameState, m: MercenaryState): boolean {
  return m.loyalty?.refusedOnDay === state.day;
}

/** 다음 레벨까지 필요한 경험치. 모든 계약자가 같다(지시서 021: 경험치 배율 체계 삭제) */
export function expToNextLevel(tables: GameTables, level: number): number {
  const { base, perLevel } = tables.progression.expToNextLevel;
  return Math.round(base + perLevel * (level - 1));
}

export function levelUpCost(tables: GameTables, level: number): number {
  const { base, perLevel } = tables.progression.levelUpArcheCost;
  return base + perLevel * (level - 1);
}

/** 하루 유지비 */
export function upkeepPerDay(tables: GameTables, m: MercenaryState): number {
  const { base, perLevel } = tables.progression.upkeepZeroPerDay;
  return base + perLevel * m.level;
}

export function guildUpkeepPerDay(tables: GameTables, state: GameState): number {
  return state.mercenaries.filter(isGuildMember).reduce((sum, m) => sum + upkeepPerDay(tables, m), 0);
}

/**
 * 영입했을 때의 길드 유지비 전망. 영입 확인 화면이 값만 보여 준다.
 * daysAffordable: 영입비를 낸 뒤 남은 제로로, 수입 없이 하루 유지비를 전액 낼 수 있는 일수.
 */
export function recruitUpkeepOutlook(
  tables: GameTables,
  state: GameState,
  mercId: string,
): { cost: number; zeroAfter: number; dailyUpkeepBefore: number; dailyUpkeepAfter: number; daysAffordable: number } {
  const m = getMerc(state, mercId);
  const { cost } = recruitInfo(tables, state, mercId);
  const before = guildUpkeepPerDay(tables, state);
  const after = before + upkeepPerDay(tables, { ...m, affiliation: { kind: 'guild' } });
  const zeroAfter = state.resources.zero - cost;
  return {
    cost,
    zeroAfter,
    dailyUpkeepBefore: before,
    dailyUpkeepAfter: after,
    daysAffordable: after > 0 ? Math.max(0, Math.floor(zeroAfter / after)) : Infinity,
  };
}

export interface RecruitInfo {
  /** 영입 대상(NPC 세력 소속)인가 */
  eligible: boolean;
  cost: number;
  unlock?: UnlockRule;
  /** 해금 조건 진행도 */
  progress?: { current: number; required: number };
  unlocked: boolean;
}

function unlockProgress(state: GameState, rule: UnlockRule): { current: number; required: number } {
  const current = rule.type === 'totalVictories' ? state.records.victories : (state.records.victoriesByTier[rule.tier] ?? 0);
  return { current, required: rule.count };
}

/** 영입비는 용병마다 다르고 성장 한계가 높을수록 비싸다. 세력 배율, 거점 도시 밖 고향 배율을 곱한다. */
export function recruitInfo(tables: GameTables, state: GameState, mercId: string): RecruitInfo {
  const m = getMerc(state, mercId);
  const aff = m.affiliation;
  const faction = aff.kind === 'faction' ? tables.factions.find((f) => f.id === aff.factionId) : undefined;
  const c = tables.progression.recruitZeroCost;
  const city = tables.cities.find((x) => x.id === state.baseCityId);
  const away = m.profile.hometown !== state.baseCityId ? (city?.recruitment.otherHometownCostMultiplier ?? 1) : 1;
  const raw = c.base + c.perCapAbove30 * Math.max(0, m.growth.cap - c.capBaseline) + c.perLevel * (m.level - 1);
  const cost = Math.round(raw * (faction?.recruitCostMultiplier ?? 1) * away);
  const rule = tables.roster.find((r) => r.id === m.id)?.unlock;
  const progress = rule && unlockProgress(state, rule);
  return {
    eligible: !!faction,
    cost,
    unlock: rule,
    progress,
    unlocked: !progress || progress.current >= progress.required,
  };
}

/** 계약자의 기본 스탯(레벨 1): 계약자별 baseStats, 없으면 역할 기본값 */
export function mercBaseStats(tables: GameTables, m: MercenaryState): Stats {
  return tables.roster.find((r) => r.id === m.id)?.baseStats ?? roleBaseStats(tables, m.role);
}

/** 계약자의 레벨당 성장률(roster.json growthRates, 지시서 021). 값이 없으면 undefined(기본 성장률) */
export const mercGrowthRates = (tables: GameTables, m: { id: string }): GrowthRates | undefined => tables.roster.find((r) => r.id === m.id)?.growthRates;

/** 계약자의 특성 슬롯 목록(roster.json traits) */
export const mercTraitIds = (tables: GameTables, m: MercenaryState): string[] => tables.roster.find((r) => r.id === m.id)?.traits ?? [];

/** 계약자의 액티브 스킬 3개(roster.json skills, 명단에 없으면 역할 풀의 앞 3개, 지시서 020) */
export const mercSkillIds = (tables: GameTables, m: { id: string; role: string }): string[] =>
  tables.roster.find((r) => r.id === m.id)?.skills ?? roleDefaultSkills(tables, m.role, MERC_ACTIVE_COUNT).slice(1);

/**
 * 레벨 성장과 충성도 배율까지 적용한 스탯(특성 전). 충성도 구간 배율은 공격·방어(물리·에너지 모두)에 곱한다.
 */
export function loyaltyAdjustedStats(tables: GameTables, m: MercenaryState): Stats {
  const stats = statsAtLevel(tables, mercBaseStats(tables, m), m.level, 1, mercGrowthRates(tables, m));
  if (!m.loyalty) return stats;
  const bonus = loyaltyTier(tables, m.loyalty.value).statBonus;
  const out = { ...stats };
  for (const k of ['pAtk', 'eAtk', 'pDef', 'eDef'] as const) out[k] = Math.round(stats[k] * (1 + bonus) * 100) / 100;
  return out;
}

export function mercToUnit(tables: GameTables, m: MercenaryState): Unit {
  const role = tables.roles.find((r) => r.id === m.role);
  if (!role) throw new GameError(`없는 역할: ${m.role}`);
  return {
    id: m.id,
    name: m.name,
    element: m.element,
    role: m.role,
    level: m.level,
    stats: loyaltyAdjustedStats(tables, m),
    traits: activeTraits(tables, mercTraitIds(tables, m), m.level, m.traitRanks),
    skills: [role.basicSkill, ...mercSkillIds(tables, m)],
    affiliation: m.affiliation,
    ai: 'default',
    usesLoyalty: !!m.loyalty,
    world: m.profile.world,
    race: m.profile.race,
    usesGrowth: true,
    usesInjury: true,
  };
}

// ── 새 게임 ───────────────────────────────────────────

function spawnRiftInto(
  tables: GameTables,
  state: GameState,
  cityId: string,
  rngSeed: string,
  fixed?: { tier: string; grade?: string },
): Rift {
  state.counters.rift += 1;
  // 같은 도시에서 지금 활성인 리프트(목록과 파견 중) 이름과 겹치지 않게 한다.
  const taken = [...state.rifts, ...state.expeditions.map((e) => e.rift)].filter((r) => r.cityId === cityId).map((r) => r.name);
  const rift = generateRift(tables, cityId, state.day, `r${state.counters.rift}`, createRng(rngSeed), fixed, taken);
  state.rifts.push(rift);
  return rift;
}

export function newGame(tables: GameTables, opts: NewGameOptions): GameState {
  if (!tables.cities.some((c) => c.id === opts.baseCityId)) throw new GameError(`없는 도시: ${opts.baseCityId}`);
  const name = opts.guildName.trim();
  if (!name) throw new GameError('길드 이름이 비어 있다');

  const mercenaries: MercenaryState[] = tables.roster.map((r) => ({
    id: r.id,
    name: r.name,
    element: r.element,
    role: r.role,
    level: r.initialLevel,
    exp: 0,
    growth: { ...r.growth },
    initialLevel: r.initialLevel,
    profile: { age: r.age, gender: r.gender, hometown: r.hometown, background: r.background, world: r.world, race: r.race },
    affiliation: r.faction === 'guild' ? { kind: 'guild' } : { kind: 'faction', factionId: r.faction },
    loyalty: newLoyalty(tables),
  }));

  // 플레이어는 길드 마스터 전용(지시서 022): 시작 후보 4명이 모두 시작 계약자다
  const p = opts.protagonist;
  if (!p.name.trim()) throw new GameError('마스터 이름이 비어 있다');
  const protagonist: Protagonist = { name: p.name.trim(), background: p.background ?? tables.progression.masterBackground };

  const state: GameState = {
    seed: opts.seed,
    day: 1,
    guildName: name,
    baseCityId: opts.baseCityId,
    protagonist,
    resources: { ...tables.progression.startingResources, materials: {} },
    mercenaries,
    rifts: [],
    expeditions: [],
    reports: [],
    stabilizedRoutes: [],
    counters: { rift: 0, expedition: 0 },
    records: { victories: 0, victoriesByTier: {} },
    facilities: initialFacilities(tables),
    settings: { autoOuter: tables.outerMissions.autoOuterDefault },
  };
  for (const city of tables.cities) {
    for (let i = 0; i < city.riftSpawn.initialCount; i++) {
      spawnRiftInto(tables, state, city.id, `${state.seed}:init:${city.id}:${i}`, city.riftSpawn.initialGuaranteed[i]);
    }
  }
  return state;
}

// ── 행동 ──────────────────────────────────────────────

/** 리프트에 파티를 보낸다. 출발은 마감일까지 가능하고, 보낸 리프트는 목록에서 빠진다. */
export function dispatch(tables: GameTables, prev: GameState, riftId: string, party: PartyMember[]): GameState {
  const state = structuredClone(prev);
  const rift = state.rifts.find((r) => r.id === riftId);
  if (!rift) throw new GameError('리프트가 없거나 이미 파견 중이다');
  const travel = travelDays(tables, state.baseCityId, rift.cityId);
  if (rift.deadlineDay !== null && state.day + travel > rift.deadlineDay) {
    throw new GameError(travel ? '이동하는 동안 마감이 지난다' : '마감이 지난 리프트다');
  }
  for (const p of party) {
    const m = getMerc(state, p.mercId);
    if (!isGuildMember(m)) throw new GameError(`${m.name}은(는) 길드 소속이 아니다`);
    if (m.injury) throw new GameError(`${m.name}은(는) 부상 중이다`);
    if (isOnExpedition(state, m.id)) throw new GameError(`${m.name}은(는) 이미 파견 중이다`);
    if (refusedToday(state, m)) throw new GameError(`${m.name}은(는) 오늘 파견을 거부했다`);
    const placed = assignedFacility(state.facilities, m.id);
    if (placed) throw new GameError(`${m.name}은(는) ${getFacility(tables, placed).name}에 배치되어 있다`);
  }
  const slots: CombatSlot[] = party.map((p) => ({ unit: mercToUnit(tables, getMerc(state, p.mercId)), row: p.row }));
  const errors = validateParty(tables, slots);
  if (errors.length) throw new GameError(errors.join(', '));

  state.counters.expedition += 1;
  state.expeditions.push({
    id: `x${state.counters.expedition}`,
    rift,
    party: party.map((p) => ({ ...p })),
    departDay: state.day,
    travelDays: travel,
    returnDay: state.day + travel * 2 + rift.durationDays,
  });
  state.rifts = state.rifts.filter((r) => r.id !== riftId);
  return state;
}

/** 아르케를 써서 레벨을 올린다. 경험치가 다 찼고 성장 한계 아래여야 한다. */
export function levelUp(tables: GameTables, prev: GameState, mercId: string): GameState {
  const state = structuredClone(prev);
  const m = getMerc(state, mercId);
  if (!isGuildMember(m)) throw new GameError(`길드 ${tables.terms.merc}만 키울 수 있다`);
  // 부상 중에는 레벨업할 수 있고, 파견 중에는 복귀할 때까지 할 수 없다(2026-11-20 확정).
  if (isOnExpedition(state, m.id)) throw new GameError(LEVEL_UP_BLOCKED_ON_EXPEDITION);
  if (m.level >= m.growth.cap) throw new GameError('성장 한계에 도달했다');
  const need = expToNextLevel(tables, m.level);
  if (m.exp < need) throw new GameError('경험치가 부족하다');
  const cost = levelUpCost(tables, m.level);
  if (state.resources.arche < cost) throw new GameError('아르케가 부족하다');
  state.resources.arche -= cost;
  m.exp -= need;
  m.level += 1;
  return state;
}

export interface LevelUpStep {
  mercId: string;
  from: number;
  to: number;
  cost: number;
  /** 이 레벨업으로 새로 열린 특성 id(지시서 016) */
  newTraits: string[];
}

/** 계약자가 from → to 레벨로 오를 때 새로 열린 특성 id */
export function newTraitsOnLevelUp(tables: GameTables, m: MercenaryState, from: number, to: number): string[] {
  return newlyUnlockedTraits(tables, mercTraitIds(tables, m), from, to);
}

/**
 * 일괄 레벨업(지시서 012). 매번 "지금 레벨업할 수 있는 용병 중 레벨이 가장 낮은 한 명(같으면 id 순)"을
 * 한 단계 올리고, 더 할 수 없을 때까지 반복한다. 기존 canLevelUp·levelUp을 그대로 써서 규칙이 같다.
 */
export function levelUpAll(tables: GameTables, prev: GameState): { state: GameState; steps: LevelUpStep[] } {
  let state = prev;
  const steps: LevelUpStep[] = [];
  for (;;) {
    const next = state.mercenaries
      .filter((m) => canLevelUp(tables, state, m.id))
      .sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (!next) break;
    const cost = levelUpCost(tables, next.level);
    state = levelUp(tables, state, next.id);
    steps.push({ mercId: next.id, from: next.level, to: next.level + 1, cost, newTraits: newTraitsOnLevelUp(tables, next, next.level, next.level + 1) });
  }
  return { state, steps };
}

export const LEVEL_UP_BLOCKED_ON_EXPEDITION = '파견 중에는 레벨업할 수 없음';

export function canLevelUp(tables: GameTables, state: GameState, mercId: string): boolean {
  const m = getMerc(state, mercId);
  return (
    isGuildMember(m) &&
    !isOnExpedition(state, m.id) &&
    m.level < m.growth.cap &&
    m.exp >= expToNextLevel(tables, m.level) &&
    state.resources.arche >= levelUpCost(tables, m.level)
  );
}

// ── 거점 시설 ────────────────────────────────────────

/** 다음 레벨 건설·강화를 시작할 수 없는 이유(가능하면 null) */
export function constructionBlockReason(tables: GameTables, state: GameState, facilityId: string): string | null {
  const f = getFacility(tables, facilityId);
  const next = facilityLevel(state.facilities, facilityId) + 1;
  if (next > f.maxLevel) return '최대 레벨';
  if (state.facilities.construction) return '다른 시설을 건설·강화 중';
  if (state.resources.zero < levelCost(tables, facilityId, next).zero) return '제로 부족';
  return null;
}

/** 건설·강화 시작: 제로를 즉시 내고, 완료일이 되면 하루 정산에서 레벨이 오른다. 한 번에 한 시설만, 취소 없음. */
export function startConstruction(tables: GameTables, prev: GameState, facilityId: string): GameState {
  const reason = constructionBlockReason(tables, prev, facilityId);
  if (reason) throw new GameError(reason);
  const state = structuredClone(prev);
  const target = facilityLevel(state.facilities, facilityId) + 1;
  const cost = levelCost(tables, facilityId, target);
  state.resources.zero -= cost.zero;
  state.facilities.construction = { facilityId, targetLevel: target, startDay: state.day, completeDay: state.day + cost.days };
  return state;
}

/** 시설에 배치할 수 없는 이유(가능하면 null). 배치는 시설 종류에 묶이지 않고 칸 수로만 제한한다. */
export function assignBlockReason(tables: GameTables, state: GameState, facilityId: string, mercId: string): string | null {
  const m = getMerc(state, mercId);
  if (!isGuildMember(m)) return '길드 소속이 아님';
  if (m.injury) return '부상 중';
  if (isOnExpedition(state, mercId)) return '파견 중';
  const other = assignedFacility(state.facilities, mercId);
  if (other) return other === facilityId ? '이미 배치됨' : '다른 시설에 배치됨';
  const slots = facilitySlots(tables, state.facilities, facilityId);
  if ((state.facilities.assignments[facilityId] ?? []).length >= slots) return slots === 0 ? '배치할 수 없는 시설' : '칸이 가득 참';
  return null;
}

export function assignToFacility(tables: GameTables, prev: GameState, facilityId: string, mercId: string): GameState {
  const reason = assignBlockReason(tables, prev, facilityId, mercId);
  if (reason) throw new GameError(reason);
  const state = structuredClone(prev);
  state.facilities.assignments[facilityId] = [...(state.facilities.assignments[facilityId] ?? []), mercId];
  return state;
}

/** 배치 해제는 즉시. 그날 하루 끝에 배치되어 있지 않으면 훈련 경험치를 받지 않고 쉰 날로 센다. */
export function unassignFromFacility(prev: GameState, facilityId: string, mercId: string): GameState {
  const state = structuredClone(prev);
  state.facilities.assignments[facilityId] = (state.facilities.assignments[facilityId] ?? []).filter((id) => id !== mercId);
  return state;
}

export function salaryBonusCost(tables: GameTables, m: MercenaryState): number {
  return tables.loyalty.salaryBonus.costPerLevel * m.level;
}

/** 급료 보너스: 제로를 더 지급해 충성도를 올린다. 용병당 하루 1회. */
export function paySalaryBonus(tables: GameTables, prev: GameState, mercId: string): GameState {
  const state = structuredClone(prev);
  const m = getMerc(state, mercId);
  if (!isGuildMember(m) || !m.loyalty) throw new GameError(`충성도가 있는 길드 ${tables.terms.merc}에게만 줄 수 있다`);
  if (m.loyalty.bonusDay === state.day) throw new GameError('오늘은 이미 급료 보너스를 줬다');
  const cost = salaryBonusCost(tables, m);
  if (state.resources.zero < cost) throw new GameError('제로가 부족하다');
  state.resources.zero -= cost;
  m.loyalty.bonusDay = state.day;
  applyLoyalty(tables, m.loyalty, m.profile.background, 'salaryBonus', state.day);
  return state;
}

/** NPC 세력 소속 용병을 제로로 영입한다. 해금 조건이 있으면 채운 뒤에만 영입할 수 있다. 영입하면 소속이 길드로 바뀐다. */
export function recruit(tables: GameTables, prev: GameState, mercId: string): GameState {
  const state = structuredClone(prev);
  const m = getMerc(state, mercId);
  const info = recruitInfo(tables, state, mercId);
  if (!info.eligible) throw new GameError('영입 대상이 아니다');
  if (!info.unlocked) throw new GameError('해금 조건을 채우지 않았다');
  if (state.resources.zero < info.cost) throw new GameError('제로가 부족하다');
  state.resources.zero -= info.cost;
  m.affiliation = { kind: 'guild' };
  // 다시 영입하면 충성도는 시작값으로 돌아간다.
  m.loyalty = newLoyalty(tables);
  return state;
}

// ── 하루 진행 ─────────────────────────────────────────

function settleExpedition(tables: GameTables, state: GameState, ex: Expedition): ExpeditionReport {
  const combatSeed = `${state.seed}:${ex.id}`;
  const units = ex.party.map((p) => mercToUnit(tables, getMerc(state, p.mercId)));
  const result = resolveCombat(tables, {
    allies: ex.party.map((p, i) => ({ unit: units[i], row: p.row })),
    enemies: riftEnemySlots(tables, ex.rift),
    seed: combatSeed,
  });
  const outcome = result.outcome;

  if (outcome === 'victory') {
    state.records.victories += 1;
    state.records.victoriesByTier[ex.rift.tier] = (state.records.victoriesByTier[ex.rift.tier] ?? 0) + 1;
  }
  const reward = riftReward(tables, ex.rift, outcome);
  state.resources.zero += reward.zero;
  state.resources.arche += reward.arche;
  for (const [k, v] of Object.entries(reward.materials)) state.resources.materials[k] = (state.resources.materials[k] ?? 0) + v;

  // 경험치는 총량을 파티원이 나눠 갖는다(인원이 적으면 한 명당 몫이 늘고, 상한이 있다).
  const shareExp = expShare(tables, ex.rift, outcome, ex.party.length);
  const expGains: ExpGain[] = ex.party.map((p) => {
    const m = getMerc(state, p.mercId);
    const exp = shareExp;
    m.exp += exp;
    return { mercId: m.id, exp };
  });

  // 의무실 효과는 새로 입은 부상에만 적용한다(이미 부상 중인 용병에게 소급하지 않음).
  const injuries = rollInjuries(
    tables,
    units,
    result.downedUnitIds,
    outcome,
    createRng(`${combatSeed}:injury`),
    injuryReductionDays(tables, state.facilities),
    riftModifiers(tables, ex.rift).injuryDays,
  );
  for (const inj of injuries) {
    getMerc(state, inj.unitId).injury = { severity: inj.severity, recoverDay: state.day + inj.days + 1 };
  }

  const stabilized = outcome === 'victory' && !ex.rift.stable && getRiftTier(tables, ex.rift.tier).stabilizes;
  if (stabilized) {
    // 항로를 이기면 마감 없는 안정화된 통로로 남는다.
    state.stabilizedRoutes.push({ riftId: ex.rift.id, name: ex.rift.name, day: state.day });
    state.rifts.push({ ...ex.rift, stable: true, deadlineDay: null });
  } else if (ex.rift.stable) {
    state.rifts.push(ex.rift);
  } else if (outcome !== 'victory' && (ex.rift.deadlineDay === null || ex.rift.deadlineDay >= state.day)) {
    // 실패하면 마감이 남은 리프트는 목록으로 돌아온다.
    state.rifts.push(ex.rift);
  }

  return {
    expeditionId: ex.id,
    rift: ex.rift,
    party: ex.party,
    day: state.day,
    outcome,
    rounds: result.rounds,
    combatSeed,
    events: result.events,
    reward,
    expGains,
    injuries,
    stabilized,
  };
}

/**
 * 하루를 넘긴다. 순서: 훈련 경험치 → 날짜 +1 → 공사 완료 → 부상 회복 → 복귀한 파견 정산(보상) → 유지비 → 충성도 정산·이탈 → 마감 지난 리프트 소멸 → 라이벌 선점 → 새 리프트 출현.
 */
export function advanceDay(tables: GameTables, prev: GameState): { state: GameState; events: DayEvent[] } {
  const state = structuredClone(prev);
  const events: DayEvent[] = [];
  const cfg = tables.loyalty;
  // 충성도는 데이터가 정한 소속(지금은 길드)의 용병만 시뮬레이션한다.
  const simulated = (m: MercenaryState) => !!m.loyalty && isLoyaltySimulated(tables, m.affiliation);
  // 오늘(넘기기 전 날짜) 쉰 용병 = 파견 중도 부상 중도 아닌 용병(거부한 날도 쉰 날)
  const simulatedIds = state.mercenaries.filter(simulated).map((m) => m.id);
  // 훈련소 등 시설에 배치된 날은 쉰 날이 아니다(충성도 변동 없음, 연속 쉰 일수 0).
  const restedIds = new Set(
    state.mercenaries
      .filter((m) => simulated(m) && !m.injury && !isOnExpedition(state, m.id) && !assignedFacility(state.facilities, m.id))
      .map((m) => m.id),
  );
  // ── 외곽 임무(지시서 022): 쉬는 길드 계약자를 자동 배치한다(설정이 켜져 있을 때). 간 사람은 쉰 날이 아니다.
  const outer = state.settings.autoOuter
    ? planOuterMissions(
        tables,
        state.seed,
        state.day,
        state.mercenaries
          .filter((m) => isGuildMember(m) && !m.injury && !isOnExpedition(state, m.id) && !assignedFacility(state.facilities, m.id))
          .map((m) => ({ id: m.id, level: m.level, cap: m.growth.cap, loyaltyValue: m.loyalty?.value })),
      )
    : [];
  const outerIds = new Set(outer.map((r) => r.mercId));
  for (const r of outer) {
    const m = getMerc(state, r.mercId);
    m.exp += r.exp;
    state.resources.zero += r.zero;
    state.resources.arche += r.arche;
  }
  // 훈련 경험치: 오늘(넘기기 전 날짜) 배치된 용병이 하루 정산에서 받는다. 성장 한계면 받지 않는다.
  for (const [facilityId, ids] of Object.entries(state.facilities.assignments)) {
    const exp = trainingExp(tables, state.facilities, facilityId);
    if (exp <= 0) continue;
    for (const id of ids) {
      const m = getMerc(state, id);
      if (m.level >= m.growth.cap) continue;
      m.exp += exp;
      events.push({ type: 'trained', facilityId, mercId: id, exp });
    }
  }
  const tierBefore = new Map(state.mercenaries.filter(simulated).map((m) => [m.id, loyaltyTier(tables, m.loyalty!.value).id]));


  state.day += 1;

  // 건설·강화 완료(완료일이 된 날 시작에 레벨이 오른다)
  const job = state.facilities.construction;
  if (job && state.day >= job.completeDay) {
    state.facilities.levels[job.facilityId] = job.targetLevel;
    state.facilities.construction = null;
    events.push({ type: 'facilityBuilt', facilityId: job.facilityId, level: job.targetLevel });
  }

  for (const m of state.mercenaries) {
    if (!m.injury) continue;
    if (state.day >= m.injury.recoverDay) {
      delete m.injury;
      events.push({ type: 'recovered', mercId: m.id });
    }
  }

  const returning = state.expeditions.filter((e) => e.returnDay <= state.day);
  state.expeditions = state.expeditions.filter((e) => e.returnDay > state.day);
  for (const ex of returning) {
    const report = settleExpedition(tables, state, ex);
    state.reports.push(report);
    events.push({ type: 'returned', expeditionId: ex.id, outcome: report.outcome });
  }
  // ── 유지비(지시서 014): 복귀 보상을 먼저 받은 뒤 낸다(이긴 날 보상으로 그날 유지비를 낼 수 있다).
  // 돈이 모자라면 충성도가 낮은 용병부터 낸다(같으면 id 순, 충성도가 없으면 맨 뒤). 못 낸 몫은 미납으로 기록한다.
  // 충성도는 이 시점 값(오늘의 충성도 정산 전)으로 정렬한다.
  let paid = 0;
  let unpaid = 0;
  const unpaidMercIds: string[] = [];
  const payOrder = state.mercenaries
    .filter(isGuildMember)
    .sort((a, b) => (a.loyalty?.value ?? Infinity) - (b.loyalty?.value ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const m of payOrder) {
    const fee = upkeepPerDay(tables, m);
    if (fee <= 0) continue;
    if (state.resources.zero >= fee) {
      state.resources.zero -= fee;
      paid += fee;
    } else {
      unpaid += fee;
      unpaidMercIds.push(m.id);
      m.unpaidUpkeep = { days: (m.unpaidUpkeep?.days ?? 0) + 1, zero: (m.unpaidUpkeep?.zero ?? 0) + fee };
    }
  }
  if (paid || unpaid) events.push({ type: 'upkeep', paid, unpaid, unpaidMercIds });
  // ── 충성도 정산(하루가 끝날 때 한꺼번에): 변동 적용 → 위험 연속 일수 갱신 → 이탈 판정
  const changeDay = state.day;
  for (const ex of returning) {
    const report = state.reports.find((r) => r.expeditionId === ex.id)!;
    const hard = ex.rift.enemies.some((e) => cfg.hardRiftGrades.includes(e.grade));
    for (const p of ex.party) {
      const m = getMerc(state, p.mercId);
      if (!m.loyalty || !simulatedIds.includes(m.id)) continue;
      if (report.outcome === 'victory') applyLoyalty(tables, m.loyalty, m.profile.background, 'victory', changeDay, hard);
      else if (report.outcome === 'defeat') applyLoyalty(tables, m.loyalty, m.profile.background, 'defeat', changeDay);
      if (report.injuries.some((i) => i.unitId === m.id)) applyLoyalty(tables, m.loyalty, m.profile.background, 'injury', changeDay);
    }
  }
  // 외곽 임무: 경상(기존 부상 규칙·injury 변동)과 성향별 불만. 쉬는 날·노는 날로 세지 않고 연속 쉰 일수는 그대로 둔다.
  const outerResults: (OuterResult & { loyaltyDelta: number })[] = [];
  for (const r of outer) {
    const m = getMerc(state, r.mercId);
    let outerDelta = 0;
    if (r.injuryDays !== undefined) {
      m.injury = { severity: tables.outerMissions.injury.severity, recoverDay: state.day + r.injuryDays + 1 };
      if (m.loyalty && simulatedIds.includes(m.id)) applyLoyalty(tables, m.loyalty, m.profile.background, 'injury', changeDay);
    }
    // 변동이 0인 성향은 기록도 남기지 않는다
    if (m.loyalty && simulatedIds.includes(m.id) && loyaltyDelta(tables, m.profile.background, 'outerMission') !== 0) {
      outerDelta = applyLoyalty(tables, m.loyalty, m.profile.background, 'outerMission', changeDay);
    }
    outerResults.push({ ...r, loyaltyDelta: outerDelta });
  }
  if (outerResults.length) events.push({ type: 'outerMission', results: outerResults });
  // 쉰 날: 연속 쉰 일수가 restMaxDays 이하면 쉬는 날 상승, 넘기면 대기 하락. 파견·부상이면 연속 일수 0.
  for (const id of simulatedIds) {
    const m = getMerc(state, id);
    if (!m.loyalty) continue;
    if (outerIds.has(id)) continue;
    if (!restedIds.has(id)) {
      m.loyalty.restStreak = 0;
      continue;
    }
    m.loyalty.restStreak += 1;
    const key = m.loyalty.restStreak <= cfg.restMaxDays ? 'restDay' : 'idleDecay';
    applyLoyalty(tables, m.loyalty, m.profile.background, key, changeDay);
  }
  for (const id of unpaidMercIds) {
    const m = getMerc(state, id);
    if (m.loyalty && simulatedIds.includes(id)) applyLoyalty(tables, m.loyalty, m.profile.background, 'unpaidDay', changeDay);
  }
  for (const m of state.mercenaries) {
    if (!m.loyalty || !simulatedIds.includes(m.id)) continue;
    const tier = loyaltyTier(tables, m.loyalty.value).id;
    m.loyalty.dangerDays = tier === cfg.departure.tier ? m.loyalty.dangerDays + 1 : 0;
    const before = tierBefore.get(m.id);
    if (before && before !== tier) events.push({ type: 'loyaltyTier', mercId: m.id, from: before, to: tier });
  }
  // 위험 구간이 정해진 일수만큼 이어진 뒤부터 하루가 끝날 때마다 확률로 이탈. 파견 중이면 복귀할 때까지 제외.
  for (const m of state.mercenaries) {
    if (!m.loyalty || !simulatedIds.includes(m.id) || m.loyalty.dangerDays <= cfg.departure.afterConsecutiveDays) continue;
    if (cfg.departure.excludeOnExpedition && isOnExpedition(state, m.id)) continue;
    if (!createRng(`${state.seed}:depart:${state.day}:${m.id}`).chance(cfg.departure.chance)) continue;
    // 이탈하면 무소속으로 옮기고 충성도는 시작값으로 되돌려 보관한다.
    m.affiliation = { kind: 'faction', factionId: cfg.departure.toFaction };
    m.loyalty = newLoyalty(tables);
    m.departedDay = state.day;
    events.push({ type: 'departed', mercId: m.id, factionId: cfg.departure.toFaction });
  }

  // 배치 정리: 길드를 떠났거나 부상·파견 중이거나 칸이 줄어든 배치는 자동으로 해제한다.
  for (const [facilityId, ids] of Object.entries(state.facilities.assignments)) {
    const keep: string[] = [];
    for (const id of ids) {
      const m = getMerc(state, id);
      const reason = !isGuildMember(m) ? '이탈' : m.injury ? '부상' : isOnExpedition(state, id) ? '파견' : keep.length >= facilitySlots(tables, state.facilities, facilityId) ? '칸 부족' : '';
      if (reason) events.push({ type: 'unassigned', facilityId, mercId: id, reason });
      else keep.push(id);
    }
    state.facilities.assignments[facilityId] = keep;
  }

  // ── 무소속 용병의 다른 세력 영입 이동(하루가 끝날 때, 이탈 판정 뒤). 영구 소멸 없음.
  const poach = tables.poaching;
  for (const m of state.mercenaries) {
    if (m.affiliation.kind !== 'faction' || !poach.fromFactions.includes(m.affiliation.factionId)) continue;
    if (m.departedDay !== undefined && state.day - m.departedDay <= poach.protectionDaysAfterDeparture) continue;
    const prng = createRng(`${state.seed}:poach:${state.day}:${m.id}`);
    if (!prng.chance(poach.dailyChance)) continue;
    const targets = tables.factions.filter((f) => !poach.excludeTargets.includes(f.id));
    if (targets.length === 0) continue;
    // 가중치: 용병 고향 도시에서의 세력 영향력. 모두 0이면(또는 고향 없음) 동률.
    const weights = targets.map((f) => Math.max(0, f.cityInfluence[m.profile.hometown ?? ''] ?? 0));
    const total = weights.reduce((a, w) => a + w, 0);
    let roll = prng.next() * (total > 0 ? total : targets.length);
    let to = targets[targets.length - 1];
    for (let i = 0; i < targets.length; i++) {
      roll -= total > 0 ? weights[i] : 1;
      if (roll < 0) {
        to = targets[i];
        break;
      }
    }
    const from = m.affiliation.factionId;
    m.affiliation = { kind: 'faction', factionId: to.id };
    events.push({ type: 'poached', mercId: m.id, fromFactionId: from, toFactionId: to.id, wasDeparted: m.departedDay !== undefined });
  }

  const limit = tables.progression.reportHistoryLimit;
  state.reports.forEach((r, i) => {
    if (i < state.reports.length - limit) delete r.events;
  });

  const expired = state.rifts.filter((r) => r.deadlineDay !== null && r.deadlineDay < state.day);
  state.rifts = state.rifts.filter((r) => !expired.includes(r));
  for (const r of expired) events.push({ type: 'riftExpired', riftId: r.id, name: r.name });

  // ── 라이벌 선점(마감 만료 뒤, 새 리프트 출현 전). 그날 생긴 리프트와 파견이 출발한 리프트는 판정하지 않는다.
  const preempted = rollPreemption(tables, state, state.day);
  state.rifts = state.rifts.filter((r) => !preempted.includes(r));
  for (const r of preempted) events.push({ type: 'preempted', riftId: r.id, name: r.name, cityId: r.cityId, factionId: r.territoryFactionId });

  const rng = createRng(`${state.seed}:day${state.day}`);
  for (const city of tables.cities) {
    const rolls = city.riftSpawn.dailySpawnRolls ?? 1;
    for (let i = 0; i < rolls; i++) {
      const active = state.rifts.filter((r) => r.cityId === city.id).length;
      if (active < city.riftSpawn.maxActive && rng.chance(city.riftSpawn.dailySpawnChance)) {
        // 첫 판정의 시드는 이전과 같게 둔다.
        const rift = spawnRiftInto(tables, state, city.id, `${state.seed}:day${state.day}:${city.id}${i ? `:${i}` : ''}`);
        events.push({ type: 'riftSpawned', riftId: rift.id, cityId: city.id });
      }
    }
  }

  // ── 새 날이 시작될 때 거부 판정을 미리 한다(시드 = 세이브 시드, 날짜, 용병 id). 그날 편성 화면에서 보인다.
  for (const m of state.mercenaries) {
    if (!m.loyalty || !isLoyaltySimulated(tables, m.affiliation) || m.injury || isOnExpedition(state, m.id)) continue;
    const chance = loyaltyTier(tables, m.loyalty.value).refuseChance;
    if (chance > 0 && createRng(`${state.seed}:refuse:${state.day}:${m.id}`).chance(chance)) {
      m.loyalty.refusedOnDay = state.day;
      events.push({ type: 'refused', mercId: m.id });
    }
  }

  return { state, events };
}
