// 지시서 025: 역할별 파티 기여도와 기절·표식 효과를 잰다(status-impact 참고).
// 사용: npm run role-balance -- [구성당 시드 수(기본 800)] [--json 출력.json]
//
// 방법
// - 기준 파티: balance와 같은 5인(수호자·투사·저격수·마도사·사제, 역할 기본 스탯), 레벨 20.
// - 상대: 기준 파티 승률이 15~75%에 걸치도록 고른 4개 구성(같은 레벨 상급×5, 상급×4 +2, 최상급×4, 상급×4 +4).
//   승률이 0%나 100%에 붙은 구성은 한 자리를 바꿔도 차이가 보이지 않아 쓰지 않는다.
// - 역할 기여도: 기준 파티의 한 자리(5곳 돌아가며)를 그 역할로 바꾼 파티의 평균 승률. 바꾼 유닛은 그 역할 기본 스탯에
//   그 역할 계약자들의 실제 스킬 배정(roster.json skills)을 돌아가며 쓴다(스킬 효과만 보려고 스탯은 역할 기본값).
//   시드는 역할 사이에 짝지어 같다(자리·구성·번호가 같으면 같은 시드).
// - 기절 효과: 기절 스킬이 배정된 계약자마다, 그 역할 자리에 넣은 파티와 기절 스킬만 같은 역할의 다른 스킬(풀에서 배정되지 않은 첫 스킬,
//   기절 없음)로 바꾼 파티의 승률 차이 평균.
// - 표식 순효과(기만자): 표식 스킬(약점 노출)이 배정된 기만자로, 그 스킬을 쓰는 파티와 스킬에서 뺀(쓰지 않는) 파티의 승률 차.
//   0 이상이면 "표식을 써도 불리하지 않다". 참고로 다른 스킬로 바꾼 차이도 함께 잰다.
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { getRole, tables as baseTables, type GameTables, type Row } from '../src/data';
import { resolveCombat, type CombatSlot } from '../src/engine/combat';
import { createMercenary, createMonster } from '../src/engine/unit';

const LEVEL = 20;
const BASE: [string, string][] = [
  ['shield', 'frost'],
  ['warrior', 'fire'],
  ['archer', 'lightning'],
  ['mage', 'wind'],
  ['healer', 'light'],
];
export const CONFIGS: { key: string; grade: string; roles: string[]; levelOffset: number }[] = [
  { key: '상급×5', grade: 'high', roles: ['warrior', 'shield', 'archer', 'mage', 'commander'], levelOffset: 0 },
  { key: '상급×4 +2', grade: 'high', roles: ['warrior', 'shield', 'archer', 'mage'], levelOffset: 2 },
  { key: '최상급×4', grade: 'extreme', roles: ['warrior', 'shield', 'archer', 'mage'], levelOffset: 0 },
  { key: '상급×4 +4', grade: 'high', roles: ['warrior', 'shield', 'archer', 'mage'], levelOffset: 4 },
];

const member = (t: GameTables, i: number, role: string, element: string, skills?: string[]): CombatSlot => ({
  unit: createMercenary(t, { id: `p${i}`, name: role, element, role, level: LEVEL, ...(skills ? { skills } : {}) }),
  row: getRole(t, role).defaultRow as Row,
});
const enemies = (t: GameTables, c: (typeof CONFIGS)[number]): CombatSlot[] =>
  c.roles.map((role, i) => ({ unit: createMonster(t, { id: `e${i}`, name: role, element: 'void', role, grade: c.grade, level: LEVEL + c.levelOffset }), row: getRole(t, role).defaultRow as Row }));
/** 기준 파티의 slot번째 자리를 (role, skills)로 바꾼 파티 */
const partyWith = (t: GameTables, slot: number, role: string, skills?: string[]): CombatSlot[] =>
  BASE.map(([r, el], i) => (i === slot ? member(t, i, role, el, skills) : member(t, i, r, el)));
