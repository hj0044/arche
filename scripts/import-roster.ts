// docs/design/roster-phase1.csv(정본)와 src/data/roster-profile.json(임시 보충)으로 src/data/roster.json을 만든다.
// 계약자별 기본 스탯·특성·짧은 이름·스킬·성장률(021)은 기존 roster.json 값을 옮기고, 없으면 docs/design/roster-v2-draft.json(초안)에서 채운다.
// 사용: npm run import-roster [-- --from-draft]
//   --from-draft: 스킬·특성·성장률을 초안 값으로 덮어쓴다(초안을 새로 확정했을 때 한 번).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import backgrounds from '../src/data/backgrounds.json';
import cities from '../src/data/cities.json';
import elements from '../src/data/elements.json';
import factions from '../src/data/factions.json';
import profile from '../src/data/roster-profile.json';
import roles from '../src/data/roles.json';

const CSV = 'docs/design/roster-phase1.csv';
const DRAFT = 'docs/design/roster-v2-draft.json';
const fromDraft = process.argv.includes('--from-draft');
const OUT = 'src/data/roster.json';
const START_GUILD = '시작 길드';

function lookup<T extends { id: string }>(rows: T[], value: string, keys: ((r: T) => string | string[])[], what: string): string {
  const row = rows.find((r) => keys.some((k) => ([] as string[]).concat(k(r)).includes(value)));
  if (!row) throw new Error(`${what} 값을 찾을 수 없다: "${value}"`);
  return row.id;
}

const [header, ...lines] = readFileSync(CSV, 'utf8').trim().split(/\r?\n/);
const cols = header.split(',');
const col = (cells: string[], name: string) => {
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`CSV에 "${name}" 열이 없다`);
  return cells[i].trim();
};
const extra = profile as unknown as Record<string, { age: number; gender: string; unlock?: unknown }>;

const rows = lines.map((line) => {
  const c = line.split(',');
  const no = Number(col(c, '번호'));
  const id = `m${String(no).padStart(2, '0')}`;
  const p = extra[id];
  if (!p) throw new Error(`roster-profile.json에 ${id}가 없다`);
  const affiliation = col(c, '소속');
  return {
    id,
    no,
    name: col(c, '이름'),
    role: lookup(roles, col(c, '역할'), [(r) => r.name, (r) => r.aliases ?? []], '역할'),
    element: lookup(elements, col(c, '속성'), [(r) => r.loreName, (r) => r.name], '속성'),
    hometown: lookup(cities, col(c, '고향'), [(r) => r.name], '고향'),
    faction: affiliation === START_GUILD ? 'guild' : lookup(factions, affiliation, [(r) => r.name], '소속'),
    startingCandidate: affiliation === START_GUILD,
    background: lookup(backgrounds, col(c, '배경'), [(r) => r.aliases, (r) => r.shortName, (r) => r.name], '배경'),
    growth: {
      cap: Number(col(c, '성장 한계')),
    },
    initialLevel: Number(col(c, '최초 레벨')),
    age: p.age,
    gender: p.gender,
    world: 'earth',
    race: 'human',
    ...(p.unlock ? { unlock: p.unlock } : {}),
  };
});

interface Kept { baseStats?: unknown; traits?: string[]; shortName?: string; skills?: string[]; signatureSkill?: string | null; growthRates?: unknown }
// 계약자별 기본 스탯과 특성 슬롯(지시서 016), 짧은 이름(017b), 스킬(020)은 사람이 고치는 값이라 기존 roster.json에서 그대로 옮긴다.
const previous = new Map<string, Kept>(existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as (Kept & { id: string })[]).map((r) => [r.id, r] as const) : []);
// 초안(지시서 020): 새 계약자의 기본 스탯·특성·짧은 이름·스킬과, --from-draft일 때 모든 계약자의 스킬·특성
const draft = new Map<string, Kept & { profile?: { shortName?: string } }>(
  existsSync(DRAFT) ? (JSON.parse(readFileSync(DRAFT, 'utf8')) as (Kept & { id: string; profile?: { shortName?: string } })[]).map((r) => [r.id, r] as const) : [],
);
const merged = rows.map((r) => {
  const prev = previous.get(r.id);
  const d = draft.get(r.id);
  const { name, ...rest } = r as typeof r & { name: string };
  const pick = <K extends keyof Kept>(k: K) => (fromDraft && (k === 'skills' || k === 'traits' || k === 'growthRates') ? (d?.[k] ?? prev?.[k]) : (prev?.[k] ?? d?.[k]));
  const baseStats = pick('baseStats');
  const traits = pick('traits');
  const skills = pick('skills');
  const growthRates = pick('growthRates');
  if (!skills) throw new Error(`${r.id}: 스킬이 없다(roster.json·초안 모두)`);
  const { id, no, ...others } = rest;
  return {
    id,
    no,
    name,
    shortName: prev?.shortName ?? d?.profile?.shortName ?? name,
    ...others,
    ...(baseStats ? { baseStats } : {}),
    ...(traits ? { traits } : {}),
    ...(growthRates ? { growthRates } : {}),
    skills,
    signatureSkill: prev?.signatureSkill ?? null,
  };
});
writeFileSync(OUT, '[\n' + merged.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`${rows.length}명을 ${OUT}에 썼다`);
