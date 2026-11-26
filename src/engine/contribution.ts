/**
 * 활약도 기록(지시서 027). 전투 결과의 기여 측정값(combat.ts contributions)을 계약자별 시즌·통산 합계로 쌓고,
 * 역할 평균(기준값) 대비로 정규화한 활약도를 계산한다. 수치는 contribution.json(임시값).
 * 순위·보상은 028(리그)에서 한다.
 */
import type { GameTables } from '../data';
import type { CombatOutcome, ContributionTally } from './combat';

/**
 * 항목 합계 + 출전·클리어·쓰러짐(부상) 횟수. items 키는 contribution.json 항목 id.
 * 지시서 027b: 활약도는 공략마다 그 레벨 구간 기준값으로 낸 항목별 비율(값 ÷ 기준값)의 합(ratios)과,
 * 그 항목이 계산에 들어간 공략 수(ratioCounts)로 누적한다. items는 화면에 보여 줄 원값이다.
 */
export interface ActivityTally {
  sorties: number;
  clears: number;
  downs: number;
  items: Record<string, number>;
  ratios: Record<string, number>;
  ratioCounts: Record<string, number>;
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

const zeros = (tables: GameTables) => Object.fromEntries(tables.contribution.items.map((i) => [i.id, 0]));
export const emptyActivityTally = (tables: GameTables): ActivityTally => ({
  sorties: 0,
  clears: 0,
  downs: 0,
  items: zeros(tables),
  ratios: zeros(tables),
  ratioCounts: zeros(tables),
});

export const newActivityRecord = (tables: GameTables, day: number): ActivityRecord => ({
  career: emptyActivityTally(tables),
  season: { no: seasonOf(tables, day), ...emptyActivityTally(tables) },
  pastSeasons: [],
  recent: [],
});

/** 시즌 번호(한 곳에서만 정한다): floor((일차 − 1) ÷ 시즌 길이) + 1. 시즌 길이는 리그 규칙(지시서 028a, 60일) */
export function seasonOf(tables: Pick<GameTables, 'league'>, day: number): number {
  return Math.floor((Math.max(1, day) - 1) / tables.league.rules.season.length) + 1;
}
/** 시즌 안의 일차(1 ~ 시즌 길이) */
export function seasonDayOf(tables: Pick<GameTables, 'league'>, day: number): number {
  return ((Math.max(1, day) - 1) % tables.league.rules.season.length) + 1;
}

/** 레벨 구간(지시서 027b, contribution.json levelBands). 범위 밖이면 가장 가까운 구간 */
export function levelBandOf(tables: GameTables, level: number) {
  const bands = tables.contribution.levelBands;
  return bands.find((b) => level >= b.min && level <= b.max) ?? (level < bands[0].min ? bands[0] : bands[bands.length - 1]);
}

/** 역할·레벨 구간·항목의 기준값(공략 1회 평균). 없으면 0 */
export function baselineAt(tables: GameTables, role: string, level: number, item: string): number {
  return tables.contribution.baselines[role]?.[levelBandOf(tables, level).id]?.[item] ?? 0;
}

/** 이 역할·레벨에서 계산에 넣는 항목인가(가중치와 그 구간 기준값이 모두 0보다 크다) */
export function isApplicableAt(tables: GameTables, role: string, level: number, item: string): boolean {
  return (tables.contribution.weights[role]?.[item] ?? 0) > 0 && baselineAt(tables, role, level, item) > 0;
}

/**
 * 화면용 '해당 없음' 판정: 가중치가 0이거나, 누적에 그 항목이 한 번도 들어가지 않았고 지금 레벨 구간에서도 기준값이 0이면 해당 없음.
 */
export function isApplicable(tables: GameTables, role: string, item: string, tally?: ActivityTally, level?: number): boolean {
  if ((tables.contribution.weights[role]?.[item] ?? 0) <= 0) return false;
  if (tally && (tally.ratioCounts[item] ?? 0) > 0) return true;
  return level === undefined ? true : baselineAt(tables, role, level, item) > 0;
}

/** 공략 한 번의 항목별 비율(값 ÷ 그 레벨 구간 기준값). 계산에 들어가지 않는 항목은 빠진다 */
export function sortieRatios(tables: GameTables, role: string, level: number, items: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { id } of tables.contribution.items) {
    if (!isApplicableAt(tables, role, level, id)) continue;
    out[id] = (items[id] ?? 0) / baselineAt(tables, role, level, id);
  }
  return out;
}

/** 비율 합계와 공략 수로 낸 활약도: 100 × Σ(가중치 × 비율 합 ÷ 공략 수) ÷ Σ가중치(공략 수가 0인 항목은 빠짐). 없으면 null */
function scoreFrom(tables: GameTables, role: string, ratios: Record<string, number>, counts: Record<string, number>): number | null {
  let num = 0;
  let den = 0;
  for (const { id } of tables.contribution.items) {
    const n = counts[id] ?? 0;
    const w = tables.contribution.weights[role]?.[id] ?? 0;
    if (n <= 0 || w <= 0) continue;
    num += (w * (ratios[id] ?? 0)) / n;
    den += w;
  }
  return den > 0 ? (100 * num) / den : null;
}

/** 공략 한 번의 활약도(전투 시작 때 레벨의 구간 기준값). 같은 역할·같은 레벨대 평균이 100 */
export function sortieScore(tables: GameTables, role: string, level: number, items: Record<string, number>): number | null {
  const r = sortieRatios(tables, role, level, items);
  return scoreFrom(tables, role, r, Object.fromEntries(Object.keys(r).map((k) => [k, 1])));
}

/** 누적(시즌·통산) 활약도. 공략별 비율 합계로 다시 계산한다(레벨이 다른 공략을 섞어도 각자 구간으로 정규화). 출전 0이면 null */
export function activityScore(tables: GameTables, role: string, tally: ActivityTally): number | null {
  if (tally.sorties <= 0) return null;
  return scoreFrom(tables, role, tally.ratios, tally.ratioCounts);
}

/** 항목 하나의 같은 역할·레벨대 평균 대비 비율(1 = 평균). 그 항목이 들어간 공략이 없으면 null */
export function itemRatio(tally: ActivityTally, item: string): number | null {
  const n = tally.ratioCounts[item] ?? 0;
  return n > 0 ? (tally.ratios[item] ?? 0) / n : null;
}

const addTally = (t: ActivityTally, items: ContributionTally | Record<string, number>, ratios: Record<string, number>, clear: boolean, down: boolean) => {
  t.sorties += 1;
  if (clear) t.clears += 1;
  if (down) t.downs += 1;
  for (const [k, v] of Object.entries(items)) if (k in t.items) t.items[k] += v;
  for (const [k, v] of Object.entries(ratios)) {
    t.ratios[k] = (t.ratios[k] ?? 0) + v;
    t.ratioCounts[k] = (t.ratioCounts[k] ?? 0) + 1;
  }
};

export interface SortieInput {
  day: number;
  role: string;
  /** 전투 시작 때 레벨(그 공략의 기준값 구간) */
  level: number;
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
  const ratios = sortieRatios(tables, s.role, s.level, s.tally);
  addTally(rec.career, s.tally, ratios, clear, s.downed);
  addTally(rec.season, s.tally, ratios, clear, s.downed);
  // 최근 공략 점수는 그 시점 기준값으로 저장한다(나중에 기준값이 바뀌어도 그대로)
  const score = sortieScore(tables, s.role, s.level, s.tally);
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
