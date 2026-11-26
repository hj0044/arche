// 지시서 027: 역할별 활약도 기준값(공략 1회 평균 측정값)을 같은 시드 표본으로 뽑는다.
// 사용: npm run contribution-baseline -- [전투 수(기본 4000)] [--write]  (--write면 src/data/contribution.json baselines·baselineSample을 고쳐 쓴다)
//
// 표본: 실제 로스터 36명(스킬 배정·특성·성장률 그대로)에서 5명을 뽑고(같은 시드면 같은 파티), 레벨 5·10·20·30을 돌아가며 쓴다.
// 상대는 같은 레벨 근처 공허 몬스터 3~4마리(중급·상급 섞음). 승패와 상관없이 모든 공략을 센다(실제 기록도 그렇다).
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRole, tables as baseTables, type GameTables, type Row } from '../src/data';
import { CONTRIBUTION_MEASURES, resolveCombat, type CombatSlot } from '../src/engine/combat';
import { mercToUnit, newGame } from '../src/engine/game';
import { createRng } from '../src/engine/rng';
import { createMonster } from '../src/engine/unit';

export const SAMPLE_SEED = 'contribution-baseline';
export const LEVELS = [5, 10, 20, 30];

export interface BaselineResult {
  fights: number;
  winRate: number;
  /** 역할 → 출전 수 */
  appearances: Record<string, number>;
  /** 역할 → 항목 → 공략 1회 평균 */
  baselines: Record<string, Record<string, number>>;
}

export function sampleBaselines(t: GameTables, fights = 4000): BaselineResult {
  const s = newGame(t, { seed: SAMPLE_SEED, guildName: '표본', baseCityId: 'seoul', protagonist: { name: '표본' } });
  const sums: Record<string, Record<string, number>> = {};
  const appearances: Record<string, number> = {};
  let wins = 0;
  for (let i = 0; i < fights; i++) {
    const r = createRng(`${SAMPLE_SEED}:${i}`);
    const level = LEVELS[i % LEVELS.length];
    const pool = [...s.mercenaries];
    const party: CombatSlot[] = [];
    for (let k = 0; k < 5; k++) {
      const m = pool.splice(r.int(0, pool.length - 1), 1)[0];
      const unit = mercToUnit(t, { ...m, level, affiliation: { kind: 'guild' } });
      party.push({ unit, row: getRole(t, m.role).defaultRow as Row });
    }
    const count = r.int(3, 4);
    const enemies: CombatSlot[] = Array.from({ length: count }, (_, k) => {
      const mon = r.pick(t.monsters);
      const unit = createMonster(t, { id: `e${k}`, name: mon.name, element: mon.element, role: mon.role, level: level + r.int(-2, 2), grade: r.pick(['mid', 'high']), monsterId: mon.id });
      return { unit, row: getRole(t, unit.role).defaultRow as Row };
    });
    const res = resolveCombat(t, { allies: party, enemies, seed: `${SAMPLE_SEED}:fight:${i}` });
    if (res.outcome === 'victory') wins++;
    for (const p of party) {
      const role = p.unit.role;
      appearances[role] = (appearances[role] ?? 0) + 1;
      sums[role] ??= Object.fromEntries(CONTRIBUTION_MEASURES.map((k) => [k, 0]));
      for (const k of CONTRIBUTION_MEASURES) sums[role][k] += res.contributions[p.unit.id][k];
    }
  }
  const round = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 1000) / 1000);
  const baselines = Object.fromEntries(
    Object.entries(sums).map(([role, v]) => [role, Object.fromEntries(CONTRIBUTION_MEASURES.map((k) => [k, round(v[k] / appearances[role])]))]),
  );
  return { fights, winRate: wins / fights, appearances, baselines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const fights = Number(args.find((a) => /^\d+$/.test(a)) ?? 4000);
  const r = sampleBaselines(baseTables, fights);
  const items = baseTables.contribution.items;
  console.log(`표본: 전투 ${r.fights}회(레벨 ${LEVELS.join('·')}), 아군 승률 ${(r.winRate * 100).toFixed(1)}%`);
  console.log(`| 역할 | 출전 | ${items.map((i) => i.name).join(' | ')} |`);
  console.log(`|---|---|${items.map(() => '---').join('|')}|`);
  for (const role of baseTables.roles.filter((x) => x.enabled)) {
    const b = r.baselines[role.id] ?? {};
    console.log(`| ${role.name} | ${r.appearances[role.id] ?? 0} | ${items.map((i) => b[i.id] ?? 0).join(' | ')} |`);
  }
  if (args.includes('--write')) {
    const path = resolve(import.meta.dirname, '../src/data/contribution.json');
    const json = JSON.parse(readFileSync(path, 'utf8'));
    json.baselines = r.baselines;
    json.baselineSample = { fights: r.fights, levels: LEVELS, seed: SAMPLE_SEED };
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log(`→ ${path}에 기준값을 썼다`);
  }
}
