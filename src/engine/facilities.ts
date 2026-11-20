/**
 * 거점 시설의 순수 계산: 레벨별 비용·일수, 효과 처리기, 탐지소의 "보이는 리프트".
 * 시설 상태를 바꾸는 행동(건설, 배치)은 game.ts에 있다.
 * 새 효과 종류는 EFFECT_HANDLERS에 처리기를 등록하는 한 곳만 바꾸면 된다.
 */
import { getRiftTier, type FacilityEffect, type FacilityRow, type GameTables, type Outcome } from '../data';
import { riftReward, type Rift, type RiftOmen, type RiftReward } from './rift';

export interface FacilitiesState {
  /** 시설 id → 현재 레벨(0은 미건설) */
  levels: Record<string, number>;
  /** 진행 중인 건설·강화(한 번에 하나) */
  construction: { facilityId: string; targetLevel: number; startDay: number; completeDay: number } | null;
  /** 시설 id → 배치된 용병 id. 배치는 시설 종류에 묶이지 않고, 칸 수는 효과 처리기의 slots가 정한다. */
  assignments: Record<string, string[]>;
}

export function getFacility(tables: GameTables, id: string): FacilityRow {
  const f = tables.facilities.facilities.find((x) => x.id === id);
  if (!f) throw new Error(`시설 데이터에 없는 id: ${id}`);
  return f;
}

export function initialFacilities(tables: GameTables): FacilitiesState {
  return {
    levels: Object.fromEntries(tables.facilities.facilities.map((f) => [f.id, f.startLevel])),
    construction: null,
    assignments: {},
  };
}

export const facilityLevel = (fs: FacilitiesState, id: string) => fs.levels[id] ?? 0;

/** 레벨 L로 건설·강화하는 비용과 일수(공식 + 레벨별 덮어쓰기). 최대 레벨을 올려도 데이터만으로 계산된다. */
export function levelCost(tables: GameTables, id: string, level: number): { zero: number; days: number } {
  const f = getFacility(tables, id);
  const o = f.levelOverrides?.[String(level)] ?? {};
  return {
    zero: o.zero ?? Math.round(f.cost.zero * Math.pow(f.cost.zeroGrowth, level - 1)),
    days: o.days ?? f.cost.days + f.cost.daysStep * (level - 1),
  };
}

// ── 효과 처리기 ─────────────────────────────────────────

export interface ScoutingRow {
  revealElements: boolean;
  exactDeadline: boolean;
  exactEnemies: boolean;
  exactReward: boolean;
  revealOmen: boolean;
}
const NOTHING_REVEALED: ScoutingRow = { revealElements: false, exactDeadline: false, exactEnemies: false, exactReward: false, revealOmen: false };

const num = (e: FacilityEffect, key: string) => (typeof e[key] === 'number' ? (e[key] as number) : 0);
const linear = (e: FacilityEffect, base: string, per: string, level: number) => (level > 0 ? num(e, base) + num(e, per) * (level - 1) : 0);
/** 표 기반 효과: 레벨 L은 levels[L-1], 표보다 높은 레벨은 마지막 행을 이어받는다. */
function tableRow<T>(e: FacilityEffect, level: number): T | undefined {
  const rows = Array.isArray(e.levels) ? (e.levels as T[]) : [];
  if (level <= 0 || rows.length === 0) return undefined;
  return rows[Math.min(level, rows.length) - 1];
}

export interface EffectHandler {
  /** 이 레벨에서 배치할 수 있는 용병 수(배치형 시설이 아니면 0) */
  slots?: (e: FacilityEffect, level: number) => number;
  /** 화면에 보일 효과 설명 */
  describe: (e: FacilityEffect, level: number) => string;
}

