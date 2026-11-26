import { describe, expect, it } from 'vitest';
import { getRole } from '../data';
import { legacyTables as tables } from '../testing/legacyTables';
import { autoParty } from './autoParty';
import {
  advanceDay,
  dispatch,
  getMerc,
  isAvailable,
  mercToUnit,
  newGame,
  paySalaryBonus,
  recruit,
  recruitInfo,
  salaryBonusCost,
  type GameState,
} from './game';
import { applyLoyalty, loyaltyDelta, loyaltyTier, tendencyOf } from './loyalty';
import type { Rift } from './rift';
import { statsAtLevel } from './stats';

const L = tables.loyalty;
const gm = (seed = 'loyal') =>
  newGame(tables, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'gm' } });

/** 용병 충성도를 직접 바꾼 상태 */
const setLoyalty = (s: GameState, id: string, patch: object): GameState => ({
  ...s,
  mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, loyalty: { ...m.loyalty!, ...patch } } : m)),
});
const rift = (id: string, patch: Partial<Rift> = {}): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  territoryFactionId: null,
  deadlineDay: 30,
  durationDays: 1,
  enemies: [{ monsterId: 'void_hound', grade: 'low', level: 1, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
  ...patch,
});
const withRift = (s: GameState, r: Rift): GameState => ({ ...s, rifts: [...s.rifts, r] });
const value = (s: GameState, id: string) => getMerc(s, id).loyalty!.value;
const bg = (s: GameState, id: string) => getMerc(s, id).profile.background;

describe('충성도 구간', () => {
  it.each([
    [100, 'high'], [70, 'high'], [69, 'normal'], [40, 'normal'], [39, 'low'], [20, 'low'], [19, 'danger'], [0, 'danger'], [19.9, 'danger'],
  ])('%s → %s', (v, tier) => {
    expect(loyaltyTier(tables, v).id).toBe(tier);
  });

  it('구간별 능력 배율이 전투 유닛의 공격·방어에 적용된다', () => {
    const s = gm();
    const m01 = getMerc(s, 'm01');
    const row = tables.roster.find((r) => r.id === 'm01')!;
    const base = statsAtLevel(tables, row.baseStats!, m01.level, 1, row.growthRates);
    for (const t of L.tiers) {
      const unit = mercToUnit(tables, getMerc(setLoyalty(s, 'm01', { value: t.min }), 'm01'));
      for (const k of ['pAtk', 'eAtk', 'pDef', 'eDef'] as const) expect(unit.stats[k]).toBeCloseTo(base[k] * (1 + t.statBonus), 1);
      expect(unit.stats.hp).toBe(base.hp);
      expect(unit.stats.spd).toBe(base.spd);
    }
  });

  it('모든 계약자가 같은 틀로 충성도를 갖고, 길드 밖 용병은 시작값을 보관만 한다', () => {
    let s = gm();
    expect(value(s, 'm01')).toBe(L.start);
    expect(value(s, 'm05')).toBe(L.start);
    for (let i = 0; i < 10; i++) s = advanceDay(tables, s).state;
    expect(getMerc(s, 'm05').loyalty).toEqual(gm().mercenaries.find((m) => m.id === 'm05')!.loyalty);
    expect(value(s, 'm01')).not.toBe(L.start); // 길드 용병은 시뮬레이션
  });
});

