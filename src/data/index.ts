// 데이터 표 진입점. 수치와 목록은 JSON에 두고 코드는 이 모듈을 통해서만 읽는다.
import citiesJson from './cities.json';
import elementsJson from './elements.json';
import rolesJson from './roles.json';
import skillsJson from './skills.json';
import statusEffectsJson from './statusEffects.json';
import contributionJson from './contribution.json';
import leagueRulesJson from './league/rules.json';
import leagueTeamsJson from './league/teams.json';
import leagueFeaturedJson from './league/featured.json';
import { namePool, type NamePoolTables } from './namePool';
import helpJson from './help.json';
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
import worldsJson from './worlds.json';
import racesJson from './races.json';
import omensJson from './omens.json';
import savePolicyJson from './save-policy.json';
import autoPartyJson from './auto-party.json';
import saveLimitsJson from './save-limits.json';
import loyaltyJson from './loyalty.json';
import outerMissionsJson from './outerMissions.json';
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
  /** 기본 공격(지시서 020) */
  basicSkill: string;
  /** 액티브 풀 6개. 계약자는 이 안에서 3개를 배정받는다. 몬스터는 앞 2개 */
  skillPool: string[];
  /** 역할 특성 후보(특성 슬롯 ②) */
  roleTraits: string[];
  /** 도움말 한 줄 설명 */
  description: string;
}

export type SkillKind = 'attack' | 'heal' | 'taunt' | 'buff' | 'shield' | 'debuff';
export type SkillTarget = 'enemy' | 'enemyRow' | 'enemyAll' | 'enemyBackLowest' | 'enemyBackRow' | 'self' | 'allyLowest' | 'allyAll';

/** 상태 효과(지시서 020, statusEffects.json). 전투 안에서만 유지 */
export type StatusEffectKind = 'stun' | 'dot' | 'shield' | 'mark' | 'weaken';
export interface StatusEffectRow {
  id: string;
  name: string;
  kind: StatusEffectKind;
  defaultDuration: number;
  /** 표식: 받는 피해 배율, 약화: 주는 피해·치유 배율 */
  multiplier?: number;
  /** 지속 피해: 걸 때 정한 피해에 곱하는 값 */
  powerMultiplier?: number;
  /** 기절: 풀린 뒤 다시 걸리지 않는 라운드 수 */
  immuneRoundsAfter?: number;
  /** cleanse 스킬이 지우는가 */
  cleansable: boolean;
  description: string;
}
export interface StatusEffectsTable { effects: StatusEffectRow[] }

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
  /** 이 스킬을 가진 역할(풀 소속) */
  role?: string;
  /** 화면 한 줄 설명(지시서 020) */
  description?: string;
  /** 대상에게 거는 상태 효과(항상 적중). duration이 없으면 statusEffects의 기본 지속 */
  applies?: { status: string; duration?: number }[];
  /** 대상 체력이 낮을수록 피해 ×(1 + 값 × (1 − 체력 비율)) */
  lowHpBonus?: number;
  /** 도발 무시 */
  ignoreTaunt?: boolean;
  /** 보호막 양 = 시전자의 scaleStat(hp는 최대 체력) × ratio */
  shield?: { scaleStat: StatId; ratio: number };
  /** 지속 피해·표식·약화를 지운다(기절은 지우지 않음) */
  cleanse?: boolean;
}

