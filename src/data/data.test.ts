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
  it('모든 계약자의 소속은 길드이거나 factions.json에 있다', () => {
    const ids = new Set(tables.factions.map((f) => f.id));
    expect(tables.roster.filter((r) => r.faction !== 'guild' && !ids.has(r.faction)).map((r) => r.id)).toEqual([]);
  });
  it('독립 강자 모임과 불워크 시스템즈가 있고 세력 행에 영입 비용 배율이 없다', () => {
    expect(tables.factions.find((f) => f.id === 'indie')).toMatchObject({ name: '독립 강자 모임', type: 'elite' });
    expect(tables.factions.find((f) => f.id === 'bulwark')).toMatchObject({ name: '불워크 시스템즈', type: 'megacorp' });
    expect(tables.roster.filter((r) => r.faction === 'indie')).toHaveLength(6);
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