export const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  injuryReduction: {
    describe: (e, lv) => (lv > 0 ? `새 부상 회복 일수 −${linear(e, 'base', 'perLevel', lv)}일(최소 1일)` : '효과 없음'),
  },
  training: {
    slots: (e, lv) => linear(e, 'slotsBase', 'slotsPerLevel', lv),
    describe: (e, lv) =>
      lv > 0 ? `${linear(e, 'slotsBase', 'slotsPerLevel', lv)}명 배치, 하루 경험치 +${linear(e, 'expBase', 'expPerLevel', lv)}` : '효과 없음',
  },
  scouting: {
    describe: (e, lv) => {
      const r = tableRow<ScoutingRow>(e, lv) ?? NOTHING_REVEALED;
      const parts = [
        r.revealElements ? '몬스터 속성' : null,
        r.exactEnemies ? '몬스터 레벨·수 정확' : '몬스터 레벨·수 범위',
        r.exactDeadline ? '마감일 정확' : '마감일 범위',
        r.exactReward ? '보상 정확' : '보상 범위',
        r.revealOmen ? '징조 표식' : null,
      ];
      return parts.filter(Boolean).join(', ');
    },
  },
};

const handlerOf = (f: FacilityRow): EffectHandler | undefined => EFFECT_HANDLERS[f.effect.type];

export function describeEffect(tables: GameTables, id: string, level: number): string {
  const f = getFacility(tables, id);
  return handlerOf(f)?.describe(f.effect, level) ?? '';
}

/** 시설의 배치 칸 수(배치형이 아니면 0) */
export function facilitySlots(tables: GameTables, fs: FacilitiesState, id: string): number {
  const f = getFacility(tables, id);
  return handlerOf(f)?.slots?.(f.effect, facilityLevel(fs, id)) ?? 0;
}

/** 같은 효과 종류를 가진 모든 시설의 선형 효과 합(예: 부상 감소) */
function sumLinear(tables: GameTables, fs: FacilitiesState, type: string, base: string, per: string): number {
  return tables.facilities.facilities
    .filter((f) => f.effect.type === type)
    .reduce((s, f) => s + linear(f.effect, base, per, facilityLevel(fs, f.id)), 0);
}

export const injuryReductionDays = (tables: GameTables, fs: FacilitiesState) => sumLinear(tables, fs, 'injuryReduction', 'base', 'perLevel');

/** 훈련형 시설의 하루 경험치 */
export function trainingExp(tables: GameTables, fs: FacilitiesState, id: string): number {
  const f = getFacility(tables, id);
  return f.effect.type === 'training' ? linear(f.effect, 'expBase', 'expPerLevel', facilityLevel(fs, id)) : 0;
}

/** 탐지 정확도: 탐지형 시설 중 가장 많이 공개하는 행 */
export function scoutingRow(tables: GameTables, fs: FacilitiesState): ScoutingRow {
  const rows = tables.facilities.facilities
    .filter((f) => f.effect.type === 'scouting')
    .map((f) => tableRow<ScoutingRow>(f.effect, facilityLevel(fs, f.id)))
    .filter((r): r is ScoutingRow => !!r);
  const any = (k: keyof ScoutingRow) => rows.some((r) => r[k]);
  return {
    revealElements: any('revealElements'),
    exactDeadline: any('exactDeadline'),
    exactEnemies: any('exactEnemies'),
    exactReward: any('exactReward'),
    revealOmen: any('revealOmen'),
  };
}

/** 시설 배치 중인가(어느 시설이든) */
export function assignedFacility(fs: FacilitiesState, mercId: string): string | undefined {
  return Object.entries(fs.assignments).find(([, ids]) => ids.includes(mercId))?.[0];
}

// ── 탐지소: 보이는 리프트 ────────────────────────────────

export type ValueRange = [number, number];

export interface VisibleReward {
  zero: ValueRange;
  arche: ValueRange;
  materials: Record<string, ValueRange>;
}

/** 화면과 자동 편성이 쓰는 리프트 정보. 실제 값은 바꾸지 않는다. */
export interface VisibleRift {
  /** 리프트 id(위험도 추정 시드용) */
  riftId: string;
  tier: string;
  /** 몬스터 등급(화면에 항상 보임) */
  grade: string;
  scouting: ScoutingRow;
  /** 공개되지 않으면 null */
  elements: string[] | null;
  /** 몬스터 종류(종류 이름은 항상 보임) */
  monsterIds: string[];
  /** exactEnemies일 때만 종류별 수 */
  monsterCounts: Record<string, number> | null;
  /** 같은 값 두 개면 정확한 값 */
  level: ValueRange;
  count: ValueRange;
  /** 안정화 통로면 null */
  deadline: ValueRange | null;
  victoryReward: VisibleReward;
  retreatReward: VisibleReward;
  /** revealOmen일 때만. 숨겨져 있으면 undefined이고 omenHidden이 true */
  omen?: RiftOmen;
  omenHidden: boolean;
  /** 흐린 항목이 있는가(안내 문구용) */
  blurred: boolean;
}

