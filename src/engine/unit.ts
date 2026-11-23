import { getMonsterGrade, getRole, type GameTables, type Stats } from '../data';
import { roleBaseStats, statsAtLevel, type TraitRef } from './stats';
export { levelScale } from './stats';

/** 유닛의 소속. 용병·몬스터·(이후) 일반병사·라이벌 병력이 같은 틀을 쓴다. */
export type Affiliation =
  | { kind: 'guild' }
  | { kind: 'faction'; factionId: string }
  | { kind: 'monster' }
  | { kind: 'unaffiliated' };

/**
 * 공통 유닛 틀. 전투 엔진은 이 틀만 안다.
 * 용병과 몬스터의 차이는 데이터(소속, 행동 방식, 드롭, 성장·부상 사용 여부)로 둔다.
 */
export interface Unit {
  id: string;
  name: string;
  element: string;
  role: string;
  level: number;
  /** 레벨 성장·외부 배율(몬스터 등급, 충성도 등)까지 적용한 스탯. 특성 효과는 computeEffectiveStats가 더한다 */
  stats: Stats;
  /** 켜진 특성(지시서 016). 몬스터는 비어 있다 */
  traits: TraitRef[];
  /** [기본 공격, 스킬 1, 스킬 2] */
  skills: string[];
  affiliation: Affiliation;
  /** 행동 방식(AI) id. 1단계는 'default' 하나. */
  ai: string;
  /** 몬스터·일반병사만 쓴다. 용병에는 등급이 없다. */
  grade?: string;
  dropTableId?: string;
  usesGrowth: boolean;
  usesInjury: boolean;
  /** 충성도 사용 여부(길드 용병만, 주인공·몬스터는 false) */
  usesLoyalty?: boolean;
  /** 조합 축 "세계"와 종족(시너지는 2단계). 몬스터는 비워 둔다. */
  world?: string;
  race?: string;
}

/** 역할 기본 스탯에 레벨 성장 배율을 곱한다. multiplier는 몬스터 등급 등 외부 배율(핵심 6스탯에만). */
export function statsForLevel(tables: GameTables, roleId: string, level: number, multiplier = 1): Stats {
  return statsAtLevel(tables, roleBaseStats(tables, roleId), level, multiplier);
}

export interface MonsterSpec {
  id: string;
  name: string;
  element: string;
  role: string;
  grade: string;
  level: number;
  dropTableId?: string;
  /** monsters.json의 id(보조 스탯용). 없으면 역할 기본값 */
  monsterId?: string;
}

/** 몬스터 스탯: 역할 기본값(보조 스탯은 몬스터 행의 aux가 있으면 그 값) × 레벨 × 등급 배율 */
function monsterStats(tables: GameTables, spec: MonsterSpec, gradeMultiplier: number): Stats {
  const aux = tables.monsters.find((m) => m.id === spec.monsterId)?.aux ?? {};
  return statsAtLevel(tables, { ...roleBaseStats(tables, spec.role), ...aux }, spec.level, gradeMultiplier);
}

export function createMonster(tables: GameTables, spec: MonsterSpec): Unit {
  const grade = getMonsterGrade(tables, spec.grade);
  const role = getRole(tables, spec.role);
  return {
    id: spec.id,
    name: spec.name,
    element: spec.element,
    role: spec.role,
    level: spec.level,
    stats: monsterStats(tables, spec, grade.statMultiplier),
    traits: [],
    skills: [...role.skills],
    affiliation: { kind: 'monster' },
    ai: 'default',
    grade: spec.grade,
    dropTableId: spec.dropTableId,
    usesGrowth: false,
    usesInjury: false,
  };
}

export interface MercenarySpec {
  id: string;
  name: string;
  element: string;
  role: string;
  level: number;
  affiliation?: Affiliation;
}

/** 역할 기본 스탯으로 만드는 견본 용병(시뮬레이션·밸런스 도구용). 게임의 계약자는 game.ts mercToUnit이 계약자별 스탯·특성으로 만든다. */
export function createMercenary(tables: GameTables, spec: MercenarySpec): Unit {
  const role = getRole(tables, spec.role);
  if (!role.enabled) throw new Error(`1단계에서 쓰지 않는 역할: ${spec.role}`);
  return {
    id: spec.id,
    name: spec.name,
    element: spec.element,
    role: spec.role,
    level: spec.level,
    stats: statsForLevel(tables, spec.role, spec.level),
    traits: [],
    skills: [...role.skills],
    affiliation: spec.affiliation ?? { kind: 'guild' },
    ai: 'default',
    usesGrowth: true,
    usesInjury: true,
  };
}