describe('충성도 변동 요인', () => {
  it('길드에서 쉬는 날은 오른다(파견·부상 중은 제외)', () => {
    let s = withRift(gm(), rift('A'));
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 9 } } : m)) };
    s = dispatch(tables, s, 'A', [{ mercId: 'm02', row: 'back' }]);
    const next = advanceDay(tables, s).state;
    expect(value(next, 'm01')).toBe(L.start + loyaltyDelta(tables, bg(s, 'm01'), 'restDay'));
    expect(value(next, 'm03')).toBe(L.start); // 부상 중
    // m02는 파견에서 이기고 돌아옴: 쉬는 날 아님, 승리만
    expect(value(next, 'm02')).toBe(L.start + loyaltyDelta(tables, bg(s, 'm02'), 'victory'));
  });

  it('패배와 부상은 내린다', () => {
    let s = withRift(gm(), rift('D', { enemies: Array.from({ length: 5 }, () => ({ monsterId: 'devourer', grade: 'extreme', level: 70, row: 'front' as const })) }));
    s = dispatch(tables, s, 'D', [{ mercId: 'm01', row: 'front' }]);
    const next = advanceDay(tables, s).state;
    expect(next.reports[0].outcome).toBe('defeat');
    expect(next.reports[0].injuries.map((i) => i.unitId)).toEqual(['m01']);
    const expected = L.start + loyaltyDelta(tables, bg(s, 'm01'), 'defeat') + loyaltyDelta(tables, bg(s, 'm01'), 'injury');
    expect(value(next, 'm01')).toBeCloseTo(expected, 5);
    expect(getMerc(next, 'm01').loyalty!.recent.map((r) => r.reason)).toEqual(['defeat', 'injury']);
  });

  it('유지비 미납은 하루마다 내린다(파견 제한은 없음)', () => {
    let s = { ...gm(), resources: { zero: 0, arche: 0, materials: {} } };
    s = advanceDay(tables, s).state;
    const m = getMerc(s, 'm01');
    expect(m.unpaidUpkeep?.days).toBe(1);
    expect(m.loyalty!.value).toBeCloseTo(L.start + loyaltyDelta(tables, m.profile.background, 'unpaidDay') + loyaltyDelta(tables, m.profile.background, 'restDay'), 5);
    expect(isAvailable(s, 'm01')).toBe(true);
  });

  it('급료 보너스는 오르고, 하루 1회이며, 제로가 모자라면 거부한다', () => {
    const s = gm();
    const cost = salaryBonusCost(tables, getMerc(s, 'm01'));
    expect(cost).toBe(L.salaryBonus.costPerLevel * getMerc(s, 'm01').level);
    const paid = paySalaryBonus(tables, s, 'm01');
    expect(paid.resources.zero).toBe(s.resources.zero - cost);
    expect(value(paid, 'm01')).toBe(L.start + loyaltyDelta(tables, bg(s, 'm01'), 'salaryBonus'));
    expect(() => paySalaryBonus(tables, paid, 'm01')).toThrow(/이미/);
    expect(() => paySalaryBonus(tables, { ...s, resources: { ...s.resources, zero: cost - 1 } }, 'm01')).toThrow(/제로/);
    // 다음 날은 다시 가능
    expect(() => paySalaryBonus(tables, advanceDay(tables, paid).state, 'm01')).not.toThrow();
  });

  it('0~100을 벗어나지 않는다', () => {
    const s = gm();
    const m = structuredClone(getMerc(s, 'm01'));
    for (let i = 0; i < 50; i++) applyLoyalty(tables, m.loyalty!, m.profile.background, 'salaryBonus', 1);
    expect(m.loyalty!.value).toBe(L.range[1]);
    for (let i = 0; i < 50; i++) applyLoyalty(tables, m.loyalty!, m.profile.background, 'unpaidDay', 1);
    expect(m.loyalty!.value).toBe(L.range[0]);
    expect(m.loyalty!.recent).toHaveLength(L.recentLogSize);
  });
});

describe('계약 성향', () => {
  it('배경 → 성향 매핑 표가 모든 배경 id를 덮는다(새 배경에 성향을 빠뜨리면 실패)', () => {
    const missing = tables.backgrounds.filter((b) => !tendencyOf(tables, b.id)).map((b) => b.id);
    expect(missing).toEqual([]);
    for (const id of Object.keys(L.backgroundTendency)) expect(tables.backgrounds.some((b) => b.id === id)).toBe(true);
  });

  it('성향 다섯 가지와 이름·설명이 데이터에 있다', () => {
    expect(L.tendencies.map((t) => t.name)).toEqual(['보수', '의리', '명예', '야망', '안정']);
    for (const t of L.tendencies) expect(t.description.length).toBeGreaterThan(0);
  });

  it.each([
    ['보수(기업 요원)', 'corporate', 'unpaidDay', false, 2],
    ['보수 급료', 'corporate', 'salaryBonus', false, 1.5],
    ['의리 패배', 'mercenary_company', 'defeat', false, 0.5],
    ['의리 쉬는 날', 'survivor', 'restDay', false, 1.5],
    ['명예 상급 이상 승리', 'soldier', 'victory', true, 2],
    ['명예 일반 승리', 'soldier', 'victory', false, 1],
    ['명예 패배', 'agent', 'defeat', false, 1.5],
    ['야망 승리', 'wanderer', 'victory', false, 1.5],
    ['야망 쉬는 날', 'heir', 'restDay', false, 0.5],
    ['야망 패배', 'heir', 'defeat', false, 1.2],
    ['안정 부상', 'citizen', 'injury', false, 2],
    ['안정 쉬는 날', 'researcher', 'restDay', false, 2],
    ['안정 승리', 'citizen', 'victory', false, 0.7],
  ] as const)('%s: ×%s', (_label, background, key, hard, weight) => {
    expect(loyaltyDelta(tables, background, key, hard)).toBeCloseTo(L.changes[key] * weight, 5);
  });

  it('명예형은 상급 이상 몬스터 리프트를 이기면 두 배로 오른다(정산 경로)', () => {
    let s = withRift(gm(), rift('H', { enemies: [{ monsterId: 'spore_spitter', grade: 'high', level: 30, row: 'back' }] }));
    // 강태산(군인, 명예)을 포함한 시작 4인을 레벨 45로 올려 확실히 이기게 한다.
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.affiliation.kind === 'guild' ? { ...m, level: 45 } : m)) };
    s = dispatch(tables, s, 'H', ['m01', 'm02', 'm03', 'm04'].map((mercId) => ({ mercId, row: getRole(tables, getMerc(s, mercId).role).defaultRow })));
    const next = advanceDay(tables, s).state;
    expect(next.reports[0].outcome).toBe('victory');
    expect(value(next, 'm01')).toBe(L.start + L.changes.victory * 2);
  });
});

