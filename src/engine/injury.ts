import type { GameTables } from '../data';
import type { CombatOutcome } from './combat';
import type { Rng } from './rng';
import type { Unit } from './unit';

export interface Injury {
  unitId: string;
  severity: string;
  days: number;
}

/**
 * 쓰러진 아군의 부상을 정한다. 부상을 쓰지 않는 유닛(몬스터 등)은 건너뛴다.
 * 파티에 치유사가 있으면 일수를 줄이되 최소 일수 아래로는 내리지 않는다.
 */
export function rollInjuries(
  tables: GameTables,
  party: Unit[],
  downedUnitIds: string[],
  outcome: CombatOutcome,
  rng: Rng,
  /** 시설(의무실) 등 추가 감소 일수. 사제 감소와 합산하고 최소 일수는 지킨다. */
  extraReductionDays = 0,
  /** 리프트 등급·변형의 부상 일수 배율(지시서 015, 기본 1). 감소 전에 곱하고 반올림한다 */
  daysMultiplier = 1,
): Injury[] {
  const cfg = tables.injuries;
  const light = cfg.severities.find((s) => s.id === 'light')!;
  const heavy = cfg.severities.find((s) => s.id === 'heavy')!;
  const hasHealer = party.some((u) => cfg.healerRoles.includes(u.role));
  const injuries: Injury[] = [];
  for (const unit of party) {
    if (!unit.usesInjury || !downedUnitIds.includes(unit.id)) continue;
    const sev = rng.chance(cfg.heavyChanceByOutcome[outcome]) ? heavy : light;
    let days = rng.int(sev.days[0], sev.days[1]);
    if (daysMultiplier !== 1) days = Math.max(cfg.minimumDays, Math.round(days * daysMultiplier));
    const reduction = (hasHealer ? cfg.healerReductionDays : 0) + extraReductionDays;
    if (reduction > 0) days = Math.max(cfg.minimumDays, days - reduction);
    injuries.push({ unitId: unit.id, severity: sev.id, days });
  }
  return injuries;
}
