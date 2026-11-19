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

export type Range = [number, number];
export type StatId = 'hp' | 'atk' | 'def' | 'spd';
export type Stats = Record<StatId, number>;
export type Row = 'front' | 'back';
export type Side = 'ally' | 'enemy';

export interface CityRow {
  id: string;
  name: string;
  summary: string;
  riftSpawn: { maxActive: number; dailySpawnChance: number; initialCount: number; tierWeights: Record<string, number> };
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

export interface RoleStatRow { base: Stats; perLevel: Stats }
export interface StatsTable { stats: { id: StatId; name: string }[]; roleBase: Record<string, RoleStatRow> }

export interface MonsterGradeRow { id: string; name: string; statMultiplier: number }

export interface RiftTierRow {
  id: string;
  name: string;
  monsterGrades: string[];
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
  recruitZeroCost: { base: number; perLevel: number };
  protagonistGrowth: { cap: number; speed: number; initialLevel: number };
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

export interface FactionRow { id: string; name: string; type: string; typeName: string; recruitPool?: boolean }

export interface MonsterRow { id: string; name: string; role: string; element: string; grades: string[] }

export interface RosterRow {
  id: string;
  name: string;
  element: string;
  role: string;
  initialLevel: number;
  /** cap: 성장 한계(최대 레벨), speed: 성장 속도(경험치 배율) */
  growth: { cap: number; speed: number };
  /** 'guild'는 플레이어 길드, 그 밖에는 factions.json의 id */
  faction: string;
}

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
}

export const cities: readonly CityRow[] = citiesJson as CityRow[];

export const tables: GameTables = {
  elements: elementsJson,
  roles: rolesJson as RoleRow[],
  skills: skillsJson as SkillRow[],
  stats: statsJson as StatsTable,
  monsterGrades: monsterGradesJson,
  riftTiers: riftTiersJson as RiftTierRow[],
  combat: combatJson as CombatTable,
  injuries: injuriesJson as InjuryTable,
  cities: citiesJson as CityRow[],
  materials: materialsJson,
  progression: progressionJson as ProgressionTable,
  factions: factionsJson as FactionRow[],
  monsters: monstersJson,
  roster: rosterJson,
  travel: travelJson,
};

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
