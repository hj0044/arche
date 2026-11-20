// 데이터 표 진입점. 수치와 목록은 JSON에 두고 코드는 이 모듈을 통해서만 읽는다.
import citiesJson from './cities.json';
import elementsJson from './elements.json';
import rolesJson from './roles.json';
import skillsJson from './skills.json';
import statsJson from './stats.json';
import monsterGradesJson from './monster-grades.json';
import riftTiersJson from './rift-tiers.json';
import combatJson from './combat.json';
import injuriesJson from './injuries.json';
import materialsJson from './materials.json';
import progressionJson from './progression.json';
import factionsJson from './factions.json';
import monstersJson from './monsters.json';
import rosterJson from './roster.json';
import travelJson from './travel.json';
import backgroundsJson from './backgrounds.json';
import uiJson from './ui.json';
import growthSpeedsJson from './growth-speeds.json';
import worldsJson from './worlds.json';
import racesJson from './races.json';
import omensJson from './omens.json';
import savePolicyJson from './save-policy.json';
import autoPartyJson from './auto-party.json';
import saveLimitsJson from './save-limits.json';
import loyaltyJson from './loyalty.json';
import poachingJson from './poaching.json';
import facilitiesJson from './facilities.json';
import autoplayJson from './autoplay.json';
import combatPowerJson from './combat-power.json';

export type Range = [number, number];
export type StatId = 'hp' | 'atk' | 'def' | 'spd';
export type Stats = Record<StatId, number>;
export type Row = 'front' | 'back';
export type Side = 'ally' | 'enemy';

export interface CityRow {
  id: string;
  name: string;
  summary: string;
  riftSpawn: {
    maxActive: number;
    dailySpawnChance: number;
    initialCount: number;
    /** 시작 리프트 중 앞쪽을 이 리프트 등급·몬스터 등급으로 고정한다(입문용) */
    initialGuaranteed: { tier: string; grade?: string }[];
    tierWeights: Record<string, number>;
    /** 1보다 크면 등급 레벨 범위 안에서 낮은 레벨이 더 자주 나온다 */
    levelSkew: number;
  };
  recruitment: { otherHometownCostMultiplier: number };
}

export interface ElementRow { id: string; name: string; loreName: string; strongAgainst: string[] }

export interface RoleRow {
  id: string;
  name: string;
  /** 구성 보너스 판정용 분류: vanguard(전위), damage(딜러), support(지원), mobility(기동). */
  group: string;
  defaultRow: Row;
  enabled: boolean;
  /** [기본 공격, 스킬 1, 스킬 2] */
  skills: string[];
}

export type SkillKind = 'attack' | 'heal' | 'taunt' | 'buff';
export type SkillTarget = 'enemy' | 'enemyRow' | 'enemyAll' | 'self' | 'allyLowest' | 'allyAll';

export interface SkillRow {
  id: string;
  name: string;
  kind: SkillKind;
  target: SkillTarget;
  power?: number;
  hits?: number;
  cooldown: number;
  duration?: number;
  stat?: StatId;
  amount?: number;
}

export interface RoleStatRow { base: Stats }
export interface StatsTable {
  stats: { id: StatId; name: string }[];
  roleBase: Record<string, RoleStatRow>;
  /** 레벨당 복리 성장률 */
  levelGrowthRate: Stats;
}

export interface MonsterGradeRow { id: string; name: string; statMultiplier: number; level: Range }

export interface RiftTierRow {
  id: string;
  name: string;
  monsterGrades: string[];
  /** 등급 안에서 몬스터 등급을 고르는 가중치 */
  monsterGradeWeights: Record<string, number>;
  monsterLevel: Range;
  deadlineDays: Range;
  durationDays: Range;
  /** 보상 설명(화면용) */
  reward: string;
  enemyCount: Range;
  rewards: { zero: Range; arche: Range; materials: Record<string, Range> };
  /** 승리하면 항로 안정화 기록을 남긴다(1단계는 기록만). */
  stabilizes: boolean;
  names: string[];
  /** 흑막 징조 표식이 붙을 확률(연출 전용, 규칙에 영향 없음) */
  omenChance: number;
}

export interface MaterialRow { id: string; name: string; world: string; note: string }

export type Outcome = 'victory' | 'retreat' | 'defeat';