const win = (t: GameTables, allies: CombatSlot[], foes: CombatSlot[], seed: string) => resolveCombat(t, { allies, enemies: foes, seed }).outcome === 'victory';

/** 역할 계약자들의 스킬 배정(없으면 역할 기본) */
const skillSets = (t: GameTables, role: string): (string[] | undefined)[] => {
  const sets = t.roster.filter((r) => r.role === role).map((r) => r.skills);
  return sets.length ? sets : [undefined];
};

export interface RoleBalance {
  /** 구성별 기준 파티 승률 */
  base: Record<string, number>;
  /** 역할 → 평균 승률(구성·자리 평균)과 구성별 */
  roles: Record<string, { mean: number; byConfig: Record<string, number> }>;
  /** 기여도 비율: 역할 평균 승률 / 8개 역할 평균 */
  ratio: Record<string, number>;
  stun: { mercId: string; skill: string; alt: string; diff: number }[];
  stunMean: number;
  mark: { mercId: string; skill: string; alt: string; diff: number }[];
  markMean: number;
  /** 표식 순효과(지시서 025 목표 3): 약점 노출을 쓰는 파티 − 약점 노출을 쓰지 않는(스킬에서 뺀) 같은 파티 */
  markUnused: { mercId: string; skill: string; diff: number }[];
  markUnusedMean: number;
}

/** 같은 역할 풀에서 배정되지 않았고 해당 상태를 걸지 않는 첫 스킬 */
function altSkill(t: GameTables, role: string, assigned: string[], status: string): string {
  const pool = getRole(t, role).skillPool;
  const alt = pool.find((id) => !assigned.includes(id) && !(t.skills.find((s) => s.id === id)?.applies ?? []).some((a) => a.status === status));
  if (!alt) throw new Error(`${role}: ${status} 없는 대체 스킬이 없다`);
  return alt;
}

/** 스킬 하나를 바꾼(alt가 null이면 뺀) 짝 비교(같은 시드). 그 역할의 기준 자리에 넣는다(없으면 마도사 자리) */
function pairedDiff(t: GameTables, role: string, skills: string[], replace: string, alt: string | null, seeds: number, tag: string): number {
  const own = BASE.findIndex(([r]) => r === role);
  const slotIdx = own >= 0 ? own : 3;
  const swapped = alt ? skills.map((s) => (s === replace ? alt : s)) : skills.filter((s) => s !== replace);
  let a = 0;
  let b = 0;
  let n = 0;
  for (const c of CONFIGS) {
    const foes = enemies(t, c);
    const pa = partyWith(t, slotIdx, role, skills);
    const pb = partyWith(t, slotIdx, role, swapped);
    for (let s = 0; s < seeds; s++) {
      const seed = `rb:${tag}:${c.key}:${s}`;
      if (win(t, pa, foes, seed)) a++;
      if (win(t, pb, foes, seed)) b++;
      n++;
    }
  }
  return (a - b) / n;
}

