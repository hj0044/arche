// 외곽 임무(지시서 022): 쉬는 계약자를 하루가 끝날 때 자동으로 일에 배치한다. 전투 없이 시드로 결과가 정해진다.
// 종류·보상·경상 확률은 outerMissions.json. 같은 입력과 같은 시드면 같은 결과(계약자마다 전용 난수 흐름).
import type { GameTables } from '../data';
import { loyaltyTier } from './loyalty';
import { createRng } from './rng';

/** 계약자 한 명의 외곽 임무 결과 */
export interface OuterResult {
  mercId: string;
  missionId: string;
  exp: number;
  zero: number;
  arche: number;
  /** 경상이면 부상 일수 */
  injuryDays?: number;
}

/** 배치 판단에 필요한 계약자 정보 */
export interface OuterCandidate {
  id: string;
  level: number;
  cap: number;
  loyaltyValue?: number;
}

/** 충성도 구간 때문에 빠지는가(위험 구간 등, 데이터 excludeLoyaltyTiers) */
export function outerExcludedByLoyalty(tables: GameTables, loyaltyValue: number | undefined): boolean {
  return loyaltyValue !== undefined && tables.outerMissions.excludeLoyaltyTiers.includes(loyaltyTier(tables, loyaltyValue).id);
}

/**
 * 후보(오늘 쉰 계약자) 중 배치할 사람과 결과. day는 정산하는 날(넘기기 전 날짜).
 * 순수 함수: 상태를 바꾸지 않는다.
 */
export function planOuterMissions(tables: GameTables, seed: string, day: number, candidates: OuterCandidate[]): OuterResult[] {
  const cfg = tables.outerMissions;
  const total = cfg.types.reduce((a, t) => a + t.weight, 0);
  const severity = tables.injuries.severities.find((s) => s.id === cfg.injury.severity);
  const out: OuterResult[] = [];
  for (const c of candidates) {
    if (outerExcludedByLoyalty(tables, c.loyaltyValue)) continue;
    // 뽑는 순서와 개수는 결과와 상관없이 늘 같다: 종류 → 아르케 → 아르케 양 → 경상 → 경상 일수
    const rng = createRng(`${seed}:outer:${day}:${c.id}`);
    let roll = rng.next() * total;
    let type = cfg.types[cfg.types.length - 1];
    for (const t of cfg.types) {
      roll -= t.weight;
      if (roll < 0) {
        type = t;
        break;
      }
    }
    const archeRoll = rng.next();
    const archeAmount = type.arche ? rng.int(type.arche.amount[0], type.arche.amount[1]) : rng.next();
    const injured = rng.chance(cfg.injury.chance);
    const injuryDays = severity ? rng.int(severity.days[0], severity.days[1]) : 0;
    const exp = type.exp && c.level < c.cap ? Math.round(type.exp.base + type.exp.perLevel * c.level) : 0;
    const zero = type.zero ? Math.round(type.zero.base + type.zero.perLevel * c.level) : 0;
    const arche = type.arche && archeRoll < type.arche.chance ? (archeAmount as number) : 0;
    out.push({ mercId: c.id, missionId: type.id, exp, zero, arche, ...(injured && severity ? { injuryDays } : {}) });
  }
  return out;
}
