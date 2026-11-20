import { getMonsterGrade, getRiftTier, type GameTables, type Outcome, type Row } from '../data';
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

const rollRange = (rng: Rng, [lo, hi]: [number, number]) => rng.int(lo, hi);

/** 도시의 출현 가중치로 등급을 골라 리프트 하나를 만든다. 1단계 몬스터는 모두 흑막 쪽이다. */
export function generateRift(
  tables: GameTables,
  cityId: string,
  day: number,
  id: string,
  rng: Rng,
  fixed?: { tier: string; grade?: string },
): Rift {
  const city = tables.cities.find((c) => c.id === cityId);
  if (!city) throw new Error(`도시 데이터에 없는 id: ${cityId}`);
  const tier = getRiftTier(tables, fixed?.tier ?? weightedPick(city.riftSpawn.tierWeights, rng));
  const grade = fixed?.grade ?? weightedPick(tier.monsterGradeWeights, rng);
  // 몬스터 등급의 레벨 범위와 리프트 등급의 레벨 범위가 겹치는 구간에서 고른다.
  const gradeRange = getMonsterGrade(tables, grade).level;
  const lo = Math.max(gradeRange[0], tier.monsterLevel[0]);
  const hi = Math.min(gradeRange[1], tier.monsterLevel[1]);
  // levelSkew가 1보다 크면 낮은 레벨 쪽으로 치우친다(도시 색).
  const level = lo + Math.floor(Math.pow(rng.next(), city.riftSpawn.levelSkew) * (hi - lo + 1));
  const species = tables.monsters.filter((m) => m.grades.includes(grade));
  const pool = species.length ? species : tables.monsters;
  const count = rollRange(rng, tier.enemyCount);
  const enemies: RiftEnemy[] = Array.from({ length: count }, () => {
    const m = rng.pick(pool);
    const row = tables.roles.find((r) => r.id === m.role)?.defaultRow ?? 'front';
    return { monsterId: m.id, grade, level, row };
  });
  const materials: Record<string, number> = {};
  for (const [mat, range] of Object.entries(tier.rewards.materials)) materials[mat] = rollRange(rng, range);
  const name = `${city.name} ${rng.pick(tier.names)}`;
  const deadlineDay = day + rollRange(rng, tier.deadlineDays);
  const durationDays = rollRange(rng, tier.durationDays);
  const reward = { zero: rollRange(rng, tier.rewards.zero), arche: rollRange(rng, tier.rewards.arche), materials };
  // 흐림 오프셋은 별도 난수 흐름으로 굴린다(징조 표식 확률을 바꿔도 흐림이 흔들리지 않게).
  const fogRng = createRng(`fog:${rng.getState()}`);
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
 * = 기본 보상 × 결과 배율 × 안정화 통로 배율 × (1 + 레벨 배율 × 몬스터 레벨), 내림.
 */
export function riftReward(tables: GameTables, rift: Rift, outcome: Outcome): RiftReward {
  const prog = tables.progression;
  const ratio =
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

