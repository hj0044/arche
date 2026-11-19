import { getMonsterGrade, getRole, type GameTables, type Stats } from '../data';

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
  stats: Stats;
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
}

/** 역할 기본 스탯과 레벨별 증가량으로 스탯을 만든다. multiplier는 몬스터 등급 등 외부 배율. */
export function statsForLevel(tables: GameTables, roleId: string, level: number, multiplier = 1, perLevelScale = 1): Stats {
  const row = tables.stats.roleBase[roleId];
  if (!row) throw new Error(`역할 스탯 표에 없는 역할: ${roleId}`);
  const out = {} as Stats;
  for (const { id } of tables.stats.stats) {
    out[id] = Math.round((row.base[id] + row.perLevel[id] * perLevelScale * (level - 1)) * multiplier);
  }
  return out;
}

export interface MonsterSpec {
  id: string;
  name: string;
  element: string;
  role: string;
  grade: string;
  level: number;
  dropTableId?: string;
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
    stats: statsForLevel(tables, spec.role, spec.level, grade.statMultiplier),
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

/** M3에서 성장 개별 수치가 붙는다. 지금은 역할 기본 스탯으로 만든다. */
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
    skills: [...role.skills],
    affiliation: spec.affiliation ?? { kind: 'guild' },
    ai: 'default',
    usesGrowth: true,
    usesInjury: true,
  };
}
