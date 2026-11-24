// docs/design/roster-phase1.csv(정본)와 src/data/roster-profile.json(임시 보충)으로 src/data/roster.json을 만든다.
// 사용: npm run import-roster
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import backgrounds from '../src/data/backgrounds.json';
import cities from '../src/data/cities.json';
import elements from '../src/data/elements.json';
import factions from '../src/data/factions.json';
import growthSpeeds from '../src/data/growth-speeds.json';
import profile from '../src/data/roster-profile.json';
import roles from '../src/data/roles.json';

const CSV = 'docs/design/roster-phase1.csv';
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
      speed: lookup(growthSpeeds, col(c, '성장 속도'), [(r) => r.name], '성장 속도'),
    },
    initialLevel: Number(col(c, '최초 레벨')),
    age: p.age,
    gender: p.gender,
    world: 'earth',
    race: 'human',
    ...(p.unlock ? { unlock: p.unlock } : {}),
  };
});

// 계약자별 기본 스탯과 특성 슬롯(지시서 016), 짧은 이름(017b)은 사람이 고치는 값이라 기존 roster.json에서 그대로 옮긴다.
const previous = new Map<string, { baseStats?: unknown; traits?: unknown; shortName?: string }>(
  existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { id: string; baseStats?: unknown; traits?: unknown; shortName?: string }[]).map((r) => [r.id, r] as const) : [],
);
const merged = rows.map((r) => {
  const prev = previous.get(r.id);
  // 카드용 짧은 이름(지시서 017b)도 사람이 정한 값이라 옮긴다. 새 계약자는 이름 그대로
  const { name, ...rest } = r as typeof r & { name: string };
  return { ...rest, name, shortName: prev?.shortName ?? name, ...(prev?.baseStats ? { baseStats: prev.baseStats } : {}), ...(prev?.traits ? { traits: prev.traits } : {}) };
});
writeFileSync(OUT, '[\n' + merged.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`${rows.length}명을 ${OUT}에 썼다`);
