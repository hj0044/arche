/**
 * 이름 생성기(지시서 028a). 이름 풀(D01·D03, src/data/names)을 읽기만 한다.
 * - 문화권 가중치 = 인구 비례(populationShare) + 균등(1 − populationShare). 한 문화권 상한(cultureCap), 대륙별 최소 비율(continentMin).
 * - 표기 순서는 문화권 order(family_first / given_first), 성 개수는 surnameCount 범위(2개면 multiSurnameChance로 두 성).
 * - 성과 이름 사이 띄어쓰기는 문화권별 joiner(없으면 공백, 한국·중국은 붙여 씀).
 * - 같은 시드면 같은 이름. used(이미 쓰는 표기, 공백 무시)와 겹치지 않고, blocklist의 [성, 이름] 쌍은 거른다.
 * 국적(문화권)은 이름에만 쓰고 역할·속성·성격에 영향을 주지 않는다.
 */
import type { GameTables } from '../data';
import type { GivenNameEntry } from '../data/namePool';
import { createRng, type Rng } from './rng';

export type Gender = 'm' | 'f' | 'n';

export interface GeneratedName {
  cultureId: string;
  /** 성(여럿이면 공백으로 이은 것, 없으면 빈 문자열) */
  surname: string;
  given: string;
  display: string;
}

export interface NameRequest {
  cultureId?: string;
  gender: Gender;
  tone?: string;
  /** 이미 쓰는 표기(공백을 뺀 값으로 비교). 만든 이름을 여기에 더한다 */
  used?: Set<string>;
}

type NameTables = Pick<GameTables, 'namePool' | 'league'>;

export const nameKey = (display: string) => display.replace(/\s+/g, '');

const weightCache = new WeakMap<object, Map<string, number>>();

/** 문화권 가중치(합 1). 인구 비례 + 균등 → 대륙 최소·문화권 상한을 번갈아 맞춘다 */
export function cultureWeights(t: NameTables): Map<string, number> {
  const cached = weightCache.get(t.namePool);
  if (cached) return cached;
  const cfg = t.league.rules.names;
  const cs = t.namePool.cultures;
  const popSum = cs.reduce((a, c) => a + c.population, 0);
  const w = new Map(cs.map((c) => [c.id, cfg.populationShare * (c.population / popSum) + (1 - cfg.populationShare) / cs.length]));
  const continents = [...new Set(cs.map((c) => c.continent))];
  const norm = () => {
    const s = [...w.values()].reduce((a, x) => a + x, 0);
    for (const [k, v] of w) w.set(k, v / s);
  };
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    // 대륙 최소: 모자란 대륙은 그 안 문화권을 비율대로 키우고, 나머지는 비율대로 줄인다
    for (const ct of continents) {
      const ids = cs.filter((c) => c.continent === ct).map((c) => c.id);
      const share = ids.reduce((a, id) => a + w.get(id)!, 0);
      if (share < cfg.continentMin - 1e-12) {
        const others = cs.filter((c) => c.continent !== ct).map((c) => c.id);
        const otherShare = 1 - share;
        for (const id of ids) w.set(id, (w.get(id)! * cfg.continentMin) / share);
        for (const id of others) w.set(id, (w.get(id)! * (1 - cfg.continentMin)) / otherShare);
        changed = true;
      }
    }
    // 문화권 상한: 넘친 만큼을 상한 아래 문화권에 비율대로 나눈다
    const over = cs.filter((c) => w.get(c.id)! > cfg.cultureCap + 1e-12).map((c) => c.id);
    if (over.length) {
      let excess = 0;
      for (const id of over) {
        excess += w.get(id)! - cfg.cultureCap;
        w.set(id, cfg.cultureCap);
      }
      const under = cs.filter((c) => w.get(c.id)! < cfg.cultureCap - 1e-12).map((c) => c.id);
      const us = under.reduce((a, id) => a + w.get(id)!, 0);
      for (const id of under) w.set(id, w.get(id)! + (excess * w.get(id)!) / us);
      changed = true;
    }
    norm();
    if (!changed) break;
  }
  weightCache.set(t.namePool, w);
  return w;
}

function pickWeighted(rng: Rng, w: Map<string, number>): string {
  let r = rng.next();
  let last = '';
  for (const [id, v] of w) {
    last = id;
    r -= v;
    if (r < 0) return id;
  }
  return last;
}

/** 성별에 맞는 이름 후보: 남성은 남성·중성, 여성은 여성·중성, 중성은 중성(없으면 전체). 톤이 맞는 것이 있으면 그것만 */
function givenCandidates(names: GivenNameEntry[], gender: Gender, tone?: string): GivenNameEntry[] {
  let pool = names.filter((n) => (gender === 'n' ? n.gender === 'n' : n.gender === gender || n.gender === 'n'));
  if (pool.length === 0) pool = names;
  if (tone) {
    const toned = pool.filter((n) => n.tones.includes(tone));
    if (toned.length) pool = toned;
  }
  return pool;
}

/** 한 번 뽑기(겹침 검사 없음) */
function draw(t: NameTables, rng: Rng, req: NameRequest): GeneratedName {
  const cfg = t.league.rules.names;
  const cultureId = req.cultureId ?? pickWeighted(rng, cultureWeights(t));
  const culture = t.namePool.cultures.find((c) => c.id === cultureId);
  const pool = t.namePool.pools[cultureId];
  if (!culture || !pool) throw new Error(`없는 문화권: ${cultureId}`);
  const [lo, hi] = culture.surnameCount;
  // 성 개수: 범위 아래값을 기본으로, 범위가 넓으면 multiSurnameChance마다 하나씩 더한다
  let count = lo;
  while (count < hi && rng.chance(cfg.multiSurnameChance)) count++;
  const surnames: string[] = [];
  for (let i = 0; i < count; i++) {
    const cands = req.tone ? pool.surnames.filter((s) => s.tones.includes(req.tone!)) : pool.surnames;
    const s = rng.pick(cands.length ? cands : pool.surnames).text;
    if (surnames.includes(s)) {
      i--;
      if (pool.surnames.length <= surnames.length) break;
      continue;
    }
    surnames.push(s);
  }
  const given = rng.pick(givenCandidates(pool.names, req.gender, req.tone)).text;
  const surname = surnames.join(' ');
  const joiner = cfg.joiner[cultureId] ?? ' ';
  const display = !surname ? given : culture.order === 'family_first' ? `${surname}${joiner}${given}` : `${given}${joiner}${surname}`;
  return { cultureId, surname, given, display };
}

/**
 * 이름 하나를 만든다. 같은 시드(또는 같은 상태의 rng)면 같은 이름.
 * 겹치거나 blocklist에 걸리면 같은 흐름에서 다시 뽑는다(maxRetries번). 그래도 안 되면 문화권을 풀어 다시 뽑는다.
 */
export function generateName(t: NameTables, seed: string | Rng, req: NameRequest): GeneratedName {
  const rng = typeof seed === 'string' ? createRng(seed) : seed;
  const blocked = new Set(t.namePool.blocklist.map(([s, g]) => `${nameKey(s)}|${nameKey(g)}`));
  const used = req.used;
  const cfg = t.league.rules.names;
  for (let i = 0; i < cfg.maxRetries * 2; i++) {
    const r = draw(t, rng, i < cfg.maxRetries ? req : { ...req, cultureId: undefined });
    if (blocked.has(`${nameKey(r.surname)}|${nameKey(r.given)}`)) continue;
    const key = nameKey(r.display);
    if (used?.has(key)) continue;
    used?.add(key);
    return r;
  }
  throw new Error('겹치지 않는 이름을 만들지 못했다');
}
