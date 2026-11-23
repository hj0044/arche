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
import riftPreemptionJson from './rift-preemption.json';
import traitsJson from './traits.json';
import termsJson from './terms.json';

export type Range = [number, number];
/** 핵심 6스탯(레벨로 성장). 지시서 016 */
export type CoreStatId = 'hp' | 'pAtk' | 'pDef' | 'eAtk' | 'eDef' | 'spd';
/** 보조 3스탯(성장하지 않음): 치명타율(비율), 치명타 피해율(배율), 회피율(비율) */
export type AuxStatId = 'crit' | 'critDmg' | 'eva';
export type StatId = CoreStatId | AuxStatId;
export type Stats = Record<StatId, number>;
export type CoreStats = Record<CoreStatId, number>;
export const CORE_STATS: readonly CoreStatId[] = ['hp', 'pAtk', 'pDef', 'eAtk', 'eDef', 'spd'];
export const AUX_STATS: readonly AuxStatId[] = ['crit', 'critDmg', 'eva'];
export type DamageType = 'physical' | 'energy';
export type Row = 'front' | 'back';
export type Side = 'ally' | 'enemy';

export interface CityRow {
  id: string;
  name: string;
  summary: string;
  riftSpawn: {
    /** 동시에 열려 있을 수 있는 리프트 수(파견 중인 리프트는 세지 않는다) */
    maxActive: number;
    dailySpawnChance: number;
    /** 하루에 출현 판정을 몇 번 하는가(없으면 1). 판정마다 한도를 다시 본다. */
    dailySpawnRolls?: number;
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
  /** 예전 표시 이름(용병 CSV 가져오기용, 지시서 016에서 이름을 바꿈) */
  aliases?: string[];
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
  /** 버프가 올리는 스탯들 */
  stats?: StatId[];
  amount?: number;
  /** 공격 스킬의 피해 종류: 물리는 물리공격 대 물리방어, 에너지는 에너지공격 대 에너지방어 */
  damageType?: DamageType;
  /** 치유 스킬이 비례하는 스탯(없으면 eAtk) */
  scaleStat?: StatId;
}

export interface RoleStatRow { base: Stats }
export interface StatsTable {
  stats: { id: StatId; name: string; kind: 'core' | 'aux'; format?: 'percent' | 'multiplier' }[];
  /** 보조 스탯 상한(치명타율·회피율) */
  caps: Partial<Record<StatId, number>>;
  roleBase: Record<string, RoleStatRow>;
  /** 레벨당 복리 성장률(핵심 6개만) */
  levelGrowthRate: CoreStats;
  /** 계약자 baseStats 검증: 핵심은 역할 기본값 대비 배율, 보조는 절대값 범위 */
  roleBounds: Record<StatId, Range>;
  /** 특수 스탯(지시서 016: 자리만, 모두 꺼짐) */
  special: { id: string; name: string; description: string; enabled: boolean }[];
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
  /** 보상 배율(없으면 1). 변형 배율과 곱한다(지시서 015: 비교 실험용 자리) */
  rewardMultiplier?: number;
  /** 부상 일수 배율(없으면 1). 변형 배율과 곱한다 */
  injuryDaysMultiplier?: number;
  /**
   * 등급 안의 변형(지시서 015). 가중치로 하나를 고르고, 적은 값만 등급 값을 덮어쓴다.
   * 없으면 등급 값 그대로. 첫 행은 시작 리프트(initialGuaranteed)에 쓰는 기본 변형이다.
   */
  variants?: RiftVariantRow[];
}

export interface RiftVariantRow {
  id: string;
  /** 화면에 붙는 짧은 이름(예: 소규모). 없으면 표시 안 함 */
  label?: string;
  weight: number;
  monsterLevel?: Range;
  enemyCount?: Range;
  monsterGradeWeights?: Record<string, number>;
  /** 레벨 치우침(없으면 도시 levelSkew). 1이면 고르게 */
  levelSkew?: number;
  rewardMultiplier?: number;
  injuryDaysMultiplier?: number;
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

export interface MonsterRow {
  id: string;
  name: string;
  role: string;
  element: string;
  grades: string[];
  /** 보조 스탯(없으면 역할 기본값) */
  aux?: Partial<Record<AuxStatId, number>>;
}

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
  /** 계약자별 기본 스탯(레벨 1 절대값, 지시서 016). 사람이 고치는 값이라 import-roster가 덮어쓰지 않는다 */
  baseStats?: Stats;
  /** 특성 슬롯 순서대로의 특성 id(traits.json). 짧으면 남은 슬롯은 비어 있다 */
  traits?: string[];
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
  riftPreemption: RiftPreemptionTable;
  traits: TraitsTable;
  terms: TermsTable;
}

/** 화면 용어(지시서 016) */
export interface TermsTable {
  /** 용병의 화면 이름(지금은 "계약자") */
  merc: string;
}

export type TraitCategory = 'common' | 'role' | 'background' | 'race' | 'element' | 'unique';
/** 특성 효과가 켜지는 때(지시서 016). 알 수 없는 type은 데이터 검증에서 실패한다 */
export type TraitTrigger =
  | { type: 'always' }
  | { type: 'battleStart'; rounds: number }
  | { type: 'firstAction' }
  | { type: 'hpBelow'; threshold: number }
  | { type: 'roundStack'; perRound: number; max: number }
  | { type: 'fromRound'; round: number };
export type TraitCondition =
  | { type: 'advantage' }
  | { type: 'disadvantage' }
  | { type: 'enemyElement'; element: string }
  | { type: 'row'; row: Row };
export type TraitEffectKind = 'statMul' | 'statAdd' | 'damageMul' | 'damageTakenMul' | 'healMul';
export interface TraitEffect {
  kind: TraitEffectKind;
  stat?: StatId;
  /** roundStack이면 쓰지 않는다 */
  value?: number;
  scope: 'self' | 'allies';
}
export interface TraitEffectRow {
  trigger: TraitTrigger;
  condition?: TraitCondition;
  effect: TraitEffect;
}
export interface TraitRow {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;
  /** 고를 수 있는 조건(종류별): roles·backgrounds·races·elements 목록 또는 owner(계약자 id) */
  allowed: { roles?: string[]; backgrounds?: string[]; races?: string[]; elements?: string[]; owner?: string };
  tags: string[];
  maxRank: number;
  /** 단계별 효과(지금은 1단계만) */
  ranks: { effects: TraitEffectRow[] }[];
  /** 강화 비용(나중에). 지금은 null */
  upgrade: unknown;
}
export interface TraitsTable {
  /** 슬롯 i(0부터)가 열리는 레벨 */
  slotUnlockLevels: number[];
  caps: { statMulMax: number; damageMulMax: number; healMulMax: number; damageTakenMulMin: number };
  traits: TraitRow[];
}

/** 라이벌 리프트 선점(지시서 013). 등급과 세력은 다른 표의 id를 쓴다(목록을 코드에 박지 않음). */
export interface RiftPreemptionTable {
  /** 리프트 등급 id → 하루 기본 선점 확률 */
  baseChanceByTier: Record<string, number>;
  /** 표에 없는 등급의 기본 확률 */
  defaultBaseChance: number;
  /** 남은 일수(마감일 − 오늘)가 maxDaysLeft 이하인 행 중 maxDaysLeft가 가장 작은 행의 배율. 없으면 ×1 */
  deadlineMultipliers: { maxDaysLeft: number; multiplier: number }[];
  exclude: {
    /** 마감 없는 리프트(안정화된 통로)는 판정하지 않는다 */
    noDeadline: boolean;
    /** 그날 새로 생긴 리프트는 판정하지 않는다 */
    appearedToday: boolean;
  };
  /** 영역 세력에서 빼는 세력 id(이름 없는 무소속 등) */
  territoryExcludeFactions: string[];
}

/** 전투력과 예상 위험도 */
export interface CombatPowerTable {
  /** 핵심 스탯 가중치. 치명타·회피는 기댓값 배수로 반영 */
  statWeights: CoreStats;
  /** 계약자 baseStats 전투력 예산: 같은 역할 기본값 전투력 대비 비율 범위 */
  budget: Range;
  simulations: number;
  /** minWinRate가 큰 것부터 판정. 단계 수는 데이터로 늘리고 줄인다. */
  riskTiers: { id: string; name: string; minWinRate: number; /** 화면 5칸 막대 단계(1이 가장 좋음) */ step: number }[];
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
  deviceSettings: { replaySpeed: number; sound: boolean; confirmImportant: boolean };
  recentReportsOnHome: number;
  toastMs: number;
  /** 마감이 이 일수 이하로 남으면 경고 색 */
  deadlineWarnDays: number;
  /** 영입 확인에서 버틸 일수가 이보다 적으면 경고 색 */
  upkeepWarnDays: number;
  /** 출전 가능 인원이 이보다 적으면 '지금 상황'에서 이유별 인원을 보인다 */
  lowAvailableWarn: number;
  /** 용병 화면 정렬 항목(탭별). 비교 방법은 id로 화면 코드가 정한다. */
  mercSort: { guild: { id: string; name: string }[]; recruit: { id: string; name: string }[] };
  /** 용병 화면 상태 필터 칩 */
  mercStatusFilters: { id: string; name: string }[];
  /** 계약자 화면 빠른 필터 칩(지시서 017 시안: 대기·부상·충성 낮음). id는 mercStatuses의 상태 */
  mercQuickFilters: { id: string; name: string }[];
  /** 리프트 화면 정렬 항목(지시서 013). 비교 방법은 id로 화면 코드가 정한다. 첫 항목이 기본 */
  riftSort: { id: string; name: string }[];
  /** "공략 가능"으로 세는 위험도 단계 id(combat-power.json riskTiers, 지금은 접전 이상). 위험도 범위의 나쁜 쪽 끝으로 판정 */
  riftPlayableRiskTiers: string[];
  /** 리프트 목록을 열 때 바로 계산하는 위험도 카드 수(나머지는 한가할 때) */
  riftEagerRiskCount: number;
  /** 용병 상세 충성도에서 처음 보이는 최근 기록 줄 수(나머지는 펼치기, 지시서 014) */
  loyaltyLogPreview: number;
  /** 성장 한계 구간(지시서 017): min 이상이면 그 구간(큰 것부터 판정). 색은 theme.css --cap-tier-N */
  capTiers: { id: string; name: string; min: number }[];
  /** 그림 슬롯(지시서 017): 경로 규칙과 비율 */
  art: { basePath: string; extensions: string[]; ratios: Record<string, [number, number]>; idRatios: Record<string, [number, number]> };
}

export const cities: readonly CityRow[] = citiesJson as CityRow[];

export const tables: GameTables = {
  elements: elementsJson,
  roles: rolesJson as RoleRow[],
  skills: skillsJson as SkillRow[],
  stats: statsJson as unknown as StatsTable,
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
  ui: uiJson as unknown as UiTable,
  growthSpeeds: growthSpeedsJson,
  worlds: worldsJson,
  races: racesJson,
  omens: omensJson,
  autoParty: autoPartyJson,
  loyalty: loyaltyJson as unknown as LoyaltyTable,
  poaching: poachingJson,
  facilities: facilitiesJson as unknown as FacilitiesTable,
  autoplay: autoplayJson,
  combatPower: combatPowerJson as unknown as CombatPowerTable,
  riftPreemption: riftPreemptionJson as RiftPreemptionTable,
  traits: traitsJson as unknown as TraitsTable,
  terms: termsJson as TermsTable,
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
