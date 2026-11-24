// 지시서 022: 길드 마스터 전용 새 게임, 외곽 임무(자동 배치), 충성도 반응
import { describe, expect, it } from 'vitest';
import { tables, type GameTables } from '../data';
import { advanceDay, dispatch, getMerc, newGame, type DayEvent, type GameState } from './game';
import { loyaltyTier, tendencyOf } from './loyalty';
import { planOuterMissions } from './outer';

const start = (seed = 'outer', t: GameTables = tables) => newGame(t, { seed, guildName: 'g', baseCityId: 'seoul', protagonist: { name: '마스터' } });
const outerEvent = (events: DayEvent[]) => events.find((e): e is Extract<DayEvent, { type: 'outerMission' }> => e.type === 'outerMission');
const patch = (s: GameState, id: string, f: (m: GameState['mercenaries'][number]) => object): GameState => ({
  ...s,
  mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, ...f(m) } : m)),
});
const guild = (s: GameState) => s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => m.id);

describe('022 새 게임', () => {
  it('모드 선택 없이 이름만 받고, 시작 후보 4명 모두 계약자이며 주인공 유닛이 없다', () => {
    const s = start();
    expect(guild(s)).toEqual(tables.roster.filter((r) => r.startingCandidate).map((r) => r.id));
    expect(s.mercenaries).toHaveLength(tables.roster.length);
    expect(s.protagonist).toEqual({ name: '마스터', background: tables.progression.masterBackground });
    expect(s.settings).toEqual({ autoOuter: true });
  });
});

describe('022 외곽 임무', () => {
  it('쉬는 길드 계약자 전원이 배치되고, 종류·보상은 데이터 범위 안이다', () => {
    const s = start();
    const { state, events } = advanceDay(tables, s);
    const ev = outerEvent(events)!;
    expect(ev.results.map((r) => r.mercId).sort()).toEqual(guild(s));
    for (const r of ev.results) {
      const type = tables.outerMissions.types.find((t) => t.id === r.missionId)!;
      const m = getMerc(s, r.mercId);
      if (type.exp) expect(r.exp).toBe(Math.round(type.exp.base + type.exp.perLevel * m.level));
      else expect(r.exp).toBe(0);
      if (type.zero) expect(r.zero).toBe(Math.round(type.zero.base + type.zero.perLevel * m.level));
      else expect(r.zero).toBe(0);
      expect(getMerc(state, r.mercId).exp).toBe(m.exp + r.exp);
    }
    const zeroGain = ev.results.reduce((a, r) => a + r.zero, 0);
    const upkeep = events.find((e) => e.type === 'upkeep');
    expect(state.resources.zero).toBe(s.resources.zero + zeroGain - (upkeep?.type === 'upkeep' ? upkeep.paid : 0));
  });

  it('같은 입력과 시드면 같은 결과, 시드가 다르면 다를 수 있다', () => {
    const a = advanceDay(tables, start('same'));
    const b = advanceDay(tables, start('same'));
    expect(a).toEqual(b);
    const many = Array.from({ length: 12 }, (_, i) => JSON.stringify(outerEvent(advanceDay(tables, start(`s${i}`)).events)!.results.map((r) => r.missionId)));
    expect(new Set(many).size).toBeGreaterThan(1);
  });

  it('부상·파견 중·충성도 위험 구간은 배치하지 않는다', () => {
    let s = start();
    s = patch(s, 'm03', () => ({ injury: { severity: 'light', recoverDay: 9 } }));
    const danger = tables.loyalty.tiers.find((t) => t.id === 'danger')!;
    s = patch(s, 'm04', (m) => ({ loyalty: { ...m.loyalty!, value: danger.min + 1 } }));
    expect(loyaltyTier(tables, getMerc(s, 'm04').loyalty!.value).id).toBe('danger');
    const rift = s.rifts.find((r) => r.cityId === 'seoul')!;
    s = dispatch(tables, s, rift.id, [{ mercId: 'm02', row: 'back' }]);
    const ev = outerEvent(advanceDay(tables, s).events)!;
    expect(ev.results.map((r) => r.mercId)).toEqual(['m01']);
  });

  it('성장 한계면 경험치를 받지 않는다', () => {
    const t: GameTables = { ...tables, outerMissions: { ...tables.outerMissions, types: tables.outerMissions.types.filter((x) => x.exp) } };
    const capped = planOuterMissions(t, 'x', 1, [{ id: 'a', level: 50, cap: 50 }])[0];
    expect(capped.exp).toBe(0);
    const open = planOuterMissions(t, 'x', 1, [{ id: 'a', level: 49, cap: 50 }])[0];
    expect(open.exp).toBeGreaterThan(0);
  });

  it('경상: 확률로 기존 부상 일수 표의 경상, injury 충성도 변동이 적용된다', () => {
    const t: GameTables = { ...tables, outerMissions: { ...tables.outerMissions, injury: { ...tables.outerMissions.injury, chance: 1 } } };
    const s = start('hurt', t);
    const { state, events } = advanceDay(t, s);
    const light = tables.injuries.severities.find((x) => x.id === 'light')!;
    for (const r of outerEvent(events)!.results) {
      expect(r.injuryDays).toBeGreaterThanOrEqual(light.days[0]);
      expect(r.injuryDays).toBeLessThanOrEqual(light.days[1]);
      const m = getMerc(state, r.mercId);
      expect(m.injury).toEqual({ severity: 'light', recoverDay: state.day + r.injuryDays! + 1 });
      expect(m.loyalty!.recent.some((x) => x.reason === 'injury' && x.day === state.day)).toBe(true);
    }
  });
});