/** 위험 구간에 오래 둔 길드(제로 0이라 매일 미납) */
function dangerGuild(seed: string): GameState {
  let s = gm(seed);
  s = { ...s, resources: { zero: 0, arche: 0, materials: {} } };
  for (const id of ['m01', 'm02', 'm03', 'm04']) s = setLoyalty(s, id, { value: 5 });
  return s;
}

describe('거부와 이탈', () => {
  it('같은 시드와 입력이면 거부·이탈 판정이 같다', () => {
    const run = () => {
      let s = dangerGuild('same');
      const log: unknown[] = [];
      for (let i = 0; i < 12; i++) {
        const r = advanceDay(tables, s);
        s = r.state;
        log.push(r.events.filter((e) => e.type === 'refused' || e.type === 'departed'));
      }
      return { s, log };
    };
    expect(run()).toEqual(run());
  });

  it('하루 시작 거부 판정은 편성 전에 정해져 그날 유지되고, 거부된 용병은 편성·자동 편성에서 빠진다', () => {
    // 거부가 나오는 날을 찾는다(시드 기반이라 매번 같다)
    let s = dangerGuild('refuse');
    let refused: string | undefined;
    for (let i = 0; i < 10 && !refused; i++) {
      const r = advanceDay(tables, s);
      s = r.state;
      refused = r.events.find((e) => e.type === 'refused')?.mercId;
    }
    expect(refused).toBeDefined();
    const id = refused!;
    expect(getMerc(s, id).loyalty!.refusedOnDay).toBe(s.day);
    expect(isAvailable(s, id)).toBe(false);
    s = withRift(s, rift('R'));
    expect(() => dispatch(tables, s, 'R', [{ mercId: id, row: getRole(tables, getMerc(s, id).role).defaultRow }])).toThrow(/거부/);
    expect(autoParty(tables, s, rift('R')).map((p) => p.mercId)).not.toContain(id);
    // 같은 날 다른 행동(급료 보너스 등)을 해도 거부는 유지된다
    expect(isAvailable({ ...s, resources: { zero: 9999, arche: 0, materials: {} } }, id)).toBe(false);
  });

  it('위험 구간이 정해진 일수만큼 이어지기 전에는 이탈하지 않는다', () => {
    let s = dangerGuild('early');
    for (let i = 0; i < L.departure.afterConsecutiveDays; i++) {
      const r = advanceDay(tables, s);
      expect(r.events.some((e) => e.type === 'departed')).toBe(false);
      s = r.state;
    }
    expect(getMerc(s, 'm01').loyalty!.dangerDays).toBe(L.departure.afterConsecutiveDays);
  });

  it('이탈하면 무소속이 되어 길드에서 빠지고, 다시 영입하면 충성도는 시작값이다', () => {
    let s = dangerGuild('leave');
    let gone: string | undefined;
    for (let i = 0; i < 30 && !gone; i++) {
      const r = advanceDay(tables, s);
      s = r.state;
      gone = r.events.find((e) => e.type === 'departed')?.mercId;
    }
    expect(gone).toBeDefined();
    const m = getMerc(s, gone!);
    expect(m.affiliation).toEqual({ kind: 'unaffiliated' }); // 026c: 무소속은 세력이 아닌 상태
    expect(m.loyalty).toMatchObject({ value: L.start, dangerDays: 0, restStreak: 0 }); // 시작값으로 되돌려 보관
    expect(m.departedDay).toBe(s.day);
    expect(isAvailable(s, gone!)).toBe(false);
    expect(recruitInfo(tables, s, gone!).eligible).toBe(true);
    const back = recruit(tables, { ...s, resources: { ...s.resources, zero: 99999 } }, gone!);
    expect(getMerc(back, gone!).affiliation).toEqual({ kind: 'guild' });
    expect(getMerc(back, gone!).loyalty).toMatchObject({ value: L.start, dangerDays: 0 });
  });

  it('파견 중인 용병은 복귀할 때까지 이탈 판정에서 빠진다', () => {
    let s = withRift(dangerGuild('away'), rift('LONG', { durationDays: 2, tier: 'gate', deadlineDay: 50 }));
    s = setLoyalty(s, 'm01', { value: 0, dangerDays: 50 });
    s = { ...s, expeditions: [{ id: 'xz', rift: s.rifts.find((r) => r.id === 'LONG')!, party: [{ mercId: 'm01', row: 'front' }], departDay: 1, travelDays: 0, returnDay: 40 }], rifts: s.rifts.filter((r) => r.id !== 'LONG') };
    for (let i = 0; i < 30; i++) {
      const r = advanceDay(tables, s);
      expect(r.events).not.toContainEqual(expect.objectContaining({ type: 'departed', mercId: 'm01' }));
      s = r.state;
    }
    expect(getMerc(s, 'm01').affiliation).toEqual({ kind: 'guild' });
  });
});
