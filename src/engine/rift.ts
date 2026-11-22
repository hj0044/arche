import { getMonsterGrade, getRiftTier, type GameTables, type Outcome, type RiftTierRow, type RiftVariantRow, type Row } from '../data';
import type { CombatSlot } from './combat';
import { createRng, type Rng } from './rng';
import { createMonster } from './unit';

export interface RiftEnemy {
  monsterId: string;
  grade: string;
  level: number;
  row: Row;
}

export interface RiftReward {
  zero: number;
  arche: number;
  materials: Record<string, number>;
}

export interface Rift {
  id: string;
  cityId: string;
  tier: string;
  name: string;
  appearedDay: number;
  /** 이 날까지 출발해야 한다. null이면 마감 없음(안정화된 통로). */
  deadlineDay: number | null;
  durationDays: number;
  enemies: RiftEnemy[];
  reward: RiftReward;
  /** 안정화된 통로: 마감이 없고 여러 번 공략할 수 있다 */
  stable?: boolean;
  /**
   * 흑막 징조 표식. 1단계는 연출(배지와 문구)만 하고 전투·보상·난이도에 영향을 주지 않는다.
   * 없으면 표식 없음. 징조 단계(공허 농도, 간부급·본체)는 확장에서 이 객체에 필드를 얹는다.
   */
  omen?: RiftOmen;
  /** 탐지소 흐림 오프셋(생길 때 시드로 정해 저장. 볼 때마다 범위가 흔들리지 않게 한다) */
  fog: RiftFog;
  /**
   * 영역 세력(지시서 013): 리프트가 생길 때 도시의 세력 영향력을 가중치로 정한다.
   * 1차에서는 표시와 선점 알림에만 쓴다. 고를 세력이 없으면 null(미정).
   */
  territoryFactionId: string | null;
  /** 등급 안의 변형 id(지시서 015). 등급에 변형이 없으면 없음 */
  variant?: string;
}

/** 리프트의 등급 변형 행(없으면 undefined) */
export function riftVariant(tables: GameTables, rift: Pick<Rift, 'tier' | 'variant'>): RiftVariantRow | undefined {
  if (!rift.variant) return undefined;
  return getRiftTier(tables, rift.tier).variants?.find((v) => v.id === rift.variant);
}

/** 보상·부상 배율 = 등급 배율 × 변형 배율(없으면 1). 데이터 한 곳에서 바꾸는 비교 실험용 자리(지시서 015) */
export function riftModifiers(tables: GameTables, rift: Pick<Rift, 'tier' | 'variant'>): { reward: number; injuryDays: number } {
  const tier = getRiftTier(tables, rift.tier);
  const v = riftVariant(tables, rift);
  return {
    reward: (tier.rewardMultiplier ?? 1) * (v?.rewardMultiplier ?? 1),
    injuryDays: (tier.injuryDaysMultiplier ?? 1) * (v?.injuryDaysMultiplier ?? 1),
  };
}

function pickVariant(tier: RiftTierRow, rng: Rng, fixed: boolean): RiftVariantRow | undefined {
  const rows = tier.variants;
  if (!rows?.length) return undefined;
  if (fixed) return rows[0];
  const id = weightedPick(Object.fromEntries(rows.map((v) => [v.id, v.weight])), rng);
  return rows.find((v) => v.id === id);
}

export interface RiftFog {
  /** 마감 범위 = [실제 − deadlineOffset, 그 + 폭] */
  deadlineOffset: number;
  levelOffset: number;
  countOffset: number;
  /** 0~1. 보상 범위의 아래쪽 배율 = 1 − 2 × spread × rewardU */
  rewardU: number;
}

export interface RiftOmen {
  /** omens.json의 문구 id */
  textId: string;
}

function weightedPick(weights: Record<string, number>, rng: Rng): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll < 0) return id;
  }
  return entries[entries.length - 1][0];
}

/**
 * 영역 세력 고르기. 가중치 = 그 도시의 세력 영향력(0 이하인 세력은 나오지 않음).
 * 데이터의 제외 목록(무소속 등)은 빼고, 고를 세력이 없으면 null.
 */
export function pickTerritoryFaction(tables: Pick<GameTables, 'factions' | 'riftPreemption'>, cityId: string, rng: Rng): string | null {
  const exclude = tables.riftPreemption.territoryExcludeFactions;
  const weights = Object.fromEntries(
    tables.factions.filter((f) => !exclude.includes(f.id)).map((f) => [f.id, f.cityInfluence[cityId] ?? 0] as const),
  );
  if (!Object.values(weights).some((w) => w > 0)) return null;
  return weightedPick(weights, rng);
}