export interface ProgressionTable {
  startingResources: { zero: number; arche: number };
  expToNextLevel: { base: number; perLevel: number };
  expByOutcome: Record<Outcome, number>;
  expTierMultiplier: Record<string, number>;
  rewardRatioByOutcome: Record<Outcome, number>;
  levelUpArcheCost: { base: number; perLevel: number };
  /** 영입비 = (base + perCapAbove30 × (한계 − capBaseline) + perLevel × (레벨 − 1)) × 세력 배율 × 도시 배율 */
  recruitZeroCost: { base: number; perCapAbove30: number; perLevel: number; capBaseline: number };
  protagonistGrowth: { cap: number; speed: string; initialLevel: number };
  /** 보상 = 등급 보상 × (1 + rewardLevelScale × 몬스터 레벨) */
  rewardLevelScale: number;
  /** 경험치 = 결과별 경험치 × 등급 배율 × (1 + expLevelScale × 몬스터 레벨) */
  expLevelScale: number;
  /** 하루 유지비 = base + perLevel × 레벨 */
  upkeepZeroPerDay: { base: number; perLevel: number };
  protagonistUpkeep: boolean;
  /** 파견 경험치 나누기: 총량 = 한 명당 경험치 × basePartySize, 한 명당 몫 = 총량 ÷ 인원(상한 한 명당 × soloCapMultiplier) */
  expShare: { basePartySize: number; soloCapMultiplier: number };
  /** 개방자 모드에서 시작 길드에 합류하지 않는 후보가 들어갈 세력 id */
  openerLeftoverFaction: string;
  /** 전투 로그까지 보관하는 최근 복귀 보고 수 */
  reportHistoryLimit: number;
  /** 안정화된 통로를 다시 공략할 때 보상 배율 */
  stablePassageRewardRatio: number;
}

/** 도시 간 편도 이동 일수 */
export interface TravelTable {
  sameCityDays: number;
  defaultDays: number;
  routes: { between: string[]; days: number }[];
}

export interface FactionRow {
  id: string;
  name: string;
  type: string;
  typeName: string;
  recruitCostMultiplier: number;
  /** 도시별 영향력 비중(1단계는 표시용). 세력은 도시에 고정되지 않는다. */
  cityInfluence: Record<string, number>;
}

export interface MonsterRow { id: string; name: string; role: string; element: string; grades: string[] }

export type UnlockRule =
  | { type: 'totalVictories'; count: number }
  | { type: 'tierVictories'; tier: string; count: number };

export interface RosterRow {
  id: string;
  /** CSV 번호 */
  no: number;
  name: string;
  element: string;
  role: string;
  hometown: string;
  /** 'guild'는 플레이어 길드(시작 용병 후보), 그 밖에는 factions.json의 id */
  faction: string;
  startingCandidate: boolean;
  background: string;
  /** cap: 성장 한계(최대 레벨), speed: growth-speeds.json의 id */
  growth: { cap: number; speed: string };
  initialLevel: number;
  age: number;
  gender: string;
  /** 조합 축 "세계"(지구 개방자, 이세계인 등). 시너지는 2단계 */
  world: string;
  race: string;
  unlock?: UnlockRule;
}

export interface GrowthSpeedRow { id: string; name: string; expToNextMultiplier: number }
export interface BackgroundRow { id: string; name: string; shortName: string; forProtagonist: boolean; aliases: string[] }

export interface CombatTable {
  party: { maxSize: number; maxPerRow: number };
  maxRounds: number;
  element: { advantage: number; disadvantage: number; neutral: number };
  composition: { groups: string[]; bonusPerPresentGroup: number; penaltyPerMissingGroup: number; appliesToSides: Side[] };
  offRow: { damageDealtMultiplier: number; damageTakenMultiplier: number };
  damage: { defenseConstant: number; varianceMin: number; varianceMax: number; minimum: number };
  ai: { healThreshold: number };
}

export interface InjuryTable {
  severities: { id: string; name: string; days: Range }[];
  heavyChanceByOutcome: Record<Outcome, number>;
  healerReductionDays: number;
  minimumDays: number;
  healerRoles: string[];
}

