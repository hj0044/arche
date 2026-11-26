/**
 * 활약도 기록(지시서 027). 전투 결과의 기여 측정값(combat.ts contributions)을 계약자별 시즌·통산 합계로 쌓고,
 * 역할 평균(기준값) 대비로 정규화한 활약도를 계산한다. 수치는 contribution.json(임시값).
 * 순위·보상은 028(리그)에서 한다.
 */
import type { GameTables } from '../data';
import type { CombatOutcome, ContributionTally } from './combat';

/** 항목 합계 + 출전·클리어·쓰러짐(부상) 횟수. items 키는 contribution.json 항목 id */
export interface ActivityTally {
  sorties: number;
  clears: number;
  downs: number;
  items: Record<string, number>;
}

export interface ActivityRecent {
  day: number;
  riftName: string;
  tier: string;
  /** 이 공략의 활약도(정수). 계산할 항목이 없으면 null */
  score: number | null;
  outcome: CombatOutcome;
}

/** 계약자 한 명의 기록. 길드를 떠나도 남는다 */
export interface ActivityRecord {
  career: ActivityTally;
  season: { no: number } & ActivityTally;
  /** 지난 시즌 합계(오래된 것부터, 최근 pastSeasonsLimit개) */
  pastSeasons: ({ no: number } & ActivityTally)[];
  /** 최근 공략(최신이 앞, 최대 recentLimit건) */
  recent: ActivityRecent[];
}

export const emptyActivityTally = (tables: GameTables): ActivityTally => ({
  sorties: 0,
  clears: 0,
  downs: 0,
  items: Object.fromEntries(tables.contribution.items.map((i) => [i.id, 0])),
});

export const newActivityRecord = (tables: GameTables, day: number): ActivityRecord => ({
  career: emptyActivityTally(tables),
  season: { no: seasonOf(tables, day), ...emptyActivityTally(tables) },
  pastSeasons: [],
  recent: [],
});

/** 시즌 번호(한 곳에서만 정한다. 028 리그 시즌이 생기면 여기를 바꾼다): floor((일차 − 1) ÷ 시즌 길이) + 1 */
export function seasonOf(tables: GameTables, day: number): number {
  return Math.floor((Math.max(1, day) - 1) / tables.contribution.seasonDays) + 1;
}

/** 이 역할에서 계산에 넣는 항목인가(가중치와 기준값이 모두 0보다 크다). 아니면 화면에 '이 역할은 해당 없음' */
export function isApplicable(tables: GameTables, role: string, item: string): boolean {
  const w = tables.contribution.weights[role]?.[item] ?? 0;
  const b = tables.contribution.baselines[role]?.[item] ?? 0;
  return w > 0 && b > 0;
}

/** 항목 하나의 역할 평균 대비 비율(1 = 평균). 공략 1회 평균(합계 ÷ 출전)을 기준값과 비교한다. 해당 없거나 출전 0이면 null */
export function itemRatio(tables: GameTables, role: string, item: string, total: number, sorties: number): number | null {
  if (sorties <= 0 || !isApplicable(tables, role, item)) return null;
  return total / sorties / tables.contribution.baselines[role][item];
}

/**
 * 활약도 = 100 × Σ(가중치 × 내 값 ÷ 기준값) ÷ Σ 가중치. 누적은 항목 합계로 다시 계산한다(공략별 점수의 평균이 아니다).
 * 출전 0이거나 계산할 항목이 없으면 null(화면 "—").
 */
export function activityScore(tables: GameTables, role: string, items: Record<string, number>, sorties: number): number | null {
  if (sorties <= 0) return null;
  let num = 0;
  let den = 0;
  for (const { id } of tables.contribution.items) {
    const r = itemRatio(tables, role, id, items[id] ?? 0, sorties);
    if (r === null) continue;
    const w = tables.contribution.weights[role][id];
    num += w * r;
    den += w;
  }
  return den > 0 ? (100 * num) / den : null;
}

const addTally = (t: ActivityTally, items: ContributionTally | Record<string, number>, clear: boolean, down: boolean) => {
  t.sorties += 1;
  if (clear) t.clears += 1;
  if (down) t.downs += 1;
  for (const [k, v] of Object.entries(items)) if (k in t.items) t.items[k] += v;
};

export interface SortieInput {
  day: number;
  role: string;
  riftName: string;
  tier: string;
  outcome: CombatOutcome;
  downed: boolean;
  tally: ContributionTally;
}

/** 공략 한 번을 기록에 더한다(새 기록을 돌려준다). 시즌이 바뀌었으면 지난 시즌 합계를 보관하고 새로 시작한다 */
export function recordSortie(tables: GameTables, prev: ActivityRecord | undefined, s: SortieInput): ActivityRecord {
  const rec: ActivityRecord = prev ? structuredClone(prev) : newActivityRecord(tables, s.day);
  rollSeason(tables, rec, s.day);
  const clear = s.outcome === 'victory';
  addTally(rec.career, s.tally, clear, s.downed);
  addTally(rec.season, s.tally, clear, s.downed);
  const score = activityScore(tables, s.role, s.tally, 1);
  rec.recent = [{ day: s.day, riftName: s.riftName, tier: s.tier, score: score === null ? null : Math.round(score), outcome: s.outcome }, ...rec.recent].slice(
    0,
    tables.contribution.recentLimit,
  );
  return rec;
}

function rollSeason(tables: GameTables, rec: ActivityRecord, day: number) {
  const no = seasonOf(tables, day);
  if (rec.season.no === no) return;
  if (rec.season.sorties > 0) rec.pastSeasons = [...rec.pastSeasons, rec.season].slice(-tables.contribution.pastSeasonsLimit);
  rec.season = { no, ...emptyActivityTally(tables) };
}

/** 화면용: 오늘 기준 이번 시즌 합계(기록이 지난 시즌에 멈춰 있으면 0) */
export function currentSeasonTally(tables: GameTables, rec: ActivityRecord | undefined, day: number): ActivityTally {
  if (!rec || rec.season.no !== seasonOf(tables, day)) return emptyActivityTally(tables);
  return rec.season;
}
