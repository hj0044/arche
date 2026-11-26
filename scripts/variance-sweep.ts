// 전투 변동성 실험(지시서 018 5번). 피해 변동 폭 4종 × 행동 순서 흔들림 3종 = 12개 후보를 같은 표본으로 잰다.
// 사용: npm run variance-sweep -- [승률 시드 수(기본 800)] [진행 일수(기본 60)] [진행 시드 수(기본 20)] [출력 폴더]
//   후보 하나만: npm run variance-sweep -- one <varianceMin> <varianceMax> <speedJitter> <출력.json> [승률 시드] [일수] [진행 시드]
// 표본은 검수 리포트(docs/reviews/data/combat-power-2026-11-24/audit.ts)의 방식을 따른다.
//   M1 power 표본: 등급별 합법 레벨 × 파티 1~5명 = 365조합, 조합마다 승률 시드 truth:<id>:<i>.
//   M5 위험도: 같은 조합에서 시드 power:<id>:<i> 앞 12회와 96회의 단계 일치.
//   M4 속도 민감도: 레벨 25 세 명(수호자·저격수·사제) + 대상 한 명, 상대는 기준 데이터로 맞춘 중급 셋. 짝지은 시드 sens:<역할>:<i>.
//   M2·M6 진행: difficulty-stats와 같은 자동 플레이(60일 × 20개 시드).
//   M3 보호선: balance 표(balanceTable)의 구성.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getRole, tables as baseTables, type GameTables, type Stats } from '../src/data';
import { resolveCombat, type CombatSlot } from '../src/engine/combat';
import { riskTierOf } from '../src/engine/combatPower';
import { createRng } from '../src/engine/rng';
import { mercToUnit, type MercenaryState } from '../src/engine/game';
import { createMercenary, createMonster, type Unit } from '../src/engine/unit';
import { balanceTable } from './balance';
import { difficultyStats, SIZE_KEYS } from './difficulty-stats';

type Fight = { allies: CombatSlot[]; enemies: CombatSlot[] };
const slot = (t: GameTables, unit: Unit): CombatSlot => ({ unit, row: getRole(t, unit.role).defaultRow });
const isWin = (t: GameTables, f: Fight, seed: string) => resolveCombat(t, { ...f, seed }).outcome === 'victory';

export interface Candidate {
  varianceMin: number;
  varianceMax: number;
  speedJitter: number;
}
export const CANDIDATES: Candidate[] = [
  [0.9, 1.1],
  [0.85, 1.15],
  [0.8, 1.2],
  [0.75, 1.25],
].flatMap(([varianceMin, varianceMax]) => [0, 0.05, 0.1].map((speedJitter) => ({ varianceMin, varianceMax, speedJitter })));
export const candidateName = (c: Candidate) => `${c.varianceMin}/${c.varianceMax} · 흔들림 ${c.speedJitter}`;

export function tablesFor(c: Candidate): GameTables {
  return { ...baseTables, combat: { ...baseTables.combat, speedJitter: c.speedJitter, damage: { ...baseTables.combat.damage, varianceMin: c.varianceMin, varianceMax: c.varianceMax } } };
}

// ── 표본(데이터가 아니라 기준 데이터로 한 번 만든다: 후보끼리 같은 상대) ──
function contract(t: GameTables, m: (typeof baseTables.roster)[number], level: number): CombatSlot {
  const state: MercenaryState = {
    id: m.id, name: m.name, role: m.role, element: m.element, level, exp: 0,
    initialLevel: m.initialLevel, growth: m.growth, affiliation: { kind: 'guild' },
    profile: { background: m.background, world: m.world, race: m.race, originFaction: m.originFaction },
  };
  return slot(t, mercToUnit(t, state));
}
const monster = (t: GameTables, m: (typeof baseTables.monsters)[number], grade: string, level: number, i: number) =>
  slot(t, createMonster(t, { id: 'z' + i, name: m.name, element: m.element, role: m.role, level, grade, monsterId: m.id }));