/** 규칙 엔진이 받는 데이터 표 묶음. 테스트에서는 일부를 바꿔 넣을 수 있다. */
export interface GameTables {
  elements: ElementRow[];
  roles: RoleRow[];
  skills: SkillRow[];
  stats: StatsTable;
  monsterGrades: MonsterGradeRow[];
  riftTiers: RiftTierRow[];
  combat: CombatTable;
  injuries: InjuryTable;
  cities: CityRow[];
  materials: MaterialRow[];
  progression: ProgressionTable;
  factions: FactionRow[];
  monsters: MonsterRow[];
  roster: RosterRow[];
  travel: TravelTable;
  backgrounds: BackgroundRow[];
  ui: UiTable;
  growthSpeeds: GrowthSpeedRow[];
  worlds: { id: string; name: string }[];
  races: { id: string; name: string; world: string }[];
  /** 징조 표식 문구 */
  omens: OmenRow[];
  autoParty: AutoPartyTable;
  loyalty: LoyaltyTable;
  poaching: PoachingTable;
  facilities: FacilitiesTable;
  autoplay: AutoplayPolicy;
  combatPower: CombatPowerTable;
}

/** 전투력과 예상 위험도 */
export interface CombatPowerTable {
  statWeights: Stats;
  simulations: number;
  /** minWinRate가 큰 것부터 판정. 단계 수는 데이터로 늘리고 줄인다. */
  riskTiers: { id: string; name: string; minWinRate: number }[];
}

/** 시설 효과 정의. type별 처리기(engine/facilities.ts)가 나머지 값을 해석한다. */
export interface FacilityEffect {
  type: string;
  [key: string]: unknown;
}

export interface FacilityRow {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  startLevel: number;
  cost: { zero: number; zeroGrowth: number; days: number; daysStep: number };
  /** 특정 레벨의 비용·일수 덮어쓰기(키는 레벨) */
  levelOverrides?: Record<string, { zero?: number; days?: number }>;
  effect: FacilityEffect;
}

export interface FacilitiesTable {
  facilities: FacilityRow[];
  fog: { deadlineWidth: number; levelWidth: number; countWidth: number; rewardSpread: number };
}

export interface AutoplayPolicy {
  facilityOrder: string[];
  facilityReserveZero: number;
  recruitReserveZero: number;
  facilitiesBeforeRecruit: boolean;
  assignIdleToTraining: boolean;
}

/** 무소속 용병의 다른 세력 영입 이동 */
export interface PoachingTable {
  dailyChance: number;
  /** 충성도 이탈 직후 이동 판정에서 빼는 일수 */
  protectionDaysAfterDeparture: number;
  /** 이동 판정 대상 소속 세력 */
  fromFactions: string[];
  /** 이동할 수 없는 세력 */
  excludeTargets: string[];
}

/** 충성도 변동 요인 키. victoryHard는 상급 이상 몬스터가 나오는 리프트의 승리(성향 가중치 전용, 기본값은 victory) */
export type LoyaltyChangeKey = 'victory' | 'defeat' | 'injury' | 'unpaidDay' | 'restDay' | 'idleDecay' | 'salaryBonus';
export type LoyaltyWeightKey = LoyaltyChangeKey | 'victoryHard';

export interface LoyaltyTierRow {
  id: string;
  name: string;
  /** 이 값 이상이면 이 구간(위 행부터 판정) */
  min: number;
  /** 공격·방어 배율 가감(0.03 = +3%) */
  statBonus: number;
  /** 하루 시작 때 파견 거부 확률 */
  refuseChance: number;
  warn: boolean;
}

export interface TendencyRow {
  id: string;
  name: string;
  description: string;
  weights: Partial<Record<LoyaltyWeightKey, number>>;
}

export interface LoyaltyTable {
  range: Range;
  start: number;
  /** 충성도 변동·거부·이탈을 시뮬레이션할 소속('guild' 또는 세력 id). 그 밖의 용병은 시작값을 보관만 한다. */
  simulatedAffiliations: string[];
  /** 출전 없이 쉬는 날 상승을 주는 최대 연속 일수. 넘기면 대기 하락 */
  restMaxDays: number;
  tiers: LoyaltyTierRow[];
  departure: { tier: string; afterConsecutiveDays: number; chance: number; toFaction: string; excludeOnExpedition: boolean };
  changes: Record<LoyaltyChangeKey, number>;
  hardRiftGrades: string[];
  salaryBonus: { costPerLevel: number };
  recentLogSize: number;
  tendencies: TendencyRow[];
  /** 배경 id → 성향 id */
  backgroundTendency: Record<string, string>;
}

