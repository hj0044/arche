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

export type Range = [number, number];
export type StatId = 'hp' | 'atk' | 'def' | 'spd';
export type Stats = Record<StatId, number>;
export type Row = 'front' | 'back';
export type Side = 'ally' | 'enemy';

export interface CityRow { id: string; name: string; summary: string }

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
  reward: string;
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
  heavyChanceByOutcome: Record<'victory' | 'retreat' | 'defeat', number>;
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
}

export const cities: readonly CityRow[] = citiesJson;

export const tables: GameTables = {
  elements: elementsJson,
  roles: rolesJson as RoleRow[],
  skills: skillsJson as SkillRow[],
  stats: statsJson as StatsTable,
  monsterGrades: monsterGradesJson,
  riftTiers: riftTiersJson as RiftTierRow[],
  combat: combatJson as CombatTable,
  injuries: injuriesJson as InjuryTable,
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
