import { getRiftTier, type GameTables, type Row } from '../data';
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
export function generateRift(tables: GameTables, cityId: string, day: number, id: string, rng: Rng): Rift {
  const city = tables.cities.find((c) => c.id === cityId);
  if (!city) throw new Error(`도시 데이터에 없는 id: ${cityId}`);
  const tier = getRiftTier(tables, weightedPick(city.riftSpawn.tierWeights, rng));
  const grade = rng.pick(tier.monsterGrades);
  const level = rollRange(rng, tier.monsterLevel);
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
  return {
    id,
    cityId,
    tier: tier.id,
    name: `${city.name} ${rng.pick(tier.names)}`,
    appearedDay: day,
    deadlineDay: day + rollRange(rng, tier.deadlineDays),
    durationDays: rollRange(rng, tier.durationDays),
    enemies,
    reward: { zero: rollRange(rng, tier.rewards.zero), arche: rollRange(rng, tier.rewards.arche), materials },
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