const exact = (v: number): ValueRange => [v, v];

/**
 * 탐지소가 보상을 정확히 보여 주지 않을 때의 보상 범위(지시서 012 6-1).
 * 실제 보상이 아니라 보이는 정보만으로 만든다: 리프트 등급의 기본 보상 범위 × 결과 배율 × 안정화 배율
 * × (1 + 레벨 배율 × 보이는 몬스터 레벨 범위의 양 끝). 그래서 숨은 레벨이 범위 위치로 새지 않고,
 * 실제 보상은 항상 이 범위 안에 있다.
 */
function blurredReward(tables: GameTables, rift: Rift, outcome: Outcome, level: ValueRange): VisibleReward {
  const tier = getRiftTier(tables, rift.tier);
  const prog = tables.progression;
  const ratio = (lv: number) =>
    prog.rewardRatioByOutcome[outcome] * (rift.stable ? prog.stablePassageRewardRatio : 1) * (1 + prog.rewardLevelScale * lv);
  const range = ([lo, hi]: [number, number]): ValueRange => [Math.floor(lo * ratio(level[0])), Math.floor(hi * ratio(level[1]))];
  return {
    zero: range(tier.rewards.zero),
    arche: range(tier.rewards.arche),
    materials: Object.fromEntries(Object.entries(tier.rewards.materials).map(([k, r]) => [k, range(r)])),
  };
}

const exactReward = (r: RiftReward): VisibleReward => ({
  zero: exact(r.zero),
  arche: exact(r.arche),
  materials: Object.fromEntries(Object.entries(r.materials).map(([k, v]) => [k, exact(v)])),
});

export function visibleRift(tables: GameTables, fs: FacilitiesState, rift: Rift): VisibleRift {
  const row = scoutingRow(tables, fs);
  const f = tables.facilities.fog;
  const levels = rift.enemies.map((e) => e.level);
  const maxLevel = Math.max(...levels);
  const n = rift.enemies.length;
  const monsterIds = [...new Set(rift.enemies.map((e) => e.monsterId))];
  const elements = [...new Set(rift.enemies.map((e) => tables.monsters.find((m) => m.id === e.monsterId)?.element).filter((x): x is string => !!x))];
  const level: ValueRange = row.exactEnemies
    ? [Math.min(...levels), maxLevel]
    : [Math.max(1, maxLevel - rift.fog.levelOffset), Math.max(1, maxLevel - rift.fog.levelOffset) + f.levelWidth];
  const count: ValueRange = row.exactEnemies ? exact(n) : [Math.max(1, n - rift.fog.countOffset), Math.max(1, n - rift.fog.countOffset) + f.countWidth];
  const deadline: ValueRange | null =
    rift.deadlineDay === null
      ? null
      : row.exactDeadline
        ? exact(rift.deadlineDay)
        : [rift.deadlineDay - rift.fog.deadlineOffset, rift.deadlineDay - rift.fog.deadlineOffset + f.deadlineWidth];
  const counts: Record<string, number> = {};
  for (const e of rift.enemies) counts[e.monsterId] = (counts[e.monsterId] ?? 0) + 1;
  return {
    riftId: rift.id,
    tier: rift.tier,
    grade: rift.enemies[0].grade,
    scouting: row,
    elements: row.revealElements ? elements : null,
    monsterIds,
    monsterCounts: row.exactEnemies ? counts : null,
    level,
    count,
    deadline,
    victoryReward: row.exactReward ? exactReward(riftReward(tables, rift, 'victory')) : blurredReward(tables, rift, 'victory', level),
    retreatReward: row.exactReward ? exactReward(riftReward(tables, rift, 'retreat')) : blurredReward(tables, rift, 'retreat', level),
    omen: row.revealOmen ? rift.omen : undefined,
    omenHidden: !row.revealOmen,
    blurred: !row.revealElements || !row.exactEnemies || !row.exactDeadline || !row.exactReward || !row.revealOmen,
  };
}
