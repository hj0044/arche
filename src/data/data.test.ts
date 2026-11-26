import { describe, expect, it } from 'vitest';
import { cities, findCity, tables } from './index';

describe('도시 데이터 표', () => {
  it('1단계 도시는 2~3곳이고 id가 겹치지 않는다', () => {
    expect(cities.length).toBeGreaterThanOrEqual(2);
    expect(cities.length).toBeLessThanOrEqual(3);
    expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
  });

  it('id로 도시를 찾는다', () => {
    expect(findCity('seoul')?.name).toBe('서울');
    expect(findCity('nowhere')).toBeUndefined();
  });
});

describe('라이벌 선점 표(지시서 013)', () => {
  const t = tables.riftPreemption;
  it('등급과 세력은 다른 표의 id를 가리키고, 확률과 배율은 범위 안이다', () => {
    for (const [tier, p] of Object.entries(t.baseChanceByTier)) {
      expect(tables.riftTiers.some((r) => r.id === tier)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    for (const id of t.territoryExcludeFactions) expect(tables.factions.some((f) => f.id === id)).toBe(true);
    for (const row of t.deadlineMultipliers) expect(row.multiplier).toBeGreaterThan(0);
  });
  it('도시 출현 값: 한도 ≥ 1, 확률 0~1, 판정 횟수 ≥ 1', () => {
    for (const c of tables.cities) {
      expect(c.riftSpawn.maxActive).toBeGreaterThanOrEqual(1);
      expect(c.riftSpawn.dailySpawnChance).toBeGreaterThanOrEqual(0);
      expect(c.riftSpawn.dailySpawnChance).toBeLessThanOrEqual(1);
      expect(c.riftSpawn.dailySpawnRolls ?? 1).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('017b: 카드용 짧은 이름', () => {
  it('36명 모두 shortName이 있고, 이름에서 따온 4자 이하다', async () => {
    const { tables } = await import('./index');
    expect(tables.roster).toHaveLength(36);
    const bad = tables.roster.filter((r) => !r.shortName || r.shortName.length > 4 || !r.name.replace(/\s/g, '').includes(r.shortName));
    expect(bad.map((r) => `${r.name}→${r.shortName}`)).toEqual([]);
    expect(tables.roster.find((r) => r.name === '빅토리아 레이놀즈')?.shortName).toBe('빅토리아');
    expect(tables.roster.find((r) => r.name === '강태산')?.shortName).toBe('강태산');
  });
});

describe('지시서 026: 세력 정리', () => {
  it('모든 계약자의 소속은 길드, 세력 id, 또는 null(무소속)이다', () => {
    const ids = new Set(tables.factions.map((f) => f.id));
    expect(tables.roster.filter((r) => r.faction !== 'guild' && r.faction !== null && !ids.has(r.faction)).map((r) => r.id)).toEqual([]);
  });
  it('에지 서클(id indie)과 불워크 시스템즈가 있고 세력 행에 영입 비용 배율이 없다', () => {
    expect(tables.factions.find((f) => f.id === 'indie')).toMatchObject({ name: '에지 서클', type: 'elite', typeName: '독립 강자 모임' });
    expect(tables.factions.find((f) => f.id === 'bulwark')).toMatchObject({ name: '불워크 시스템즈', type: 'megacorp' });
    expect(tables.roster.filter((r) => r.faction === 'indie')).toHaveLength(4); // 026d 재배분
    for (const f of tables.factions) expect(f).not.toHaveProperty('recruitCostMultiplier');
  });
  it('코드·데이터·화면 문구에 삭제한 세력 이름이 남지 않는다', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const banned = ['dokk' + 'aebi', '도깨' + '비불'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json|css|html)$/.test(name)) {
          const text = readFileSync(p, 'utf8');
          for (const b of banned) if (text.includes(b)) hits.push(`${p}: ${b}`);
        }
      }
    };
    for (const d of ['src', 'scripts', 'docs/design/ui']) walk(d);
    expect(hits).toEqual([]);
  });
});

describe('지시서 026b: 충성도 시뮬레이션 대상', () => {
  it('simulatedAffiliations는 길드만 담는다(세력은 세계관 전용)', () => {
    expect(tables.loyalty.simulatedAffiliations).toEqual(['guild']);
  });
});

describe('지시서 027: 활약도 데이터', () => {
  it('항목·가중치·기준값이 모든 사용 역할에 있고 값은 0 이상, 시즌 길이는 리그 규칙 60일(028a 일원화)', () => {
    const c = tables.contribution;
    expect(tables.league.rules.season.length).toBe(60);
    expect(c.items).toHaveLength(8);
    for (const r of tables.roles.filter((x) => x.enabled)) {
      for (const it of c.items) {
        expect(c.weights[r.id]?.[it.id] ?? -1, `${r.id}.${it.id} 가중치`).toBeGreaterThanOrEqual(0);
        expect(c.baselines[r.id]?.[it.id] ?? -1, `${r.id}.${it.id} 기준값`).toBeGreaterThanOrEqual(0);
      }
      // 처치 가중치는 피해보다 낮다(마무리만 노리는 쪽이 유리하지 않게)
      expect(c.weights[r.id].kill).toBeLessThan(c.weights[r.id].damage);
    }
  });
  it('쓰러짐은 영구 사망이 아니다: 데이터 문구에 죽음·전사·사망이 없다', () => {
    const text = JSON.stringify(tables.contribution) + JSON.stringify(tables.terms);
    for (const w of ['죽음', '전사', '사망']) expect(text).not.toContain(w);
  });
});

describe('지시서 026c: 세력 10개, 무소속은 상태', () => {
  const IDS = ['rrb', 'archon', 'bulwark', 'indie', 'lantern', 'prism', 'rose', 'beacon', 'anchor', 'gray'];
  it('세력은 정확히 10개이고 id가 정해진 순서와 같다. 도시 영향력 합은 1.0', () => {
    expect(tables.factions.map((f) => f.id)).toEqual(IDS);
    for (const f of tables.factions) expect(Object.values(f.cityInfluence).reduce((a, x) => a + x, 0), f.id).toBeCloseTo(1, 9);
  });
  it('로스터와 NPC 팀 소속은 세력 id 10개 중 하나이거나 null(무소속). 무소속은 로스터의 약 3분의 1, 모든 세력에 계약자가 있다(026d)', () => {
    const ok = (f: string | null) => f === null || IDS.includes(f);
    expect(tables.roster.filter((r) => r.faction !== 'guild' && !ok(r.faction)).map((r) => r.id)).toEqual([]);
    expect(tables.league.teams.filter((x) => !ok(x.faction)).map((x) => x.id)).toEqual([]);
    const outside = tables.roster.filter((r) => r.faction !== 'guild');
    const none = outside.filter((r) => r.faction === null).length;
    expect(none / outside.length).toBeGreaterThanOrEqual(0.25);
    for (const id of IDS) expect(tables.roster.filter((r) => r.faction === id).length, id).toBeGreaterThan(0);
    // 정보·AI 업종 팀은 세력 id가 없다(세계관 요약 3절)
    expect(tables.league.teams.find((x) => x.id === 'observation-unit')!.faction).toBeNull();
  });
  it('삭제한 세력 id(free·waypoint·옛 소수 용병단)가 코드·데이터·화면 문구에 값으로 남지 않는다', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const banned = new RegExp(`["'](${['fr' + 'ee', 'way' + 'point', 'dokk' + 'aebi'].join('|')})["']`);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json|html)$/.test(name) && !p.includes('fixtures')) {
          const m = readFileSync(p, 'utf8').match(banned);
          if (m) hits.push(`${p}: ${m[0]}`);
        }
      }
    };
    for (const d of ['src', 'scripts', 'docs/design/ui']) walk(d);
    expect(hits).toEqual([]);
  });
});
