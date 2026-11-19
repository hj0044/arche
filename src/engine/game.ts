import { getRiftTier, travelDays, type GameTables, type Outcome, type Row } from '../data';
import { resolveCombat, validateParty, type CombatEvent, type CombatSlot } from './combat';
import { rollInjuries, type Injury } from './injury';
import { generateRift, riftEnemySlots, type Rift, type RiftReward } from './rift';
import { createRng } from './rng';
import { statsForLevel, type Affiliation, type Unit } from './unit';

export class GameError extends Error {}

export interface MercenaryState {
  id: string;
  name: string;
  element: string;
  role: string;
  level: number;
  /** 다음 레벨까지 쌓인 경험치 */
  exp: number;
  /** 개별 성장 수치. cap: 성장 한계(최대 레벨), speed: 성장 속도(경험치 배율) */
  growth: { cap: number; speed: number };
  affiliation: Affiliation;
  /** recoverDay가 되면 회복한다. 복귀 당일은 부상 일수에 세지 않는다. */
  injury?: { severity: string; recoverDay: number };
  isProtagonist?: boolean;
}

export type ProtagonistSetup =
  | { mode: 'opener'; name: string; element: string; role: string; background: string }
  | { mode: 'guildMaster'; name: string; background: string };

export interface Protagonist {
  mode: 'opener' | 'guildMaster';
  name: string;
  /** 1단계는 저장만 하고 효과 없음 */
  background: string;
  /** 개방자 모드일 때 전투에 참여하는 용병 id */
  mercId?: string;
}

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
}

export type DayEvent =
  | { type: 'recovered'; mercId: string }
  | { type: 'returned'; expeditionId: string; outcome: Outcome }
  | { type: 'riftExpired'; riftId: string; name: string }
  | { type: 'riftSpawned'; riftId: string; cityId: string };

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
  return isGuildMember(m) && !m.injury && !isOnExpedition(state, mercId);
}

export function expToNextLevel(tables: GameTables, level: number): number {
  const { base, perLevel } = tables.progression.expToNextLevel;
  return base + perLevel * (level - 1);
}

export function levelUpCost(tables: GameTables, level: number): number {
  const { base, perLevel } = tables.progression.levelUpArcheCost;
  return base + perLevel * (level - 1);
}

export function recruitCost(tables: GameTables, level: number): number {
  const { base, perLevel } = tables.progression.recruitZeroCost;
  return base + perLevel * (level - 1);
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
    stats: statsForLevel(tables, m.role, m.level),
    skills: [...role.skills],
    affiliation: m.affiliation,
    ai: 'default',
    usesGrowth: true,
    usesInjury: true,
  };
}

// ── 새 게임 ───────────────────────────────────────────

const PROTAGONIST_ID = 'hero';