describe('022 충성도 반응', () => {
  it('안정형만 −0.5, 나머지 성향은 0이고 기록도 남지 않는다. 쉬는 날·노는 날로 세지 않고 연속 쉰 일수는 그대로', () => {
    let s = start();
    // 성향이 다른 배경으로 바꿔 본다(시민 = 안정, 군인 = 명예)
    s = patch(s, 'm01', (m) => ({ profile: { ...m.profile, background: 'citizen' }, loyalty: { ...m.loyalty!, restStreak: 3 } }));
    s = patch(s, 'm02', (m) => ({ profile: { ...m.profile, background: 'soldier' }, loyalty: { ...m.loyalty!, restStreak: 9 } }));
    expect(tendencyOf(tables, 'citizen')?.id).toBe('stability');
    const { state, events } = advanceDay(tables, s);
    const res = outerEvent(events)!.results;
    expect(res.find((r) => r.mercId === 'm01')!.loyaltyDelta).toBe(-0.5);
    expect(res.find((r) => r.mercId === 'm02')!.loyaltyDelta).toBe(0);
    for (const id of ['m01', 'm02']) {
      const m = getMerc(state, id);
      expect(m.loyalty!.recent.filter((x) => x.day === state.day).map((x) => x.reason)).not.toContain('restDay');
      expect(m.loyalty!.recent.filter((x) => x.day === state.day).map((x) => x.reason)).not.toContain('idleDecay');
    }
    expect(getMerc(state, 'm01').loyalty!.restStreak).toBe(3);
    expect(getMerc(state, 'm02').loyalty!.restStreak).toBe(9);
    expect(getMerc(state, 'm01').loyalty!.value).toBe(getMerc(s, 'm01').loyalty!.value - 0.5);
    expect(getMerc(state, 'm02').loyalty!.value).toBe(getMerc(s, 'm02').loyalty!.value);
    expect(getMerc(state, 'm02').loyalty!.recent.some((x) => x.reason === 'outerMission')).toBe(false);
  });

  it('자동 배치를 끄면 예전처럼 쉰다: 아무도 배치되지 않을 때와 결과가 같다', () => {
    const off = { ...start('off'), settings: { autoOuter: false } };
    // 배치 대상이 없게 만든 표(모든 충성도 구간 제외) = 예전 규칙
    const none: GameTables = { ...tables, outerMissions: { ...tables.outerMissions, excludeLoyaltyTiers: tables.loyalty.tiers.map((t) => t.id) } };
    const a = advanceDay(tables, off);
    const b = advanceDay(none, { ...off, settings: { autoOuter: true } });
    expect(outerEvent(a.events)).toBeUndefined();
    expect(outerEvent(b.events)).toBeUndefined();
    expect(a.events).toEqual(b.events);
    expect({ ...a.state, settings: null }).toEqual({ ...b.state, settings: null });
    // 쉬는 날 상승이 그대로 들어간다
    for (const id of guild(off)) expect(getMerc(a.state, id).loyalty!.restStreak).toBe(1);
  });
});
