// 지시서 027·027b: 역할 × 레벨 구간별 활약도 기준값(공략 1회 평균 측정값)을 같은 시드 표본으로 뽑는다.
// 사용: npm run contribution-baseline -- [구간당 전투 수(기본 2000)] [--write]  (--write면 src/data/contribution.json baselines·baselineSample을 고쳐 쓴다)
//
// 표본(구간마다 따로): 실제 로스터 36명(스킬 배정·특성·성장률 그대로)에서 5명을 뽑아 구간 안 레벨(균등)로 올린다.
// 성장 한계는 무시한다(한계가 낮은 계약자도 모든 구간에 넣어 역할별 표본을 고르게 한다. 027b 확인 사항).
// 상대는 그 레벨을 포함하는 몬스터 등급(하급 1~15, 중급 15~30, 상급 30~50, 최상급 50~70: monster-grades.json)과
// 파티 레벨 −1~+2의 공허 몬스터 3~4마리. 승패와 상관없이 모든 공략을 센다(실제 기록도 그렇다).
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRole, tables as baseTables, type GameTables, type Row } from '../src/data';
import { CONTRIBUTION_MEASURES, resolveCombat, type CombatSlot, type ContributionTally } from '../src/engine/combat';
import { mercToUnit, newGame } from '../src/engine/game';
import { createRng } from '../src/engine/rng';
import { createMonster } from '../src/engine/unit';

export const SAMPLE_SEED = 'contribution-baseline';

export interface SampleFight {
  band: string;
  level: number;
  victory: boolean;
  /** 아군 유닛별 역할·측정값 */
  allies: { role: string; tally: ContributionTally }[];
}

/** 몬스터 등급: 레벨을 포함하는 등급 중 낮은 쪽부터(경계 15·30·50은 낮은 등급) */
export function gradeForLevel(t: GameTables, level: number): string {
  const g = t.monsterGrades.find((x) => level >= x.level[0] && level <= x.level[1]);
  return (g ?? t.monsterGrades[t.monsterGrades.length - 1]).id;
}

/** 구간 하나의 표본 전투(seed가 같으면 같은 결과). level을 주면 그 레벨로 고정 */
export function sampleBand(t: GameTables, band: { id: string; min: number; max: number }, fights: number, seed = SAMPLE_SEED, level?: number): SampleFight[] {
  const s = newGame(t, { seed, guildName: '표본', baseCityId: 'seoul', protagonist: { name: '표본' } });
  const out: SampleFight[] = [];
  for (let i = 0; i < fights; i++) {
    const r = createRng(`${seed}:${band.id}:${level ?? ''}:${i}`);
    const L = level ?? r.int(band.min, band.max);
    const pool = [...s.mercenaries];
    const party: CombatSlot[] = [];
    for (let k = 0; k < 5; k++) {
      const m = pool.splice(r.int(0, pool.length - 1), 1)[0];
      party.push({ unit: mercToUnit(t, { ...m, level: L, affiliation: { kind: 'guild' } }), row: getRole(t, m.role).defaultRow as Row });
    }
    const count = r.int(3, 4);
    const enemies: CombatSlot[] = Array.from({ length: count }, (_, k) => {
      const mon = r.pick(t.monsters);
      const lv = Math.max(1, L + r.int(-1, 2));
      const unit = createMonster(t, { id: `e${k}`, name: mon.name, element: mon.element, role: mon.role, level: lv, grade: gradeForLevel(t, lv), monsterId: mon.id });
      return { unit, row: getRole(t, unit.role).defaultRow as Row };
    });
    const res = resolveCombat(t, { allies: party, enemies, seed: `${seed}:fight:${band.id}:${level ?? ''}:${i}` });
    out.push({ band: band.id, level: L, victory: res.outcome === 'victory', allies: party.map((p) => ({ role: p.unit.role, tally: res.contributions[p.unit.id] })) });
  }
  return out;
}

export interface BaselineResult {
  fightsPerBand: number;
  winRates: Record<string, number>;
  /** 구간 → 역할 → 출전 수 */
  appearances: Record<string, Record<string, number>>;
  /** 역할 → 구간 → 항목 → 공략 1회 평균 */
  baselines: Record<string, Record<string, Record<string, number>>>;
}

const round = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 1000) / 1000);

export function sampleBaselines(t: GameTables, fightsPerBand = 2000): BaselineResult {
  const winRates: Record<string, number> = {};
  const appearances: Record<string, Record<string, number>> = {};
  const baselines: Record<string, Record<string, Record<string, number>>> = {};
  for (const band of t.contribution.levelBands) {
    const fights = sampleBand(t, band, fightsPerBand);
    winRates[band.id] = fights.filter((f) => f.victory).length / fights.length;
    const sums: Record<string, Record<string, number>> = {};
    const n: Record<string, number> = {};
    for (const f of fights)
      for (const a of f.allies) {
        n[a.role] = (n[a.role] ?? 0) + 1;
        sums[a.role] ??= Object.fromEntries(CONTRIBUTION_MEASURES.map((k) => [k, 0]));
        for (const k of CONTRIBUTION_MEASURES) sums[a.role][k] += a.tally[k];
      }
    appearances[band.id] = n;
    for (const [role, v] of Object.entries(sums)) {
      baselines[role] ??= {};
      baselines[role][band.id] = Object.fromEntries(CONTRIBUTION_MEASURES.map((k) => [k, round(v[k] / n[role])]));
    }
  }
  return { fightsPerBand, winRates, appearances, baselines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const fights = Number(args.find((a) => /^\d+$/.test(a)) ?? 2000);
  const t0 = Date.now();
  const r = sampleBaselines(baseTables, fights);
  const items = baseTables.contribution.items;
  const bands = baseTables.contribution.levelBands;
  console.log(`표본: 구간마다 전투 ${r.fightsPerBand}회, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  console.log(`| 구간 | ${bands.map((b) => b.id).join(' | ')} |\n|---|${bands.map(() => '---').join('|')}|\n| 아군 승률 | ${bands.map((b) => `${(r.winRates[b.id] * 100).toFixed(1)}%`).join(' | ')} |`);
  for (const role of baseTables.roles.filter((x) => x.enabled)) {
    console.log(`\n${role.name}\n| 구간 | 출전 | ${items.map((i) => i.name).join(' | ')} |\n|---|---|${items.map(() => '---').join('|')}|`);
    for (const b of bands) {
      const v = r.baselines[role.id]?.[b.id] ?? {};
      console.log(`| ${b.id} | ${r.appearances[b.id][role.id] ?? 0} | ${items.map((i) => v[i.id] ?? 0).join(' | ')} |`);
    }
  }
  if (args.includes('--write')) {
    const path = resolve(import.meta.dirname, '../src/data/contribution.json');
    const json = JSON.parse(readFileSync(path, 'utf8'));
    json.baselines = r.baselines;
    json.baselineSample = { fightsPerBand: r.fightsPerBand, seed: SAMPLE_SEED, winRates: Object.fromEntries(Object.entries(r.winRates).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) };
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log(`→ ${path}에 기준값을 썼다`);
  }
}
