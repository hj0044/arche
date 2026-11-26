/**
 * 리그 세계(지시서 028a): NPC 용병단 39팀, 계약자 명단, 시즌 점수 곡선, 간이 정산·시즌 정산(승강·변동), 순위.
 * 화면은 없다(028c). 우리 용병단 자리는 점수를 밖에서 넣는 인터페이스(setPlayerScore)만 둔다(연결은 028b).
 *
 * 원칙
 * - 점수가 먼저고 구성은 나중이다. 팀 시즌 총점 = 등급 목표 × (1 + 난수 폭 × u). NPC는 성장하지 않는다.
 * - 하루 누적 점수와 계약자 활약도는 시드로 다시 계산한다(세이브에는 곡선 파라미터만 둔다).
 * - 이적·은퇴·신입·규모 변동은 점수에 영향이 없는 연출이다. 은퇴는 명단에서 빠질 뿐이다(영구 사망 없음).
 * - 이 모듈의 함수는 넘겨받은 상태를 고친다(advanceDay가 이미 복사본을 넘긴다). 순위·점수 조회는 읽기만 한다.
 */
import type { GameTables, LeagueTierRow } from '../../data';
import { seasonDayOf } from '../contribution';
import { generateName, nameKey, type Gender } from '../names';
import { createRng, type Rng } from '../rng';

export const PLAYER_TEAM_ID = 'player';

type T = Pick<GameTables, 'league' | 'namePool' | 'roles' | 'elements' | 'backgrounds' | 'roster'>;

export interface LeagueTeam {
  id: string;
  name: string;
  kind: 'named' | 'civil';
  faction: string;
  homeCity: string | null;
  /** 규모 단계 1~5 */
  scaleTier: number;
  /** 리그 등급 id */
  tier: string;
  /** 이번 시즌 총점(곡선 끝값) */
  total: number;
  /** 이번 시즌 누적 곡선 모양((일/길이)^shape) */
  shape: number;
}

export interface LeagueMember {
  id: string;
  teamId: string;
  name: string;
  cultureId: string;
  gender: Gender;
  age: number;
  role: string;
  element: string;
  hometown: string;
  background: string;
  /** 설정 용병단 대표 인물의 직책 */
  post?: string;
  /** featured.json id(대표 인물은 은퇴·이적·방출하지 않는다) */
  featuredId?: string;
  /** 성장 한계(신입은 원래 로스터 분포에서 뽑는다) */
  cap: number;
  /** 개인 재능(시즌 활약도 배율, 팀을 옮겨도 유지) */
  talent: number;
  /** 이번 시즌 최종 활약도(곡선 끝값) */
  act: number;
  /** 통산 기록(이적해도 유지) */
  career: { seasons: number; activitySum: number; transfers: number };
  /** 같은 유닛 틀로 넓힐 자리(지금은 비움) */
  unit?: Record<string, unknown>;
}

export interface StandingRow {
  id: string;
  score: number;
}

export interface LeagueCheckpoint {
  season: number;
  day: number;
  /** 등급 id → 순위(점수 내림차순) */
  standings: Record<string, StandingRow[]>;
  /** 역할 id → 활약도 상위 3명 */
  topByRole: Record<string, { memberId: string; activity: number }[]>;
}

export interface LeagueHistory {
  season: number;
  standings: Record<string, StandingRow[]>;
  promoted: { id: string; from: string; to: string }[];
  relegated: { id: string; from: string; to: string }[];
  renamed: { id: string; from: string; to: string }[];
  scaleMoves: { id: string; from: number; to: number }[];
  transfers: number;
  retired: number;
  recruits: number;
}

export interface LeagueState {
  seed: string;
  season: number;
  teams: LeagueTeam[];
  members: LeagueMember[];
  /** 우리 용병단 자리. score는 밖에서 넣는다(028b) */
  player: { tier: string; score: number };
  /** 이번 시즌 간이 정산 */
  checkpoints: LeagueCheckpoint[];
  /** 지난 시즌 정산(최근 historyLimit개) */
  history: LeagueHistory[];
  counters: { member: number };
}

// ── 작은 도구

