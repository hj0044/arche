/**
 * 최종 스탯 계산 한 곳(지시서 016). 전투, 전투력, 위험도 추정이 모두 이 모듈을 쓴다.
 * 순서: 기본 스탯(계약자별 baseStats 또는 역할 기본값) × 레벨 성장 × 외부 배율 → 특성 효과 → (나중의 훈련·장비) → 상한.
 * 데이터만 쓴다(stats.json, traits.json).
 */
import { AUX_STATS, CORE_STATS, getElement, type GameTables, type Row, type Stats, type StatId, type TraitEffectRow, type TraitRow } from '../data';

/** 레벨 성장 배율: (1 + 성장률)^(레벨-1). 보조 스탯은 성장하지 않는다(1) */
export function levelScale(tables: GameTables, stat: StatId, level: number): number {
  const rate = (tables.stats.levelGrowthRate as Record<string, number>)[stat];
  return rate === undefined ? 1 : Math.pow(1 + rate, level - 1);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 레벨에 맞춘 스탯. 핵심 6개는 기본값 × 레벨 성장 × multiplier(몬스터 등급 등), 체력은 정수로 반올림.
 * 보조 3개는 기본값 그대로.
 */
export function statsAtLevel(tables: GameTables, base: Stats, level: number, multiplier = 1): Stats {
  const out = {} as Stats;
  for (const id of CORE_STATS) {
    const v = base[id] * levelScale(tables, id, level) * multiplier;
    out[id] = id === 'hp' ? Math.round(v) : round2(v);
  }
  for (const id of AUX_STATS) out[id] = base[id];
  return out;
}

/** 역할 기본값(레벨 1). 몬스터·일반병사, 그리고 baseStats가 없는 주인공이 쓴다 */
export function roleBaseStats(tables: GameTables, roleId: string): Stats {
  const row = tables.stats.roleBase[roleId];
  if (!row) throw new Error(`역할 스탯 표에 없는 역할: ${roleId}`);
  return { ...row.base };
}

// ── 특성 ─────────────────────────────────────────────

/** 유닛이 가진 특성(활성인 것만)과 단계 */
export interface TraitRef {
  id: string;
  rank: number;
}

export function getTrait(tables: GameTables, id: string): TraitRow {
  const t = tables.traits.traits.find((x) => x.id === id);
  if (!t) throw new Error(`특성 데이터에 없는 id: ${id}`);
  return t;
}

/** 슬롯 i의 특성이 열리는 레벨(슬롯 수보다 뒤면 Infinity) */
export const slotUnlockLevel = (tables: GameTables, slot: number) => tables.traits.slotUnlockLevels[slot] ?? Infinity;

/** 특성 목록(슬롯 순서) 중 이 레벨에서 켜진 것. 단계는 ranks(없으면 1) */
export function activeTraits(tables: GameTables, traitIds: readonly string[] | undefined, level: number, ranks: Record<string, number> = {}): TraitRef[] {
  return (traitIds ?? []).flatMap((id, slot) => (level >= slotUnlockLevel(tables, slot) ? [{ id, rank: ranks[id] ?? 1 }] : []));
}

/** 레벨이 from에서 to로 오를 때 새로 열린 특성 id */
export function newlyUnlockedTraits(tables: GameTables, traitIds: readonly string[] | undefined, from: number, to: number): string[] {
  return (traitIds ?? []).filter((_, slot) => from < slotUnlockLevel(tables, slot) && to >= slotUnlockLevel(tables, slot));
}

/** 특성 단계의 효과 행. 단계가 데이터보다 높으면 마지막 단계 */
function effectRows(tables: GameTables, ref: TraitRef): TraitEffectRow[] {
  const t = getTrait(tables, ref.id);
  return t.ranks[Math.min(ref.rank, t.ranks.length) - 1]?.effects ?? [];
}

/**
 * 계산 시점의 상황. 전투 밖(전투력·위험도·화면)은 기본값(전투 시작, 체력 가득, 상대 없음)을 쓴다.
 * opponent는 지금 계산 중인 공격의 상대(내가 공격하면 대상, 내가 맞으면 공격자).
 */
export interface StatContext {
  /** 내 체력 비율(0~1) */
  hpRatio?: number;
  /** 현재 라운드(1부터) */
  round?: number;
  /** 이번 행동이 이 유닛의 첫 행동인가 */
  firstAction?: boolean;
  row?: Row;
  opponentElement?: string;
  /** 같은 편 유닛들이 퍼뜨리는 allies 범위 효과(자기 것 포함) */
  allyAuras?: TraitEffectRow[];
  /** 치유 대상의 체력 비율(healMul의 hpBelow 판정용) */
  healTargetHpRatio?: number;
  /** 공격 대상의 체력 비율(targetHpBelow 판정용, 지시서 020). 없으면 가득 */
  targetHpRatio?: number;
}

/** 특성 효과 검증에 쓰는 이름 목록(알 수 없는 값은 실패) */
export const TRAIT_TRIGGERS = ['always', 'battleStart', 'firstAction', 'hpBelow', 'targetHpBelow', 'roundStack', 'fromRound'] as const;
export const TRAIT_CONDITIONS = ['advantage', 'disadvantage', 'enemyElement', 'row'] as const;
export const TRAIT_EFFECT_KINDS = ['statMul', 'statAdd', 'damageMul', 'damageTakenMul', 'healMul'] as const;

const strongAgainst = (tables: GameTables, a: string, b: string) => getElement(tables, a).strongAgainst.includes(b);

/** 효과 행이 지금 켜졌으면 그 값(roundStack은 쌓인 값), 아니면 null */
function activeValue(tables: GameTables, row: TraitEffectRow, selfElement: string, ctx: StatContext): number | null {
  const round = ctx.round ?? 1;
  const tr = row.trigger;
  let value = row.effect.value ?? 0;
  switch (tr.type) {
    case 'always':
      break;
    case 'battleStart':
      if (round > tr.rounds) return null;
      break;
    case 'firstAction':
      if (!ctx.firstAction) return null;
      break;
    case 'hpBelow': {
      const hp = row.effect.kind === 'healMul' ? ctx.healTargetHpRatio : ctx.hpRatio;
      if ((hp ?? 1) > tr.threshold) return null;
      break;
    }
    case 'targetHpBelow':
      if ((ctx.targetHpRatio ?? 1) > tr.threshold) return null;
      break;
    case 'roundStack':
      value = Math.min(tr.perRound * round, tr.max);
      break;
    case 'fromRound':
      if (round < tr.round) return null;
      break;
    default:
      throw new Error(`알 수 없는 특성 trigger: ${(tr as { type: string }).type}`);
  }
  const c = row.condition;
  if (c) {
    const opp = ctx.opponentElement;
    switch (c.type) {
      case 'advantage':
        if (!opp || !strongAgainst(tables, selfElement, opp)) return null;
        break;
      case 'disadvantage':
        if (!opp || !strongAgainst(tables, opp, selfElement)) return null;
        break;
      case 'enemyElement':
        if (opp !== c.element) return null;
        break;
      case 'row':
        if (ctx.row !== c.row) return null;
        break;
      default:
        throw new Error(`알 수 없는 특성 condition: ${(c as { type: string }).type}`);
    }
  }
  return value;
}

/** 스탯 계산에 필요한 유닛 정보 */
export interface StatUnit {
  element: string;
  /** 레벨·외부 배율까지 적용된 스탯(특성 전) */
  stats: Stats;
  traits?: TraitRef[];
}

/** 이 유닛의 특성이 퍼뜨리는 allies 범위 효과 행(always·battleStart만 허용) */
export function allyAuraRows(tables: GameTables, unit: StatUnit): TraitEffectRow[] {
  return (unit.traits ?? []).flatMap((ref) => effectRows(tables, ref)).filter((r) => r.effect.scope === 'allies');
}

/** 자기 효과 + 아군 효과(조건은 받는 쪽 기준으로 판정) */
function rowsFor(tables: GameTables, unit: StatUnit, ctx: StatContext): TraitEffectRow[] {
  const own = (unit.traits ?? []).flatMap((ref) => effectRows(tables, ref)).filter((r) => r.effect.scope === 'self');
  return [...own, ...(ctx.allyAuras ?? [])];
}

/**
 * 최종 스탯: 특성의 statMul(스탯별 합, 상한 statMulMax)과 statAdd를 더한 뒤 보조 스탯 상한(치명타율·회피율)을 적용한다.
 * 체력은 정수로 반올림.
 */
export function computeEffectiveStats(tables: GameTables, unit: StatUnit, ctx: StatContext = {}): Stats {
  const mul: Partial<Record<StatId, number>> = {};
  const add: Partial<Record<StatId, number>> = {};
  for (const row of rowsFor(tables, unit, ctx)) {
    const { kind, stat } = row.effect;
    if ((kind !== 'statMul' && kind !== 'statAdd') || !stat) continue;
    const v = activeValue(tables, row, unit.element, ctx);
    if (v === null) continue;
    if (kind === 'statMul') mul[stat] = (mul[stat] ?? 0) + v;
    else add[stat] = (add[stat] ?? 0) + v;
  }
  const cap = tables.traits.caps.statMulMax;
  const out = { ...unit.stats };
  for (const id of [...CORE_STATS, ...AUX_STATS]) {
    const m = Math.min(cap, mul[id] ?? 0);
    let v = unit.stats[id] * (1 + m) + (add[id] ?? 0);
    const limit = tables.stats.caps[id];
    if (limit !== undefined) v = Math.min(limit, v);
    out[id] = id === 'hp' ? Math.round(v) : Math.round(v * 10000) / 10000;
  }
  return out;
}

/**
 * 전투 시작 스탯(지시서 018): 같은 편 전체가 퍼뜨리는 아군 효과를 모두 반영한, 1라운드·체력 가득·각자 열의 최종 스탯.
 * 전투(시작 최대 체력)와 파티 전투력이 이 함수 하나를 쓴다.
 */
export function battleStartStats(tables: GameTables, side: readonly { unit: StatUnit; row?: Row }[]): Stats[] {
  const auras = side.flatMap((s) => allyAuraRows(tables, s.unit));
  return side.map((s) => computeEffectiveStats(tables, s.unit, { round: 1, hpRatio: 1, row: s.row, allyAuras: auras }));
}

/** stats.json 검증: 보조 스탯 최종 상한(치명타율·치명타 피해율·회피율) 키가 모두 있어야 한다(지시서 018) */
export const REQUIRED_STAT_CAPS = ['crit', 'critDmg', 'eva'] as const;
export function validateStatsTable(tables: GameTables): string[] {
  return REQUIRED_STAT_CAPS.filter((id) => typeof tables.stats.caps[id] !== 'number').map((id) => `stats.caps.${id}: 상한 값이 없음`);
}

/** 특성의 피해·받는 피해·치유 배율(1 + 합, 상한 적용) */
export function traitMultiplier(tables: GameTables, unit: StatUnit, kind: 'damageMul' | 'damageTakenMul' | 'healMul', ctx: StatContext = {}): number {
  let sum = 0;
  for (const row of rowsFor(tables, unit, ctx)) {
    if (row.effect.kind !== kind) continue;
    const v = activeValue(tables, row, unit.element, ctx);
    if (v !== null) sum += v;
  }
  const caps = tables.traits.caps;
  if (kind === 'damageMul') sum = Math.min(caps.damageMulMax, sum);
  if (kind === 'healMul') sum = Math.min(caps.healMulMax, sum);
  if (kind === 'damageTakenMul') sum = Math.max(caps.damageTakenMulMin, sum);
  return 1 + sum;
}

/** traits.json 검증(알 수 없는 trigger·condition·kind, allies 범위 제약, 스탯 id). 문제 목록 */
export function validateTraitsTable(tables: GameTables): string[] {
  const errors: string[] = [];
  const statIds = new Set<string>([...CORE_STATS, ...AUX_STATS]);
  const ids = new Set<string>();
  for (const t of tables.traits.traits) {
    if (ids.has(t.id)) errors.push(`${t.id}: 중복 id`);
    ids.add(t.id);
    if (t.ranks.length < 1 || t.ranks.length > t.maxRank) errors.push(`${t.id}: 단계 수(${t.ranks.length})가 maxRank(${t.maxRank})와 맞지 않음`);
    t.ranks.forEach((rank, ri) =>
      rank.effects.forEach((row, i) => {
        const p = `${t.id}.ranks[${ri}].effects[${i}]`;
        if (!(TRAIT_TRIGGERS as readonly string[]).includes(row.trigger.type)) errors.push(`${p}: 알 수 없는 trigger "${row.trigger.type}"`);
        if (row.condition && !(TRAIT_CONDITIONS as readonly string[]).includes(row.condition.type)) errors.push(`${p}: 알 수 없는 condition "${row.condition.type}"`);
        const e = row.effect;
        if (!(TRAIT_EFFECT_KINDS as readonly string[]).includes(e.kind)) errors.push(`${p}: 알 수 없는 effect.kind "${e.kind}"`);
        if ((e.kind === 'statMul' || e.kind === 'statAdd') && (!e.stat || !statIds.has(e.stat))) errors.push(`${p}: 스탯 id가 없거나 잘못됨 "${e.stat}"`);
        if (e.scope !== 'self' && e.scope !== 'allies') errors.push(`${p}: 알 수 없는 scope "${e.scope}"`);
        if (e.scope === 'allies' && row.trigger.type !== 'always' && row.trigger.type !== 'battleStart') errors.push(`${p}: allies 범위는 always·battleStart에만`);
        if (row.trigger.type !== 'roundStack' && typeof e.value !== 'number') errors.push(`${p}: value 없음`);
      }),
    );
  }
  return errors;
}