const rollRange = (rng: Rng, [lo, hi]: [number, number]) => rng.int(lo, hi);

/** 도시의 출현 가중치로 등급을 골라 리프트 하나를 만든다. 1단계 몬스터는 모두 흑막 쪽이다. */
export function generateRift(
  tables: GameTables,
  cityId: string,
  day: number,
  id: string,
  rng: Rng,
  fixed?: { tier: string; grade?: string },
  /** 같은 도시에서 지금 쓰고 있는 리프트 이름(전체 이름). 고를 수 있으면 겹치지 않게 한다 */
  takenNames: readonly string[] = [],
): Rift {
  const city = tables.cities.find((c) => c.id === cityId);
  if (!city) throw new Error(`도시 데이터에 없는 id: ${cityId}`);
  const tier = getRiftTier(tables, fixed?.tier ?? weightedPick(city.riftSpawn.tierWeights, rng));
  // 변형은 별도 난수 흐름으로 고른다(변형이 없는 등급은 예전과 같은 결과). 시작 리프트(fixed)는 첫 행(기본 변형).
  const variant = pickVariant(tier, createRng(`variant:${rng.getState()}`), !!fixed);
  const grade = fixed?.grade ?? weightedPick(variant?.monsterGradeWeights ?? tier.monsterGradeWeights, rng);
  // 몬스터 등급의 레벨 범위와 리프트 등급(변형)의 레벨 범위가 겹치는 구간에서 고른다. 겹치지 않으면 등급 값으로 돌아간다.
  const gradeRange = getMonsterGrade(tables, grade).level;
  const window = (lv: [number, number]) => [Math.max(gradeRange[0], lv[0]), Math.min(gradeRange[1], lv[1])] as const;
  let [lo, hi] = window(variant?.monsterLevel ?? tier.monsterLevel);
  if (lo > hi) [lo, hi] = window(tier.monsterLevel);
  // levelSkew가 1보다 크면 낮은 레벨 쪽으로 치우친다(도시 색).
  const level = lo + Math.floor(Math.pow(rng.next(), variant?.levelSkew ?? city.riftSpawn.levelSkew) * (hi - lo + 1));
  const species = tables.monsters.filter((m) => m.grades.includes(grade));
  const pool = species.length ? species : tables.monsters;
  const count = rollRange(rng, variant?.enemyCount ?? tier.enemyCount);
  const enemies: RiftEnemy[] = Array.from({ length: count }, () => {
    const m = rng.pick(pool);
    const row = tables.roles.find((r) => r.id === m.role)?.defaultRow ?? 'front';
    return { monsterId: m.id, grade, level, row };
  });
  const materials: Record<string, number> = {};
  for (const [mat, range] of Object.entries(tier.rewards.materials)) materials[mat] = rollRange(rng, range);
  // 이름은 별도 난수 흐름으로 고른다(징조·흐림과 같은 방식). 예전에 이름을 고르던 자리의 난수 한 번은 그대로 소비해
  // 이름 목록이나 겹침 규칙을 바꿔도 마감·소요·보상 등 뒤의 값이 흔들리지 않게 한다.
  const nameRng = createRng(`name:${rng.getState()}`);
  rng.next();
  const fullName = (n: string) => `${city.name} ${n}`;
  const free = tier.names.filter((n) => !takenNames.includes(fullName(n)));
  // 고를 수 있는 이름이 모자라면 겹침을 허용한다.
  const name = fullName(nameRng.pick(free.length ? free : tier.names));
  const deadlineDay = day + rollRange(rng, tier.deadlineDays);
  const durationDays = rollRange(rng, tier.durationDays);
  const reward = { zero: rollRange(rng, tier.rewards.zero), arche: rollRange(rng, tier.rewards.arche), materials };
  // 흐림 오프셋은 별도 난수 흐름으로 굴린다(징조 표식 확률을 바꿔도 흐림이 흔들리지 않게).
  const fogRng = createRng(`fog:${rng.getState()}`);
  // 영역 세력도 별도 난수 흐름(기존 리프트 생성 결과가 바뀌지 않게).
  const territoryFactionId = pickTerritoryFaction(tables, cityId, createRng(`territory:${rng.getState()}`));
  // 징조 표식은 다른 값을 모두 정한 뒤에 굴려서, 표식 확률이나 문구를 바꿔도 리프트의 나머지 내용은 그대로다.
  const omen: RiftOmen | undefined =
    tables.omens.length > 0 && rng.chance(tier.omenChance) ? { textId: rng.pick(tables.omens).id } : undefined;
  const f = tables.facilities.fog;
  const fog: RiftFog = {
    deadlineOffset: fogRng.int(0, f.deadlineWidth),
    levelOffset: fogRng.int(0, f.levelWidth),
    countOffset: fogRng.int(0, f.countWidth),
    rewardU: Math.round(fogRng.next() * 1000) / 1000,
  };
  return {
    id,
    cityId,
    tier: tier.id,
    name,
    appearedDay: day,
    deadlineDay,
    durationDays,
    enemies,
    reward,
    ...(omen ? { omen } : {}),
    fog,
    territoryFactionId,
    ...(variant ? { variant: variant.id } : {}),
  };
}