export interface RoleStatRow { base: Stats }
export interface StatsTable {
  stats: { id: StatId; name: string; kind: 'core' | 'aux'; format?: 'percent' | 'multiplier' }[];
  /** 보조 스탯 상한(치명타율·회피율) */
  caps: Partial<Record<StatId, number>>;
  roleBase: Record<string, RoleStatRow>;
  /** 레벨당 복리 성장률(핵심 6개만) */
  levelGrowthRate: CoreStats;
  /** 성장률 별 한 칸(기본 대비 배율 차, 지시서 021) */
  growthStarStep: CoreStats;
  /** 계약자 성장률 검증 범위(기본 대비 배율)와 성장 한계 레벨 전투력 범위 */
  growthRateBounds: { core: Range; spd: Range; capPower: Range };
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
  /** 영입비 = (base + perCapAbove30 × (한계 − capBaseline) + perLevel × (레벨 − 1)) × 도시 배율(세력 배율 없음, 지시서 026) */
  recruitZeroCost: { base: number; perCapAbove30: number; perLevel: number; capBaseline: number };
  /** 보상 = 등급 보상 × (1 + rewardLevelScale × 몬스터 레벨) */
  rewardLevelScale: number;
  /** 경험치 = 결과별 경험치 × 등급 배율 × (1 + expLevelScale × 몬스터 레벨) */
  expLevelScale: number;
  /** 하루 유지비 = base + perLevel × 레벨 */
  upkeepZeroPerDay: { base: number; perLevel: number };
  /** 파견 경험치 나누기: 총량 = 한 명당 경험치 × basePartySize, 한 명당 몫 = 총량 ÷ 인원(상한 한 명당 × soloCapMultiplier) */
  expShare: { basePartySize: number; soloCapMultiplier: number };
  /** 길드 마스터의 배경 기본값(화면에서 고르지 않음, 지시서 022) */
  masterBackground: string;
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
  /** 그 세력 인물이 어느 도시에 자주 나오는지 정하는 연출 가중치(리프트 영역 세력 표시). 세력은 게임 수치에 개입하지 않는다(지시서 026). */
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
  /** 카드(계약자 그리드·파티 후보·슬롯 등)에 쓰는 짧은 이름(지시서 017b). 상세·시트·로그는 name */
  shortName: string;
  element: string;
  role: string;
  hometown: string;
  /** 출신 세력(연고, 지시서 026d): factions.json의 id, null은 연고 없음. 영입·이탈로 바뀌지 않는다. 시작 길드 여부는 startingCandidate */
  originFaction: string | null;
  startingCandidate: boolean;
  background: string;
  /** cap: 성장 한계(최대 레벨) */
  growth: { cap: number };
  /** 핵심 6스탯의 레벨당 성장률(지시서 021). 없으면 stats.json levelGrowthRate */
  growthRates?: CoreStats;
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
  /** 액티브 스킬 3개(역할 풀 안, 지시서 020) */
  skills: string[];
  /** 고유 스킬 자리(지시서 020: 칸만 비워 둔다) */
  signatureSkill: string | null;
}

export interface BackgroundRow { id: string; name: string; shortName: string; forProtagonist: boolean; aliases: string[] }

export interface CombatTable {
  party: { maxSize: number; maxPerRow: number };
  maxRounds: number;
  /** 행동 순서 흔들림 비율(지시서 018). 0이면 없음 */
  speedJitter: number;
  element: { advantage: number; disadvantage: number; neutral: number };
  composition: { groups: string[]; bonusPerPresentGroup: number; penaltyPerMissingGroup: number; appliesToSides: Side[]; groupAlias?: Record<string, string> };
  offRow: { damageDealtMultiplier: number; damageTakenMultiplier: number };
  damage: { defenseConstant: number; varianceMin: number; varianceMax: number; minimum: number };
  ai: { healThreshold: number; cleanseThreshold: number };
}

export interface InjuryTable {
  severities: { id: string; name: string; days: Range }[];
  heavyChanceByOutcome: Record<Outcome, number>;
  healerReductionDays: number;
  minimumDays: number;
  healerRoles: string[];
}

/** 규칙 엔진이 받는 데이터 표 묶음. 테스트에서는 일부를 바꿔 넣을 수 있다. */
/** 활약도(지시서 027): 항목 행, 역할별 가중치·기준값(공략 1회 평균), 시즌 길이 */
export interface ContributionTable {
  recentLimit: number;
  pastSeasonsLimit: number;
  items: { id: string; name: string }[];
  weights: Record<string, Record<string, number>>;
  baselines: Record<string, Record<string, number>>;
  /** 기준값을 뽑은 표본(스크립트가 채운다) */
  baselineSample: { fights: number; levels: number[]; seed: string } | null;
}

