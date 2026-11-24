// 지시서 021: 계약자별 스탯 성장률, 별 표시, 성장 속도 삭제
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_STATS, tables, type CoreStats } from '../data';
import { statsPower } from './combatPower';
import { expToNextLevel, getMerc, mercToUnit, newGame } from './game';
import { growthStars, levelScale, roleBaseStats, statsAtLevel } from './stats';
import { createMonster } from './unit';

const base = tables.stats.levelGrowthRate;

describe('021 스탯 계산', () => {
  it('성장률이 없으면 기본값, 있으면 계약자 값으로 레벨 성장한다', () => {
    const b = roleBaseStats(tables, 'shield');
    const plain = statsAtLevel(tables, b, 30);
    const fast: Partial<CoreStats> = { hp: 0.04 };
    const grown = statsAtLevel(tables, b, 30, 1, fast);
    expect(plain.hp).toBe(Math.round(b.hp * Math.pow(1 + base.hp, 29)));
    expect(grown.hp).toBe(Math.round(b.hp * Math.pow(1.04, 29)));
    // 값이 없는 스탯은 기본값
    expect(grown.pAtk).toBe(plain.pAtk);
    expect(levelScale(tables, 'spd', 11, { spd: 0.02 })).toBeCloseTo(Math.pow(1.02, 10));
    // 레벨 1은 성장률과 관계없이 기본 스탯
    expect(statsAtLevel(tables, b, 1, 1, fast)).toEqual(statsAtLevel(tables, b, 1));
  });

  it('계약자 유닛은 roster의 성장률을, 몬스터와 주인공은 기본 성장률을 쓴다', () => {
    const s = newGame(tables, { seed: 'g', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'fire', role: 'warrior', background: 'survivor' } });
    const m = { ...getMerc(s, 'm02'), level: 40, loyalty: undefined };
    const row = tables.roster.find((r) => r.id === 'm02')!;
    const u = mercToUnit(tables, m);
    expect(u.stats.hp).toBe(Math.round(row.baseStats!.hp * Math.pow(1 + row.growthRates!.hp, 39)));
    expect(u.stats.spd).toBeCloseTo(row.baseStats!.spd * Math.pow(1 + row.growthRates!.spd, 39), 1);
    const hero = { ...getMerc(s, 'hero'), level: 20 };
    expect(mercToUnit(tables, hero).stats).toEqual(statsAtLevel(tables, roleBaseStats(tables, 'warrior'), 20));
    const mon = createMonster(tables, { id: 'x', name: 'x', element: 'void', role: 'mage', grade: 'mid', level: 25 });
    expect(mon.stats).toEqual(statsAtLevel(tables, roleBaseStats(tables, 'mage'), 25));
  });

  it('별: 기본값은 ★★★, 한 칸마다 growthStarStep, 1~5로 자른다', () => {
    for (const id of CORE_STATS) expect(growthStars(tables, id, base[id])).toBe(3);
    expect(growthStars(tables, 'hp', base.hp * 1.05)).toBe(4);
    expect(growthStars(tables, 'hp', base.hp * 0.9)).toBe(1);
    expect(growthStars(tables, 'hp', base.hp * 2)).toBe(5);
    expect(growthStars(tables, 'spd', base.spd * 1.3)).toBe(5);
    expect(growthStars(tables, 'spd', base.spd * 0.85)).toBe(2);
  });
});

describe('021 데이터 검증(36명)', () => {
  const draft: { id: string; stars: CoreStats }[] = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../docs/design/roster-v2-draft.json'), 'utf8'));
  const { core, spd, capPower } = tables.stats.growthRateBounds;

  it('36명 모두 핵심 6스탯 성장률이 있고 기본값의 0.88~1.12배(속도 0.64~1.36배)다', () => {
    expect(tables.roster).toHaveLength(36);
    const bad: string[] = [];
    for (const r of tables.roster) {
      expect(r.growthRates, r.id).toBeDefined();
      for (const id of CORE_STATS) {
        const [lo, hi] = id === 'spd' ? spd : core;
        const ratio = r.growthRates![id] / base[id];
        if (ratio < lo - 1e-9 || ratio > hi + 1e-9) bad.push(`${r.id}.${id} ${ratio.toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('성장 한계 레벨 전투력이 기본 성장률일 때의 0.95~1.05배다', () => {
    const bad = tables.roster
      .map((r) => ({ id: r.id, ratio: statsPower(tables, statsAtLevel(tables, r.baseStats!, r.growth.cap, 1, r.growthRates)) / statsPower(tables, statsAtLevel(tables, r.baseStats!, r.growth.cap)) }))
      .filter((x) => x.ratio < capPower[0] || x.ratio > capPower[1]);
    expect(bad).toEqual([]);
  });

  it('별 계산이 초안(roster-v2-draft.json stars)과 같다', () => {
    const diff: string[] = [];
    for (const r of tables.roster) {
      const d = draft.find((x) => x.id === r.id)!;
      for (const id of CORE_STATS) if (growthStars(tables, id, r.growthRates![id]) !== d.stars[id]) diff.push(`${r.id}.${id} ${growthStars(tables, id, r.growthRates![id])}≠${d.stars[id]}`);
    }
    expect(diff).toEqual([]);
  });

  it('성장 속도 체계가 없다: 표·계약자·주인공에 속도 값이 없고 필요 경험치는 레벨만으로 정해진다', () => {
    expect('growthSpeeds' in tables).toBe(false);
    for (const r of tables.roster) expect(Object.keys(r.growth)).toEqual(['cap']);
    expect('speed' in tables.progression.protagonistGrowth).toBe(false);
    expect(expToNextLevel.length).toBe(2);
  });
});