function spawnRiftInto(tables: GameTables, state: GameState, cityId: string, rngSeed: string): Rift {
  state.counters.rift += 1;
  const rift = generateRift(tables, cityId, state.day, `r${state.counters.rift}`, createRng(rngSeed));
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
    affiliation: r.faction === 'guild' ? { kind: 'guild' } : { kind: 'faction', factionId: r.faction },
  }));

  const p = opts.protagonist;
  const protagonist: Protagonist = { mode: p.mode, name: p.name, background: p.background };
  if (p.mode === 'opener') {
    const role = tables.roles.find((r) => r.id === p.role);
    if (!role?.enabled) throw new GameError(`고를 수 없는 역할: ${p.role}`);
    if (!tables.elements.some((e) => e.id === p.element)) throw new GameError(`없는 속성: ${p.element}`);
    const g = tables.progression.protagonistGrowth;
    mercenaries.unshift({
      id: PROTAGONIST_ID,
      name: p.name,
      element: p.element,
      role: p.role,
      level: g.initialLevel,
      exp: 0,
      growth: { cap: g.cap, speed: g.speed },
      affiliation: { kind: 'guild' },
      isProtagonist: true,
    });
    protagonist.mercId = PROTAGONIST_ID;
  }

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
  };
  for (const city of tables.cities) {
    for (let i = 0; i < city.riftSpawn.initialCount; i++) {
      spawnRiftInto(tables, state, city.id, `${state.seed}:init:${city.id}:${i}`);
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
  if (!isGuildMember(m)) throw new GameError('길드 용병만 키울 수 있다');
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

export function canLevelUp(tables: GameTables, state: GameState, mercId: string): boolean {
  const m = getMerc(state, mercId);
  return (
    isGuildMember(m) &&
    m.level < m.growth.cap &&
    m.exp >= expToNextLevel(tables, m.level) &&
    state.resources.arche >= levelUpCost(tables, m.level)
  );
}

/** 영입 대상 풀(무소속)의 용병을 제로로 영입한다. */
export function recruit(tables: GameTables, prev: GameState, mercId: string): GameState {
  const state = structuredClone(prev);
  const m = getMerc(state, mercId);
  const aff = m.affiliation;
  const inPool = aff.kind === 'faction' && tables.factions.some((f) => f.id === aff.factionId && f.recruitPool);
  if (!inPool) throw new GameError('영입 대상이 아니다');
  const cost = recruitCost(tables, m.level);
  if (state.resources.zero < cost) throw new GameError('제로가 부족하다');
  state.resources.zero -= cost;
  m.affiliation = { kind: 'guild' };
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
  const prog = tables.progression;
  const outcome = result.outcome;

  const ratio = prog.rewardRatioByOutcome[outcome] * (ex.rift.stable ? prog.stablePassageRewardRatio : 1);
  const reward: RiftReward = {
    zero: Math.floor(ex.rift.reward.zero * ratio),
    arche: Math.floor(ex.rift.reward.arche * ratio),
    materials: Object.fromEntries(
      Object.entries(ex.rift.reward.materials)
        .map(([k, v]) => [k, Math.floor(v * ratio)] as const)
        .filter(([, v]) => v > 0),
    ),
  };
  state.resources.zero += reward.zero;
  state.resources.arche += reward.arche;
  for (const [k, v] of Object.entries(reward.materials)) state.resources.materials[k] = (state.resources.materials[k] ?? 0) + v;

  const tierMult = prog.expTierMultiplier[ex.rift.tier] ?? 1;
  const expGains: ExpGain[] = ex.party.map((p) => {
    const m = getMerc(state, p.mercId);
    const exp = Math.round(prog.expByOutcome[outcome] * tierMult * m.growth.speed);
    m.exp += exp;
    return { mercId: m.id, exp };
  });

  const injuries = rollInjuries(tables, units, result.downedUnitIds, outcome, createRng(`${combatSeed}:injury`));
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
 * 하루를 넘긴다. 순서: 날짜 +1 → 부상 회복 → 복귀한 파견 정산 → 마감 지난 리프트 소멸 → 새 리프트 출현.
 */
export function advanceDay(tables: GameTables, prev: GameState): { state: GameState; events: DayEvent[] } {
  const state = structuredClone(prev);
  const events: DayEvent[] = [];
  state.day += 1;

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
  const limit = tables.progression.reportHistoryLimit;
  state.reports.forEach((r, i) => {
    if (i < state.reports.length - limit) delete r.events;
  });

  const expired = state.rifts.filter((r) => r.deadlineDay !== null && r.deadlineDay < state.day);
  state.rifts = state.rifts.filter((r) => !expired.includes(r));
  for (const r of expired) events.push({ type: 'riftExpired', riftId: r.id, name: r.name });

  const rng = createRng(`${state.seed}:day${state.day}`);
  for (const city of tables.cities) {
    const active = state.rifts.filter((r) => r.cityId === city.id).length;
    if (active < city.riftSpawn.maxActive && rng.chance(city.riftSpawn.dailySpawnChance)) {
      const rift = spawnRiftInto(tables, state, city.id, `${state.seed}:day${state.day}:${city.id}`);
      events.push({ type: 'riftSpawned', riftId: rift.id, cityId: city.id });
    }
  }

  return { state, events };
}