/** 검수 리포트의 power 표본(패널 0): 365조합 */
export function powerSample(t: GameTables): { id: string; fight: Fight }[] {
  const out: { id: string; fight: Fight }[] = [];
  const panel = 0;
  for (const grade of t.monsterGrades) {
    const species = t.monsters.filter((m) => m.grades.includes(grade.id));
    for (let level = grade.level[0]; level <= grade.level[1]; level++)
      for (let size = 1; size <= 5; size++) {
        const id = `${grade.id}:${level}:${size}:${panel}`;
        const rng = createRng('party:' + id);
        const pool = [...t.roster];
        const ranged = (panel + size + level) % 5 !== 0;
        const count = ranged ? Math.max(1, Math.min(5, size + rng.pick([-1, 0, 0, 0, 1]))) : rng.int(1, 5);
        const targetLevel = level + Math.round(Math.log((count * grade.statMultiplier) / size) / Math.log(1.035)) + rng.int(-6, 6);
        const allies = Array.from({ length: size }, () => {
          const m = pool.splice(rng.int(0, pool.length - 1), 1)[0];
          const lv = ranged ? Math.min(m.growth.cap, Math.max(1, targetLevel + rng.int(-3, 3))) : rng.int(1, m.growth.cap);
          return contract(t, m, lv);
        });
        const enemies = Array.from({ length: count }, (_, i) => monster(t, rng.pick(species), grade.id, level, i));
        out.push({ id, fight: { allies, enemies } });
      }
  }
  return out;
}

const generic = (t: GameTables, role: string, level: number, id: string, element = 'void') => slot(t, createMercenary(t, { id, name: id, element, role, level }));
/** 기준 데이터로 승률이 반쯤 되는 중급 셋을 고른다(검수 리포트 matchedEnemies와 같음) */
function matchedEnemies(t: GameTables, allies: CombatSlot[], level: number, key: string): CombatSlot[] {
  const species = ['husk_guard', 'spore_spitter', 'rift_caller'].map((id) => t.monsters.find((m) => m.id === id)!);
  const make = (lv: number) => species.map((m, i) => ({ ...monster(t, m, 'mid', Math.max(1, lv), i), unit: { ...monster(t, m, 'mid', Math.max(1, lv), i).unit, element: 'void' } }));
  let best = make(level);
  let distance = Infinity;
  for (let lv = Math.max(1, level - 10); lv <= level + 6; lv++) {
    const f = { allies, enemies: make(lv) };
    let wins = 0;
    for (let i = 0; i < 18; i++) wins += +isWin(t, f, `pilot:${key}:${i}`);
    const score = Math.abs(wins - 9) + Math.abs(lv - level) / 100;
    if (score < distance) {
      distance = score;
      best = f.enemies;
    }
  }
  return best;
}
/** M4: 속도 바운더리 끝으로 바꾼 대상의 승률 변화 */
export const SPEED_CASES: { role: string; bound: 'lower' | 'upper'; name: string }[] = [
  { role: 'archer', bound: 'upper', name: '저격수 속도 상한' },
  { role: 'healer', bound: 'lower', name: '사제 속도 하한' },
  { role: 'mage', bound: 'upper', name: '마도사 속도 상한' },
];
function speedPanels() {
  const t = baseTables;
  return SPEED_CASES.map((c) => {
    const level = 25;
    const subject = generic(t, c.role, level, 'subject', 'fire');
    const allies = [...['shield', 'archer', 'healer'].map((r, i) => generic(t, r, level, 'a' + i, 'fire')), subject];
    const enemies = matchedEnemies(t, allies, level, 'sens:' + c.role);
    const v = t.stats.roleBounds.spd[c.bound === 'lower' ? 0 : 1];
    const stats: Stats = { ...subject.unit.stats, spd: subject.unit.stats.spd * v };
    const on = [...allies.slice(0, -1), { ...subject, unit: { ...subject.unit, stats } }];
    return { ...c, off: { allies, enemies }, on: { allies: on, enemies } };
  });
}