export function roleBalance(t: GameTables, seeds = 800): RoleBalance {
  const roles = t.roles.filter((r) => r.enabled).map((r) => r.id);
  const base: Record<string, number> = {};
  for (const c of CONFIGS) {
    const foes = enemies(t, c);
    const p = BASE.map(([r, el], i) => member(t, i, r, el));
    let w = 0;
    for (let s = 0; s < seeds; s++) if (win(t, p, foes, `rb:base:${c.key}:${s}`)) w++;
    base[c.key] = w / seeds;
  }
  const out: RoleBalance['roles'] = {};
  for (const role of roles) {
    const sets = skillSets(t, role);
    const byConfig: Record<string, number> = {};
    for (const c of CONFIGS) {
      const foes = enemies(t, c);
      let w = 0;
      for (let s = 0; s < seeds; s++) {
        const slot = s % BASE.length;
        const skills = sets[Math.floor(s / BASE.length) % sets.length];
        if (win(t, partyWith(t, slot, role, skills), foes, `rb:role:${c.key}:${slot}:${s}`)) w++;
      }
      byConfig[c.key] = w / seeds;
    }
    out[role] = { mean: Object.values(byConfig).reduce((a, x) => a + x, 0) / CONFIGS.length, byConfig };
  }
  const avg = Object.values(out).reduce((a, x) => a + x.mean, 0) / roles.length;
  const ratio = Object.fromEntries(roles.map((r) => [r, out[r].mean / avg]));

  const effect = (status: string, onlyRole?: string) =>
    t.roster
      .filter((r) => !onlyRole || r.role === onlyRole)
      .flatMap((r) => {
        const skill = r.skills.find((id) => (t.skills.find((s) => s.id === id)?.applies ?? []).some((a) => a.status === status));
        if (!skill) return [];
        const alt = altSkill(t, r.role, r.skills, status);
        return [{ mercId: r.id, skill, alt, diff: pairedDiff(t, r.role, r.skills, skill, alt, Math.ceil(seeds / 2), `${status}:${r.id}`) }];
      });
  const stun = effect('stun');
  const mark = effect('mark', 'disruptor');
  const markUnused = mark.map((x) => {
    const r = t.roster.find((m) => m.id === x.mercId)!;
    return { mercId: x.mercId, skill: x.skill, diff: pairedDiff(t, r.role, r.skills, x.skill, null, Math.ceil(seeds / 2), `markoff:${r.id}`) };
  });
  const mean = (xs: { diff: number }[]) => (xs.length ? xs.reduce((a, x) => a + x.diff, 0) / xs.length : 0);
  return { base, roles: out, ratio, stun, stunMean: mean(stun), mark, markMean: mean(mark), markUnused, markUnusedMean: mean(markUnused) };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}`;
export function formatRoleBalance(t: GameTables, r: RoleBalance): string {
  const lines: string[] = [];
  lines.push(`기준 파티 승률(Lv${LEVEL}): ${CONFIGS.map((c) => `${c.key} ${pct(r.base[c.key])}%`).join(' · ')}`);
  lines.push('');
  lines.push(`| 역할 | ${CONFIGS.map((c) => c.key).join(' | ')} | 평균 승률 | 기여도(평균 대비) |`);
  lines.push(`|---|${CONFIGS.map(() => '---').join('|')}|---|---|`);
  for (const [role, v] of Object.entries(r.roles))
    lines.push(`| ${getRole(t, role).name} | ${CONFIGS.map((c) => pct(v.byConfig[c.key])).join(' | ')} | ${pct(v.mean)} | ${(r.ratio[role] * 100).toFixed(0)}% |`);
  lines.push('');
  lines.push(`기절 효과(기절 스킬 → 다른 스킬, 승률 차 평균): **${pct(r.stunMean)}%p**`);
  for (const x of r.stun) lines.push(`- ${x.mercId} ${x.skill} → ${x.alt}: ${pct(x.diff)}%p`);
  lines.push(`표식 순효과(기만자, 약점 노출을 쓸 때 − 쓰지 않을 때): **${pct(r.markUnusedMean)}%p**`);
  for (const x of r.markUnused) lines.push(`- ${x.mercId} ${x.skill} 뺌: ${pct(x.diff)}%p`);
  lines.push(`참고: 표식 스킬 → 다른 스킬로 교체한 차이: ${pct(r.markMean)}%p`);
  for (const x of r.mark) lines.push(`- ${x.mercId} ${x.skill} → ${x.alt}: ${pct(x.diff)}%p`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json');
  const json = ji >= 0 ? args[ji + 1] : null;
  const seeds = Number(args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--json') ?? 800);
  const r = roleBalance(baseTables, seeds);
  console.log(formatRoleBalance(baseTables, r));
  if (json) writeFileSync(json, JSON.stringify(r, null, 2));
}
