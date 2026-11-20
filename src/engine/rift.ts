import { getMonsterGrade, getRiftTier, type GameTables, type Row } from '../data';
import type { CombatSlot } from './combat';
import type { Rng } from './rng';
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
  // 징조 표식은 다른 값을 모두 정한 뒤에 굴려서, 표식 확률이나 문구를 바꿔도 리프트의 나머지 내용은 그대로다.
  const omen: RiftOmen | undefined =
    tables.omens.length > 0 && rng.chance(tier.omenChance) ? { textId: rng.pick(tables.omens).id } : undefined;
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