/** 리그 규칙(지시서 028a, league/rules.json) */
export interface LeagueTierRow {
  id: string;
  name: string;
  /** 1(미진) ~ 5(격진) */
  order: number;
  /** 우리 용병단 자리를 포함한 팀 수 */
  teams: number;
  promote: number;
  relegate: number;
  /** NPC 시즌 총점 목표(성장하지 않음) */
  targetScore: number;
  /** 시즌마다 팀별 총점 난수 폭(±비율) */
  spread: number;
  /** 이 등급 계약자 활약도 기준 */
  activityBase: number;
}
export interface LeagueScaleRow {
  tier: number;
  min: number;
  max: number;
  individualMul: number;
  stars: number;
}
export interface LeagueRules {
  tiers: LeagueTierRow[];
  playerStartTier: string;
  hintTiers: Record<string, string[]>;
  scaleTiers: LeagueScaleRow[];
  initialScaleTarget: number[];
  season: { length: number; checkpoints: number[]; historyLimit: number; seasonsPerYear: number };
  curve: { shapeMin: number; shapeMax: number; dailyNoise: number; activityDailyNoise: number };
  members: { starMul: number; talentSpread: number; capInfluence: number; ageMin: number; ageMax: number; recruitAgeMin: number; recruitAgeMax: number };
  changes: {
    scaleMoveChance: number;
    promotedGrowChance: number;
    relegatedShrinkChance: number;
    neutralGrowChance: number;
    distributionCorrection: number;
    distributionFloor: number;
    distributionCeil: number;
    sizeDrift: number;
    retireBase: number;
    retireAgeStart: number;
    retirePerYearOver: number;
    retireLowActivity: number;
    promotedRetireMul: number;
    relegatedRetireMul: number;
    transferBase: number;
    relegatedStarTransfer: number;
    promotedExtraRecruits: [number, number];
    civilRenameChance: number;
  };
  civilNameParts: { first: string[]; second: string[] };
  names: {
    populationShare: number;
    cultureCap: number;
    continentMin: number;
    multiSurnameChance: number;
    joiner: Record<string, string>;
    cities: string[];
    maxRetries: number;
  };
}
export interface LeagueTeamRow {
  id: string;
  name: string;
  kind: 'named' | 'civil';
  /** 세력 id, null은 무소속(지시서 026c) */
  faction: string | null;
  sizeTier: number;
  leagueHint: string;
  homeCity: string | null;
  concept: string;
  intro: string;
}
export interface LeagueFeaturedRow {
  id: string;
  teamId: string;
  name: string;
  cultureId: string;
  gender: 'm' | 'f' | 'n';
  age: number;
  role: string;
  element: string;
  hometown: string;
  background: string;
  post: string;
  oneLine: string;
  voice: string;
}
export interface LeagueTables {
  rules: LeagueRules;
  teams: LeagueTeamRow[];
  featured: LeagueFeaturedRow[];
}

export interface GameTables {
  league: LeagueTables;
  namePool: NamePoolTables;
  contribution: ContributionTable;
  elements: ElementRow[];
  roles: RoleRow[];
  skills: SkillRow[];
  statusEffects: StatusEffectsTable;
  help: HelpTable;
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
  worlds: { id: string; name: string }[];
  races: { id: string; name: string; world: string }[];
  /** 징조 표식 문구 */
  omens: OmenRow[];
  autoParty: AutoPartyTable;
  loyalty: LoyaltyTable;
  outerMissions: OuterMissionsTable;
  facilities: FacilitiesTable;
  autoplay: AutoplayPolicy;
  combatPower: CombatPowerTable;
  riftPreemption: RiftPreemptionTable;
  traits: TraitsTable;
  terms: TermsTable;
}