export function riftEnemySlots(tables: GameTables, rift: Rift): CombatSlot[] {
  return rift.enemies.map((e, i) => {
    const species = tables.monsters.find((m) => m.id === e.monsterId);
    if (!species) throw new Error(`몬스터 데이터에 없는 id: ${e.monsterId}`);
    return {
      unit: createMonster(tables, {
        id: `${rift.id}_e${i}`,
        name: species.name,
        element: species.element,
        role: species.role,
        grade: e.grade,
        level: e.level,
      }),
      row: e.row,
    };
  });
}

/**
 * 결과별 실제 보상. 정산과 화면(리프트 카드)이 같은 함수를 쓴다.
 * = 기본 보상 × 등급·변형 보상 배율 × 결과 배율 × 안정화 통로 배율 × (1 + 레벨 배율 × 몬스터 레벨), 내림.
 */
export function riftReward(tables: GameTables, rift: Rift, outcome: Outcome): RiftReward {
  const prog = tables.progression;
  const ratio =
    riftModifiers(tables, rift).reward *
    prog.rewardRatioByOutcome[outcome] *
    (rift.stable ? prog.stablePassageRewardRatio : 1) *
    (1 + prog.rewardLevelScale * riftLevel(rift));
  return {
    zero: Math.floor(rift.reward.zero * ratio),
    arche: Math.floor(rift.reward.arche * ratio),
    materials: Object.fromEntries(
      Object.entries(rift.reward.materials)
        .map(([k, v]) => [k, Math.floor(v * ratio)] as const)
        .filter(([, v]) => v > 0),
    ),
  };
}

/** 리프트의 대표 몬스터 레벨(가장 높은 레벨) */
export function riftLevel(rift: Rift): number {
  return Math.max(...rift.enemies.map((e) => e.level));
}


/** 파견 결과별 한 명당 기준 경험치(나누기 전) = round(결과별 경험치 × 등급 배율 × (1 + 레벨 배율 × 몬스터 레벨)) */
export function expPerMemberAt(tables: GameTables, tier: string, outcome: Outcome, monsterLevel: number): number {
  const prog = tables.progression;
  const tierMult = prog.expTierMultiplier[tier] ?? 1;
  const levelMult = 1 + prog.expLevelScale * monsterLevel;
  return Math.round(prog.expByOutcome[outcome] * tierMult * levelMult);
}

export const expPerMember = (tables: GameTables, rift: Rift, outcome: Outcome) => expPerMemberAt(tables, rift.tier, outcome, riftLevel(rift));

/** 한 명당 기준 경험치를 파티 인원으로 나눈 몫: round(min(기준 × basePartySize ÷ 인원, 기준 × soloCapMultiplier)) */
export function shareOf(tables: GameTables, perMember: number, partySize: number): number {
  const { basePartySize, soloCapMultiplier } = tables.progression.expShare;
  if (partySize <= 0) return 0;
  return Math.round(Math.min((perMember * basePartySize) / partySize, perMember * soloCapMultiplier));
}

/**
 * 파견 경험치 나누기(지시서 009). 총량이 정해져 있고 참가자가 나눠 갖는다.
 * 파티 인원은 파견에 나간 전원(주인공, 쓰러진 사람 포함).
 */
export function expShare(tables: GameTables, rift: Rift, outcome: Outcome, partySize: number): number {
  return shareOf(tables, expPerMember(tables, rift, outcome), partySize);
}