/** M3 보호선 구성(balanceTable의 key) */
export const GUARD_KEYS = [
  ...[1, 10, 30, 50, 70].map((L) => `5인 Lv${L} vs 상급×4`),
  '5인 Lv5 vs 중급 Lv15×3',
  '5인 Lv30 vs 중급 Lv40×3',
];
export const RECKLESS_KEY = '시작 4인 Lv5 vs 중급 Lv15×3';

export interface CandidateResult {
  candidate: Candidate;
  truthSeeds: number;
  /** M1: 승률 10~90%인 조합 수 / 전체 */
  m1: { mid: number; total: number; allLoss: number; allWin: number };
  /** M2: 접전·우세 있는 날 / 결정한 날, 가용 인원별 */
  m2: { fairDays: number; decisionDays: number; bySize: Record<string, [number, number]> };
  /** M3: balance 표 전체(시드 balanceSeeds) */
  balance: Record<string, number>;
  balanceSeeds: number;
  /** M4: 짝지은 승률 변화(%p) */
  m4: Record<string, number>;
  speedSeeds: number;
  /** M5: 12회 대 96회 단계 일치 */
  m5: { agree: number; total: number };
  /** M6: 표본 전투의 평균 라운드·15라운드 철수, 진행의 복귀 성공률·부상 */
  m6: { meanRounds: number; maxRoundRetreatRate: number; returns: number; victories: number; injuredMercDays: number; progressRetreats: number; fights: number };
  ms: number;
}

export function runCandidate(c: Candidate, truthSeeds: number, days: number, daySeeds: number): CandidateResult {
  const started = Date.now();
  const t = tablesFor(c);
  // M1·M5·M6(표본)
  let mid = 0, allLoss = 0, allWin = 0, agree = 0, rounds = 0, r15 = 0, fights = 0;
  const sample = powerSample(baseTables);
  for (const { id, fight } of sample) {
    let wins = 0;
    for (let i = 0; i < truthSeeds; i++) {
      const r = resolveCombat(t, { ...fight, seed: `truth:${id}:${i}` });
      if (r.outcome === 'victory') wins++;
      rounds += r.rounds;
      fights++;
      if (r.outcome === 'retreat' && r.rounds >= t.combat.maxRounds) r15++;
    }
    const w = wins / truthSeeds;
    if (w >= 0.1 && w <= 0.9) mid++;
    if (wins === 0) allLoss++;
    if (wins === truthSeeds) allWin++;
    let w12 = 0, w96 = 0;
    for (let i = 0; i < 96; i++) {
      const v = +isWin(t, fight, `power:${id}:${i}`);
      w96 += v;
      if (i < 12) w12 += v;
    }
    if (riskTierOf(t, w12 / 12).id === riskTierOf(t, w96 / 96).id) agree++;
  }
  // M4
  const speedSeeds = 2000;
  const m4: Record<string, number> = {};
  for (const p of speedPanels()) {
    let a = 0, b = 0;
    for (let i = 0; i < speedSeeds; i++) {
      const seed = `sens:${p.role}:${i}`;
      a += +isWin(t, p.off, seed);
      b += +isWin(t, p.on, seed);
    }
    m4[p.name] = ((b - a) / speedSeeds) * 100;
  }
  // M3(전체 balance 표, 시드 800)
  const balanceSeeds = 800;
  const balance = Object.fromEntries(balanceTable(t, balanceSeeds).map((r) => [r.key, r.rate]));
  // M2·M6(진행)
  const d = difficultyStats(t, days, daySeeds);
  return {
    candidate: c,
    truthSeeds,
    m1: { mid, total: sample.length, allLoss, allWin },
    m2: { fairDays: d.fairDays, decisionDays: d.decisionDays, bySize: Object.fromEntries(SIZE_KEYS.map((k) => [k, d.bySize.get(k) ?? [0, 0]])) },
    balance,
    balanceSeeds,
    m4,
    speedSeeds,
    m5: { agree, total: sample.length },
    m6: { meanRounds: rounds / fights, maxRoundRetreatRate: r15 / fights, returns: d.returns, victories: d.victories, injuredMercDays: d.injuredMercDays, progressRetreats: d.maxRoundRetreats, fights: d.fights },
    ms: Date.now() - started,
  };
}