/** 도움말(지시서 020, help.json). 본문 블록: 문단(text), 목록(list), 표(rows), 생성(generated: 데이터에서 만듦) */
export type HelpBlock =
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'generated'; source: 'statusEffects' | 'elements' | 'roles' | 'riskTiers' };
export interface HelpTopic { id: string; title: string; subtitle: string; blocks: HelpBlock[] }
export interface HelpTable { topics: HelpTopic[] }

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
  /** 공격 대상의 체력 비율 이하(지시서 020) */
  | { type: 'targetHpBelow'; threshold: number }
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
  detailSimulations: number;
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

/** 충성도 변동 요인 키. victoryHard는 상급 이상 몬스터가 나오는 리프트의 승리(성향 가중치 전용, 기본값은 victory) */
export type LoyaltyChangeKey = 'victory' | 'defeat' | 'injury' | 'unpaidDay' | 'restDay' | 'idleDecay' | 'salaryBonus' | 'outerMission';
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
  /** 충성도 변동·거부·이탈을 시뮬레이션할 소속. 지금은 'guild'만(지시서 026b·026d). 그 밖의 계약자는 시작값을 보관만 한다. */
  simulatedAffiliations: string[];
  /** 출전 없이 쉬는 날 상승을 주는 최대 연속 일수. 넘기면 대기 하락 */
  restMaxDays: number;
  tiers: LoyaltyTierRow[];
  departure: { tier: string; afterConsecutiveDays: number; chance: number; excludeOnExpedition: boolean };
  changes: Record<Exclude<LoyaltyChangeKey, 'outerMission'>, number>;
  /** 외곽 임무에 간 날의 변동(지시서 022): 성향 id별, 없으면 default */
  outerMission: { byTendency: Record<string, number>; default: number };
  hardRiftGrades: string[];
  salaryBonus: { costPerLevel: number };
  recentLogSize: number;
  tendencies: TendencyRow[];
  /** 배경 id → 성향 id */
  backgroundTendency: Record<string, string>;
}

/** 외곽 임무(지시서 022, outerMissions.json) */
export interface OuterMissionRow {
  id: string;
  name: string;
  /** 결과 화면에 붙는 장소 이름 */
  place: string;
  weight: number;
  exp?: { base: number; perLevel: number };
  zero?: { base: number; perLevel: number };
  arche?: { chance: number; amount: Range };
}
export interface OuterMissionsTable {
  /** 새 게임의 자동 배치 기본값 */
  autoOuterDefault: boolean;
  excludeLoyaltyTiers: string[];
  injury: { chance: number; severity: string };
  types: OuterMissionRow[];
}

/** 자동 편성 규칙(제안) */
export interface AutoPartyTable {
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
  partyRiskDebounceMs: number;
  lockedFacilities: { id: string; name: string; status: string; note: string }[];
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
  /** 파티 편성 끌기(지시서 024) */
  partyDrag: { longPressMs: number; moveCancelPx: number; clickSuppressMs: number };
  /** 영입 탭 정렬(지시서 023): 첫 항목이 기본. 비교 방법은 id로 recruitFilter가 정한다 */
  recruitSort: { id: string; name: string }[];
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
  league: { rules: leagueRulesJson as unknown as LeagueRules, teams: leagueTeamsJson as LeagueTeamRow[], featured: leagueFeaturedJson as LeagueFeaturedRow[] },
  namePool,
  contribution: contributionJson as ContributionTable,
  elements: elementsJson,
  roles: rolesJson as RoleRow[],
  skills: skillsJson as SkillRow[],
  statusEffects: statusEffectsJson as StatusEffectsTable,
  help: helpJson as HelpTable,
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
  worlds: worldsJson,
  races: racesJson,
  omens: omensJson,
  autoParty: autoPartyJson,
  loyalty: loyaltyJson as unknown as LoyaltyTable,
  outerMissions: outerMissionsJson as unknown as OuterMissionsTable,
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
export const getStatusEffect = (t: GameTables, id: string) => byId(t.statusEffects.effects, id, '상태 효과');
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
export const getBackground = (t: GameTables, id: string) => byId(t.backgrounds, id, '배경');