const tierRow = (t: T, id: string): LeagueTierRow => {
  const r = t.league.rules.tiers.find((x) => x.id === id);
  if (!r) throw new Error(`없는 리그 등급: ${id}`);
  return r;
};
const scaleRow = (t: T, tier: number) => t.league.rules.scaleTiers.find((x) => x.tier === tier)!;
const tiersByOrder = (t: T) => [...t.league.rules.tiers].sort((a, b) => a.order - b.order);
/** 표준 정규분포(박스-뮬러) */
const gauss = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
const round1 = (x: number) => Math.round(x * 10) / 10;
/** 시드가 같으면 같은 순서로 섞는다 */
function shuffle<X>(rng: Rng, xs: X[]): X[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 초기화

/**
 * teams.json의 리그 힌트를 등급으로 바꾼다. 위 등급부터 채우고, 후보 중 '갈 수 있는 가장 낮은 등급이 높은 팀'(다른 곳에 갈 수 없는 팀),
 * 힌트 범위가 좁은 팀, 설정 용병단 순으로 먼저 고른다. 같은 조건이면 시드로 섞은 순서. 우리 용병단 자리는 시작 등급에서 하나 비운다.
 */
export function assignInitialTiers(t: T, rng: Rng): Map<string, string> {
  const rules = t.league.rules;
  const order = new Map(rules.tiers.map((x) => [x.id, x.order]));
  const range = (hint: string) => (rules.hintTiers[hint] ?? rules.tiers.map((x) => x.id)).map((id) => order.get(id)!);
  const pending = shuffle(rng, t.league.teams);
  const out = new Map<string, string>();
  for (const tier of [...rules.tiers].sort((a, b) => b.order - a.order)) {
    const need = tier.teams - (tier.id === rules.playerStartTier ? 1 : 0);
    const cands = pending.filter((x) => !out.has(x.id) && range(x.leagueHint).includes(tier.order));
    cands.sort((a, b) => {
      const ra = range(a.leagueHint);
      const rb = range(b.leagueHint);
      return Math.min(...rb) - Math.min(...ra) || ra.length - rb.length || (a.kind === 'named' ? 0 : 1) - (b.kind === 'named' ? 0 : 1);
    });
    if (cands.length < need) throw new Error(`${tier.name}에 넣을 팀이 모자란다(${cands.length}/${need})`);
    for (const x of cands.slice(0, need)) out.set(x.id, tier.id);
  }
  return out;
}

function rosterCaps(t: T): number[] {
  return t.roster.map((r) => r.growth.cap);
}

function newMember(t: T, league: LeagueState, rng: Rng, teamId: string, used: Set<string>, recruit: boolean): LeagueMember {
  const m = t.league.rules.members;
  const gender = rng.pick(['m', 'f', 'n'] as const);
  const name = generateName(t, rng, { gender, used });
  const roles = t.roles.filter((r) => r.enabled).map((r) => r.id);
  const caps = rosterCaps(t);
  const cap = rng.pick(caps);
  league.counters.member += 1;
  return {
    id: `n${league.counters.member}`,
    teamId,
    name: name.display,
    cultureId: name.cultureId,
    gender,
    age: recruit ? rng.int(m.recruitAgeMin, m.recruitAgeMax) : rng.int(m.ageMin, m.ageMax),
    role: rng.pick(roles),
    element: rng.pick(t.elements.map((e) => e.id)),
    hometown: rng.pick(t.league.rules.names.cities),
    background: rng.pick(t.backgrounds.map((b) => b.id)),
    cap,
    talent: talentOf(t, rng, cap),
    act: 0,
    career: { seasons: 0, activitySum: 0, transfers: 0 },
  };
}

function talentOf(t: T, rng: Rng, cap: number): number {
  const m = t.league.rules.members;
  const caps = rosterCaps(t);
  const mean = caps.reduce((a, x) => a + x, 0) / caps.length;
  return round1(100 * Math.exp(m.talentSpread * gauss(rng)) * (cap / mean) ** m.capInfluence) / 100;
}

/** 리그 세계를 처음 만든다. used: 이미 쓰는 이름(우리 계약자 등, 공백 무시) */
export function initLeague(t: T, seed: string, usedNames: Iterable<string> = []): LeagueState {
  const rng = createRng(`${seed}:league:init`);
  const used = new Set([...usedNames].map(nameKey));
  const tiers = assignInitialTiers(t, rng);
  const league: LeagueState = {
    seed,
    season: 1,
    teams: [],
    members: [],
    player: { tier: t.league.rules.playerStartTier, score: 0 },
    checkpoints: [],
    history: [],
    counters: { member: 0 },
  };
  for (const f of t.league.featured) used.add(nameKey(f.name));
  for (const row of t.league.teams) {
    league.teams.push({ id: row.id, name: row.name, kind: row.kind, faction: row.faction, homeCity: row.homeCity, scaleTier: row.sizeTier, tier: tiers.get(row.id)!, total: 0, shape: 1 });
    const sc = scaleRow(t, row.sizeTier);
    const size = rng.int(sc.min, sc.max);
    const featured = t.league.featured.filter((f) => f.teamId === row.id);
    for (const f of featured) {
      const cap = rng.pick(rosterCaps(t));
      league.counters.member += 1;
      league.members.push({
        id: `n${league.counters.member}`,
        teamId: row.id,
        name: f.name,
        cultureId: f.cultureId,
        gender: f.gender,
        age: f.age,
        role: f.role,
        element: f.element,
        hometown: f.hometown,
        background: f.background,
        post: f.post,
        featuredId: f.id,
        cap,
        talent: talentOf(t, rng, cap),
        act: 0,
        career: { seasons: 0, activitySum: 0, transfers: 0 },
      });
    }
    for (let i = featured.length; i < size; i++) league.members.push(newMember(t, league, rng, row.id, used, false));
  }
  setupSeason(t, league);
  return league;
}

/** 시즌 시작: 팀 총점·곡선 모양, 계약자 시즌 활약도(재능·규모·상위 강자·팀 성적) */
function setupSeason(t: T, league: LeagueState) {
  const rules = t.league.rules;
  const rng = createRng(`${league.seed}:league:season:${league.season}`);
  for (const team of league.teams) {
    const tier = tierRow(t, team.tier);
    team.total = Math.round(tier.targetScore * (1 + tier.spread * (2 * rng.next() - 1)));
    team.shape = round1(rng.float(rules.curve.shapeMin, rules.curve.shapeMax) * 100) / 100;
    const sc = scaleRow(t, team.scaleTier);
    const ms = membersOf(league, team.id).sort((a, b) => b.talent - a.talent || a.id.localeCompare(b.id));
    const starCount = ms.length > sc.stars ? sc.stars : 0;
    const form = team.total / tier.targetScore;
    ms.forEach((m, i) => {
      m.act = round1(tier.activityBase * sc.individualMul * m.talent * (i < starCount ? rules.members.starMul : 1) * form);
    });
  }
}

export const membersOf = (league: LeagueState, teamId: string) => league.members.filter((m) => m.teamId === teamId);

// ── 점수 곡선(시드로 다시 계산)

/** 팀의 시즌 누적 점수(시즌 day일까지, 1~길이). 하루 몫 = 모양 곡선 증가분 × (1 ± dailyNoise), 시즌 끝에 총점과 같다 */
export function teamScoreAt(t: Pick<GameTables, 'league'>, league: LeagueState, team: LeagueTeam, day: number): number {
  const L = t.league.rules.season.length;
  const d = Math.max(0, Math.min(L, day));
  if (d === 0) return 0;
  const rng = createRng(`${league.seed}:league:curve:${league.season}:${team.id}`);
  let sum = 0;
  let upTo = 0;
  for (let i = 1; i <= L; i++) {
    const base = (i / L) ** team.shape - ((i - 1) / L) ** team.shape;
    const inc = base * (1 + t.league.rules.curve.dailyNoise * (2 * rng.next() - 1));
    sum += inc;
    if (i === d) upTo = sum;
  }
  return Math.round((team.total * upTo) / sum);
}

/** 계약자의 시즌 활약도(시즌 day일 기준). 시즌 초에는 흔들리고 시즌 끝에는 최종값이다 */
export function memberActivityAt(t: Pick<GameTables, 'league'>, league: LeagueState, m: LeagueMember, day: number): number {
  const L = t.league.rules.season.length;
  const d = Math.max(1, Math.min(L, day));
  if (d === L) return m.act;
  const z = 2 * createRng(`${league.seed}:league:act:${league.season}:${m.id}:${d}`).next() - 1;
  const fade = 1 / Math.sqrt(d) - 1 / Math.sqrt(L);
  return round1(Math.max(0, m.act * (1 + t.league.rules.curve.activityDailyNoise * z * fade)));
}

// ── 순위

/** 등급별 순위(우리 용병단 자리 포함). 점수 내림차순, 같으면 id 순(우리 자리는 같은 점수의 맨 뒤) */
export function tierStandings(t: Pick<GameTables, 'league'>, league: LeagueState, day: number): Record<string, StandingRow[]> {
  const out: Record<string, StandingRow[]> = {};
  for (const tier of t.league.rules.tiers) {
    const rows: StandingRow[] = league.teams.filter((x) => x.tier === tier.id).map((x) => ({ id: x.id, score: teamScoreAt(t, league, x, day) }));
    if (league.player.tier === tier.id) rows.push({ id: PLAYER_TEAM_ID, score: league.player.score });
    rows.sort((a, b) => b.score - a.score || Number(a.id === PLAYER_TEAM_ID) - Number(b.id === PLAYER_TEAM_ID) || a.id.localeCompare(b.id));
    out[tier.id] = rows;
  }
  return out;
}

/** 전체 순위: 높은 등급이 먼저, 같은 등급은 점수 순 */
export function overallStandings(t: Pick<GameTables, 'league'>, league: LeagueState, day: number): (StandingRow & { tier: string; rank: number })[] {
  const by = tierStandings(t, league, day);
  return [...t.league.rules.tiers]
    .sort((a, b) => b.order - a.order)
    .flatMap((tier) => by[tier.id].map((r) => ({ ...r, tier: tier.id })))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 우리 계약자 등 밖에서 넣는 활약도(027 기록) */
export interface ExternalActivity {
  id: string;
  name: string;
  role: string;
  season: number | null;
  career: number | null;
}

export interface MemberRankRow {
  id: string;
  name: string;
  role: string;
  teamId: string;
  activity: number;
  rank: number;
}

/**
 * 계약자 활약도 순위. scope 'season'은 시즌 day일 기준, 'career'는 통산 평균(지난 시즌 활약도 평균, 이번 시즌 제외).
 * role을 주면 그 역할만. external은 우리 계약자(팀 id는 player)
 */
export function memberRankings(
  t: Pick<GameTables, 'league'>,
  league: LeagueState,
  opts: { day: number; scope: 'season' | 'career'; role?: string; external?: ExternalActivity[] },
): MemberRankRow[] {
  const rows: Omit<MemberRankRow, 'rank'>[] = [];
  for (const m of league.members) {
    if (opts.role && m.role !== opts.role) continue;
    const activity = opts.scope === 'season' ? memberActivityAt(t, league, m, opts.day) : m.career.seasons ? round1(m.career.activitySum / m.career.seasons) : null;
    if (activity === null) continue;
    rows.push({ id: m.id, name: m.name, role: m.role, teamId: m.teamId, activity });
  }
  for (const e of opts.external ?? []) {
    if (opts.role && e.role !== opts.role) continue;
    const activity = opts.scope === 'season' ? e.season : e.career;
    if (activity === null) continue;
    rows.push({ id: e.id, name: e.name, role: e.role, teamId: PLAYER_TEAM_ID, activity });
  }
  rows.sort((a, b) => b.activity - a.activity || a.id.localeCompare(b.id));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ── 진행

/** 우리 용병단 점수(028b에서 연결). 기본 0이면 시작 등급 최하위 */
export function setPlayerScore(league: LeagueState, score: number) {
  league.player.score = score;
}

/** 간이 정산(승강·변동 없음): 그 시점 순위와 역할별 활약도 상위 3명 */
export function checkpointStandings(t: T, league: LeagueState, day: number): LeagueCheckpoint {
  const topByRole: LeagueCheckpoint['topByRole'] = {};
  for (const r of t.roles.filter((x) => x.enabled)) {
    topByRole[r.id] = memberRankings(t, league, { day, scope: 'season', role: r.id })
      .slice(0, 3)
      .map((x) => ({ memberId: x.id, activity: x.activity }));
  }
  return { season: league.season, day, standings: tierStandings(t, league, day), topByRole };
}

/**
 * 하루가 끝났다(completedDay는 끝난 게임 일차). 간이 정산 일차면 스냅샷을 남기고, 시즌 마지막 날이면 시즌을 정산한다.
 * 점수는 곡선에서 다시 계산하므로 하루마다 쌓을 값은 없다.
 */
export function advanceLeagueDay(t: T, league: LeagueState, completedDay: number): void {
  const sd = seasonDayOf(t, completedDay);
  if (t.league.rules.season.checkpoints.includes(sd)) league.checkpoints.push(checkpointStandings(t, league, sd));
  if (sd === t.league.rules.season.length) settleSeason(t, league);
}

// ── 시즌 정산

/** 시즌 말 정산: ① 최종 순위 ② 승강(우리 자리도 같은 규칙) ③ 팀 변동 ④ 분포 보정 ⑤ 새 시즌 */
export function settleSeason(t: T, league: LeagueState): LeagueHistory {
  const rules = t.league.rules;
  const L = rules.season.length;
  const rng = createRng(`${league.seed}:league:settle:${league.season}`);
  const standings = tierStandings(t, league, L);
  const tiers = tiersByOrder(t);

  // ② 승강
  const promoted: LeagueHistory['promoted'] = [];
  const relegated: LeagueHistory['relegated'] = [];
  tiers.forEach((tier, i) => {
    const rows = standings[tier.id];
    if (i < tiers.length - 1) for (const r of rows.slice(0, tier.promote)) promoted.push({ id: r.id, from: tier.id, to: tiers[i + 1].id });
    if (i > 0 && tier.relegate > 0) for (const r of rows.slice(rows.length - tier.relegate)) relegated.push({ id: r.id, from: tier.id, to: tiers[i - 1].id });
  });
  for (const mv of [...promoted, ...relegated]) {
    if (mv.id === PLAYER_TEAM_ID) league.player.tier = mv.to;
    else league.teams.find((x) => x.id === mv.id)!.tier = mv.to;
  }
  const isPromoted = new Set(promoted.map((x) => x.id));
  const isRelegated = new Set(relegated.map((x) => x.id));

  // 통산 기록(이번 시즌 최종 활약도)
  for (const m of league.members) {
    m.career.seasons += 1;
    m.career.activitySum = round1(m.career.activitySum + m.act);
  }

  // ③·④ 규모 단계 이동(분포 보정 포함)
  const ch = rules.changes;
  const counts = rules.scaleTiers.map((s) => league.teams.filter((x) => x.scaleTier === s.tier).length);
  const targetSum = rules.initialScaleTarget.reduce((a, x) => a + x, 0);
  const target = rules.initialScaleTarget.map((x) => (x * league.teams.length) / targetSum);
  const scaleMoves: LeagueHistory['scaleMoves'] = [];
  const maxScale = rules.scaleTiers.length;
  for (const team of [...league.teams].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!rng.chance(ch.scaleMoveChance)) continue;
    const k = team.scaleTier - 1;
    let pUp = isPromoted.has(team.id) ? ch.promotedGrowChance : isRelegated.has(team.id) ? 1 - ch.relegatedShrinkChance : ch.neutralGrowChance;
    const over = (i: number) => (counts[i] - target[i]) / Math.max(1, target[i]);
    const upGain = k + 1 < maxScale ? over(k) - over(k + 1) : -Infinity;
    const downGain = k - 1 >= 0 ? over(k) - over(k - 1) : -Infinity;
    if (upGain === -Infinity) pUp = 0;
    else if (downGain === -Infinity) pUp = 1;
    else pUp = Math.min(0.95, Math.max(0.05, pUp + ch.distributionCorrection * 0.5 * (upGain - downGain)));
    const dir = rng.chance(pUp) ? 1 : -1;
    const next = team.scaleTier + dir;
    if (next < 1 || next > maxScale) continue;
    counts[k] -= 1;
    counts[next - 1] += 1;
    scaleMoves.push({ id: team.id, from: team.scaleTier, to: next });
    team.scaleTier = next;
  }
  // ④ 전체 규모 분포 보정: 바닥보다 적거나 천장보다 많은 단계는 이웃 단계와 한 팀씩 옮긴다
  const floor = target.map((x) => Math.max(1, Math.ceil(x * ch.distributionFloor)));
  const ceil = target.map((x) => Math.floor(x * ch.distributionCeil));
  const sizeNow = (id: string) => league.members.filter((m) => m.teamId === id).length;
  const moveOne = (from: number, to: number) => {
    // 위로 올릴 때는 인원이 가장 많은 팀, 아래로 내릴 때는 가장 적은 팀(같으면 id 순)
    const cands = league.teams.filter((x) => x.scaleTier === from + 1).sort((a, b) => (to > from ? sizeNow(b.id) - sizeNow(a.id) : sizeNow(a.id) - sizeNow(b.id)) || a.id.localeCompare(b.id));
    const team = cands[0];
    if (!team) return false;
    counts[from] -= 1;
    counts[to] += 1;
    const prev = scaleMoves.find((x) => x.id === team.id);
    if (prev) prev.to = to + 1;
    else scaleMoves.push({ id: team.id, from: team.scaleTier, to: to + 1 });
    team.scaleTier = to + 1;
    return true;
  };
  for (let guard = 0; guard < 40; guard++) {
    let fixed = false;
    for (let k = 0; k < maxScale && !fixed; k++) {
      const nbrs = [k - 1, k + 1].filter((j) => j >= 0 && j < maxScale);
      if (counts[k] < floor[k]) {
        const src = nbrs.filter((j) => counts[j] > floor[j]).sort((a, b) => counts[b] / target[b] - counts[a] / target[a])[0];
        if (src !== undefined) fixed = moveOne(src, k);
      } else if (counts[k] > ceil[k]) {
        const dst = nbrs.filter((j) => counts[j] < ceil[j]).sort((a, b) => counts[a] / target[a] - counts[b] / target[b])[0];
        if (dst !== undefined) fixed = moveOne(k, dst);
      }
    }
    if (!fixed) break;
  }
  for (const mv of [...scaleMoves]) if (mv.from === mv.to) scaleMoves.splice(scaleMoves.indexOf(mv), 1);
  const scaleChanged = new Set(scaleMoves.map((x) => x.id));

  // 명단 변동: 은퇴 → 이적 → 목표 인원(방출·신입)
  const used = new Set(league.members.map((m) => nameKey(m.name)));
  let retired = 0;
  let transfers = 0;
  let recruits = 0;
  const yearsOver = (m: LeagueMember) => Math.max(0, m.age - ch.retireAgeStart);
  const teamOrder = [...league.teams].sort((a, b) => a.id.localeCompare(b.id));
  const retiredIds = new Set<string>();
  // 목표 인원은 변동 전 인원에서 정한다(은퇴·이적으로 빈 자리는 신입으로 채운다)
  const sizeBefore = new Map(league.teams.map((x) => [x.id, membersOf(league, x.id).length]));
  for (const team of teamOrder) {
    const ms = membersOf(league, team.id);
    const median = [...ms].sort((a, b) => a.act - b.act)[Math.floor(ms.length / 2)]?.act ?? 0;
    const mul = isPromoted.has(team.id) ? ch.promotedRetireMul : isRelegated.has(team.id) ? ch.relegatedRetireMul : 1;
    for (const m of ms) {
      if (m.featuredId) continue;
      const p = (ch.retireBase + ch.retirePerYearOver * yearsOver(m) + (m.act < median ? ch.retireLowActivity : 0)) * mul;
      if (rng.chance(Math.min(0.9, p))) retiredIds.add(m.id);
    }
  }
  retired += retiredIds.size;
  league.members = league.members.filter((m) => !retiredIds.has(m.id));

  const sizeOf = (id: string) => league.members.filter((m) => m.teamId === id).length;
  const maxOf = (team: LeagueTeam) => scaleRow(t, team.scaleTier).max;
  const orderOf = (team: LeagueTeam) => tierRow(t, team.tier).order;
  for (const team of teamOrder) {
    const sc = scaleRow(t, team.scaleTier);
    const ms = membersOf(league, team.id).sort((a, b) => b.talent - a.talent || a.id.localeCompare(b.id));
    const stars = new Set(ms.slice(0, sc.stars).map((m) => m.id));
    for (const m of ms) {
      if (m.featuredId) continue;
      const star = stars.has(m.id);
      const p = isRelegated.has(team.id) && star ? ch.relegatedStarTransfer : ch.transferBase;
      if (!rng.chance(p)) continue;
      // 강등 팀 강자는 더 높은 등급으로, 나머지는 한 등급 안팎의 팀으로. 자리가 있는 팀만
      const dests = league.teams.filter(
        (x) =>
          x.id !== team.id &&
          sizeOf(x.id) < maxOf(x) &&
          (isRelegated.has(team.id) && star ? orderOf(x) > orderOf(team) : Math.abs(orderOf(x) - orderOf(team)) <= 1),
      );
      if (!dests.length) continue;
      m.teamId = rng.pick(dests.sort((a, b) => a.id.localeCompare(b.id))).id;
      m.career.transfers += 1;
      transfers += 1;
    }
  }

  for (const team of teamOrder) {
    const sc = scaleRow(t, team.scaleTier);
    const n = sizeOf(team.id);
    const base = sizeBefore.get(team.id) ?? n;
    let want: number;
    if (scaleChanged.has(team.id)) want = rng.int(sc.min, sc.max);
    else {
      const extra = isPromoted.has(team.id) ? rng.int(ch.promotedExtraRecruits[0], ch.promotedExtraRecruits[1]) : 0;
      want = base + Math.round(base * ch.sizeDrift * (2 * rng.next() - 1)) + extra;
    }
    want = Math.max(sc.min, Math.min(sc.max, want));
    if (n > want) {
      // 넘치면 재능이 낮은 쪽부터 명단에서 뺀다(방출, 대표 인물 제외). 은퇴로 센다
      const out = membersOf(league, team.id)
        .filter((m) => !m.featuredId)
        .sort((a, b) => a.talent - b.talent || a.id.localeCompare(b.id))
        .slice(0, n - want)
        .map((m) => m.id);
      league.members = league.members.filter((m) => !out.includes(m.id));
      retired += out.length;
    }
    for (let i = sizeOf(team.id); i < want; i++) {
      league.members.push(newMember(t, league, rng, team.id, used, true));
      recruits += 1;
    }
  }

  // 민간 용병단 이름 변경(설정 용병단은 고정)
  const renamed: LeagueHistory['renamed'] = [];
  const teamNames = new Set(league.teams.map((x) => nameKey(x.name)));
  for (const team of teamOrder) {
    if (team.kind !== 'civil' || !rng.chance(ch.civilRenameChance)) continue;
    for (let i = 0; i < 30; i++) {
      const name = `${rng.pick(rules.civilNameParts.first)} ${rng.pick(rules.civilNameParts.second)}`;
      if (teamNames.has(nameKey(name))) continue;
      teamNames.delete(nameKey(team.name));
      teamNames.add(nameKey(name));
      renamed.push({ id: team.id, from: team.name, to: name });
      team.name = name;
      break;
    }
  }

  // 나이: 시즌 seasonsPerYear번마다 한 살
  if (league.season % rules.season.seasonsPerYear === 0) for (const m of league.members) m.age += 1;

  const hist: LeagueHistory = { season: league.season, standings, promoted, relegated, renamed, scaleMoves, transfers, retired, recruits };
  league.history = [...league.history, hist].slice(-rules.season.historyLimit);
  league.checkpoints = [];
  league.season += 1;
  league.player.score = 0;
  setupSeason(t, league);
  return hist;
}