/** 자동 편성 규칙(제안) */
export interface AutoPartyTable {
  includeProtagonist: boolean;
  /** 전위·딜러·지원을 먼저 하나씩 채운다 */
  fillGroupsFirst: boolean;
  weights: { level: number; elementAdvantage: number; elementDisadvantage: number };
}

export interface OmenRow { id: string; text: string }

/** 화면 쪽 수치(재생 속도, 경고 기준 등) */
export interface UiTable {
  storageWarnRatio: number;
  replay: { stepMs: number; speeds: number[] };
  recentReportsOnHome: number;
  toastMs: number;
  /** 마감이 이 일수 이하로 남으면 경고 색 */
  deadlineWarnDays: number;
  /** 영입 확인에서 버틸 일수가 이보다 적으면 경고 색 */
  upkeepWarnDays: number;
}

export const cities: readonly CityRow[] = citiesJson as CityRow[];

export const tables: GameTables = {
  elements: elementsJson,
  roles: rolesJson as RoleRow[],
  skills: skillsJson as SkillRow[],
  stats: statsJson as StatsTable,
  monsterGrades: monsterGradesJson as MonsterGradeRow[],
  riftTiers: riftTiersJson as unknown as RiftTierRow[],
  combat: combatJson as CombatTable,
  injuries: injuriesJson as InjuryTable,
  cities: citiesJson as CityRow[],
  materials: materialsJson,
  progression: progressionJson as ProgressionTable,
  factions: factionsJson as FactionRow[],
  monsters: monstersJson,
  roster: rosterJson as RosterRow[],
  travel: travelJson,
  backgrounds: backgroundsJson,
  ui: uiJson,
  growthSpeeds: growthSpeedsJson,
  worlds: worldsJson,
  races: racesJson,
  omens: omensJson,
  autoParty: autoPartyJson,
  loyalty: loyaltyJson as unknown as LoyaltyTable,
  poaching: poachingJson,
  facilities: facilitiesJson as unknown as FacilitiesTable,
  autoplay: autoplayJson,
  combatPower: combatPowerJson as CombatPowerTable,
};

/** 세이브 정책(명세 9절 확정 규칙의 값). 저장 코드와 화면 문구가 같은 값을 읽는다. */
export const savePolicy: { autoSavesPerSlot: number } = savePolicyJson;

/** 세이브 의미 검증의 최소값(다른 표에 범위가 없는 것) */
export interface SaveLimits {
  minDay: number;
  minMercLevel: number;
  minEnemiesPerRift: number;
  minPartySize: number;
}
export const saveLimits: SaveLimits = saveLimitsJson;

export function findCity(id: string): CityRow | undefined {
  return cities.find((c) => c.id === id);
}

function byId<T extends { id: string }>(rows: T[], id: string, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`${what} 데이터에 없는 id: ${id}`);
  return row;
}

export const getElement = (t: GameTables, id: string) => byId(t.elements, id, '속성');
export const getRole = (t: GameTables, id: string) => byId(t.roles, id, '역할');
export const getSkill = (t: GameTables, id: string) => byId(t.skills, id, '스킬');
export const getMonsterGrade = (t: GameTables, id: string) => byId(t.monsterGrades, id, '몬스터 등급');
export const getRiftTier = (t: GameTables, id: string) => byId(t.riftTiers, id, '리프트 등급');
export const getMonster = (t: GameTables, id: string) => byId(t.monsters, id, '몬스터');
export const getFaction = (t: GameTables, id: string) => byId(t.factions, id, '세력');
export const getMaterial = (t: GameTables, id: string) => byId(t.materials, id, '재료');
export const getCity = (t: GameTables, id: string) => byId(t.cities, id, '도시');

export function travelDays(t: GameTables, from: string, to: string): number {
  if (from === to) return t.travel.sameCityDays;
  const route = t.travel.routes.find((r) => r.between.includes(from) && r.between.includes(to));
  return route ? route.days : t.travel.defaultDays;
}
export const getGrowthSpeed = (t: GameTables, id: string) => byId(t.growthSpeeds, id, '성장 속도');
export const getBackground = (t: GameTables, id: string) => byId(t.backgrounds, id, '배경');