// ── 채택 규칙(지시서 018 5번) ──
const BASE_M5 = 0.934;
export interface Verdict {
  name: string;
  m1: number;
  m2: number;
  m3ok: boolean;
  m3fail: string[];
  m5: number;
  m5ok: boolean;
}
export function judge(results: CandidateResult[]) {
  const base = results.find((r) => r.candidate.varianceMin === 0.9 && r.candidate.speedJitter === 0)!;
  const verdicts = results.map((r): Verdict & { r: CandidateResult } => {
    const fail: string[] = [];
    for (const k of GUARD_KEYS) if (r.balance[k] < base.balance[k] - 0.05) fail.push(`${k} ${(base.balance[k] * 100).toFixed(1)}→${(r.balance[k] * 100).toFixed(1)}%`);
    if (r.balance[RECKLESS_KEY] > 0.1) fail.push(`${RECKLESS_KEY} ${(r.balance[RECKLESS_KEY] * 100).toFixed(1)}% > 10%`);
    const m5 = r.m5.agree / r.m5.total;
    return { r, name: candidateName(r.candidate), m1: r.m1.mid / r.m1.total, m2: r.m2.fairDays / r.m2.decisionDays, m3ok: fail.length === 0, m3fail: fail, m5, m5ok: m5 >= BASE_M5 - 0.03 };
  });
  const pass = verdicts.filter((v) => v.m3ok && v.m5ok);
  const size = (c: Candidate) => (c.varianceMax - c.varianceMin) * 10 + c.speedJitter * 10;
  pass.sort((a, b) => b.m2 - a.m2);
  const top = pass[0];
  const tied = top ? pass.filter((v) => top.m2 - v.m2 <= 0.01).sort((a, b) => size(a.r.candidate) - size(b.r.candidate)) : [];
  const pick = tied[0];
  const baseV = verdicts.find((v) => v.r === base)!;
  const effective = pick && pick.m1 >= baseV.m1 * 1.5 && pick.m2 >= baseV.m2 + 0.03;
  return { verdicts, base: baseV, pick, adopted: effective ? pick : undefined };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export function report(results: CandidateResult[]): string {
  const { verdicts, base, pick, adopted } = judge(results);
  const lines: string[] = [];
  const r0 = results[0];
  lines.push(`표본: M1·M5·M6 power 표본 ${r0.m1.total}조합 × 승률 시드 ${r0.truthSeeds}회(+위험도 96회), M4 짝지은 시드 ${r0.speedSeeds}회, M3 balance 표 시드 ${r0.balanceSeeds}회, M2 자동 플레이 60일 × 20개 시드.`);
  lines.push('');
  lines.push('| 후보(변동 폭 · 흔들림) | M1 승률 10~90% 조합 | M2 접전·우세 있는 날 | 가용 1~2 / 3~4 / 5+ | M3 보호선 | M4 저격수 상한 / 사제 하한 / 마도사 상한(%p) | M5 12회=96회 | M6 평균 라운드 · 15R 철수 | 복귀 성공 · 부상 계약자·일 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const v of verdicts) {
    const r = v.r;
    const sizes = SIZE_KEYS.map((k) => { const [n, f] = r.m2.bySize[k]; return n ? pct(f / n) : '-'; }).join(' / ');
    lines.push(
      `| ${v.name}${v === base ? ' (기준)' : ''} | ${r.m1.mid}/${r.m1.total} = ${pct(v.m1)} (전패 ${r.m1.allLoss} · 전승 ${r.m1.allWin}) | ${r.m2.fairDays}/${r.m2.decisionDays} = ${pct(v.m2)} | ${sizes} | ${v.m3ok ? '통과' : `실패: ${v.m3fail.join('; ')}`} | ${SPEED_CASES.map((c) => (r.m4[c.name] >= 0 ? '+' : '') + r.m4[c.name].toFixed(2)).join(' / ')} | ${pct(v.m5)}${v.m5ok ? '' : ' (미달)'} | ${r.m6.meanRounds.toFixed(2)} · ${pct(r.m6.maxRoundRetreatRate, 2)} | ${pct(r.m6.victories / r.m6.returns)} · ${r.m6.injuredMercDays} |`,
    );
  }
  lines.push('');
  lines.push(`M3 보호선 구성(기준 승률, 시드 ${r0.balanceSeeds}): ${[...GUARD_KEYS, RECKLESS_KEY].map((k) => `${k} ${pct(base.r.balance[k])}`).join(' · ')}`);
  lines.push('');
  if (!pick) lines.push('**채택 없음**: 보호선(M3)과 위험도 일치(M5)를 모두 지킨 후보가 없다. 기준값 유지.');
  else if (!adopted)
    lines.push(`**기준값 유지**: 규칙 2로 고른 후보는 ${pick.name}(M1 ${pct(pick.m1)}, M2 ${pct(pick.m2)})이지만 기준(M1 ${pct(base.m1)}, M2 ${pct(base.m2)}) 대비 M1 1.5배 이상과 M2 +3%p 이상을 함께 넘지 못했다(규칙 3). speedJitter는 0으로 둔다.`);
  else lines.push(`**채택: ${adopted.name}** (M1 ${pct(base.m1)} → ${pct(adopted.m1)}, M2 ${pct(base.m2)} → ${pct(adopted.m2)}).`);
  if (adopted) {
    const changed = Object.keys(base.r.balance)
      .map((k) => ({ k, d: adopted.r.balance[k] - base.r.balance[k] }))
      .filter((x) => Math.abs(x.d) >= 0.005)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    lines.push('');
    lines.push(`balance 45개 구성 중 승률이 0.5%p 이상 달라진 구성(시드 ${r0.balanceSeeds}): ${changed.length}개`);
    lines.push('');
    lines.push('| 구성 | 기준 | 채택 | 차이 |');
    lines.push('|---|---|---|---|');
    for (const x of changed) lines.push(`| ${x.k} | ${pct(base.r.balance[x.k])} | ${pct(adopted.r.balance[x.k])} | ${x.d >= 0 ? '+' : ''}${(x.d * 100).toFixed(1)}%p |`);
  }
  return lines.join('\n');
}

// ── 실행 ──
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'one') {
    const [, vmin, vmax, j, out, truth = '800', days = '60', daySeeds = '20'] = args;
    const r = runCandidate({ varianceMin: Number(vmin), varianceMax: Number(vmax), speedJitter: Number(j) }, Number(truth), Number(days), Number(daySeeds));
    writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
    return;
  }
  const [truth = '800', days = '60', daySeeds = '20', dir = 'docs/reviews/data/variance-sweep-2026-11-24'] = args;
  mkdirSync(dir, { recursive: true });
  const files = CANDIDATES.map((c) => join(dir, `candidate-${c.varianceMin}-${c.varianceMax}-j${c.speedJitter}.json`));
  const queue = CANDIDATES.map((c, i) => [c, files[i]] as const);
  const workers = Math.max(1, Math.min(cpus().length, queue.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [c, file] = job;
        await new Promise<void>((resolve, reject) => {
          const p = spawn(process.execPath, [...process.execArgv, process.argv[1], 'one', String(c.varianceMin), String(c.varianceMax), String(c.speedJitter), file, truth, days, daySeeds], { stdio: 'inherit' });
          p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${candidateName(c)} 실패(${code})`))));
        });
        console.error(`완료: ${candidateName(c)}`);
      }
    }),
  );
  const results = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as CandidateResult);
  const md = report(results);
  writeFileSync(join(dir, 'summary.md'), md + '\n');
  console.log(md);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
