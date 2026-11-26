// 지시서 027: 활약도 기여 측정값·활약도 계산·시즌 기록
import { describe, expect, it } from 'vitest';
import { getRole, tables, type GameTables, type Row } from '../data';
import { CONTRIBUTION_MEASURES, emptyTally, resolveCombat, type CombatEvent, type CombatSlot, type ContributionTally } from './combat';
import { activityScore, currentSeasonTally, emptyActivityTally, isApplicableAt, levelBandOf, recordSortie, seasonOf, sortieScore, type SortieInput } from './contribution';
import { advanceDay, dispatch, mercToUnit, newGame } from './game';
import { createRng } from './rng';
import { createMonster } from './unit';

/** 실제 로스터(스킬 배정 그대로) 5명 vs 몬스터 3~4. 기만자·전술가·사제가 자주 끼도록 섞는다 */
function fightOf(i: number) {
  const s = newGame(tables, { seed: 'c27', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'm' } });
  const r = createRng(`c27:${i}`);
  const pool = [...s.mercenaries];
  const level = [5, 15, 30][i % 3];
  const allies: CombatSlot[] = Array.from({ length: 5 }, () => {
    const m = pool.splice(r.int(0, pool.length - 1), 1)[0];
    return { unit: mercToUnit(tables, { ...m, level, affiliation: { kind: 'guild' } }), row: getRole(tables, m.role).defaultRow as Row };
  });
  const enemies: CombatSlot[] = Array.from({ length: r.int(3, 4) }, (_, k) => {
    const mon = r.pick(tables.monsters);
    const unit = createMonster(tables, { id: `e${k}`, name: mon.name, element: mon.element, role: mon.role, level: level + r.int(0, 4), grade: r.pick(['mid', 'high', 'extreme']), monsterId: mon.id });
    return { unit, row: getRole(tables, unit.role).defaultRow as Row };
  });
  return { allies, enemies, seed: `c27-seed:${i}` };
}

/**
 * 이벤트 로그만으로 측정값을 다시 센다(엔진 집계와 독립). 지속 피해·보호막은 '마지막으로 건 유닛', 도발은 걸린 뒤 풀릴 때까지.
 */
function deriveFromEvents(events: CombatEvent[]): Record<string, ContributionTally> {
  const start = events[0];
  if (start.type !== 'start') throw new Error('start 없음');
  const out: Record<string, ContributionTally> = Object.fromEntries(start.combatants.map((c) => [c.key, emptyTally()]));
  const side = (k: string) => k[0];
  const dotSrc = new Map<string, string>();
  const shieldSrc = new Map<string, string>();
  const taunting = new Set<string>();
  const add = (k: string | undefined, m: keyof ContributionTally, v: number) => {
    if (k !== undefined) out[k][m] += v;
  };
  for (const e of events) {
    if (e.type === 'action') {
      for (const f of e.effects) {
        if (f.kind === 'damage') {
          const absorbed = f.absorbed ?? 0;
          add(e.actor, 'damage', f.amount);
          if (absorbed) add(shieldSrc.get(f.target), 'guard', absorbed);
          if (taunting.has(f.target)) add(f.target, 'guard', f.amount - absorbed);
          if (f.downed) {
            add(e.actor, 'kill', 1);
            taunting.delete(f.target);
          }
        } else if (f.kind === 'heal') add(e.actor, 'heal', f.amount);
        else if (f.kind === 'cleanse') add(e.actor, 'cleanse', f.removed.length);
        else if (f.kind === 'status') {
          if (f.status === 'taunt') taunting.add(f.target);
          if (f.immune) continue;
          if (f.status === 'dot') dotSrc.set(f.target, e.actor);
          if (f.status === 'shield') shieldSrc.set(f.target, e.actor);
          const enemy = side(f.target) !== side(e.actor);
          if (enemy && (f.status === 'stun' || f.status === 'dot' || f.status === 'mark')) add(e.actor, 'status', 1);
          if (enemy && f.status === 'weaken') add(e.actor, 'debuff', 1);
          if (!enemy && f.status === 'buff') add(e.actor, 'buff', 1);
        }
      }
    } else if (e.type === 'tick') {
      const absorbed = e.absorbed ?? 0;
      const src = dotSrc.get(e.target);
      add(src, 'damage', e.amount);
      if (absorbed) add(shieldSrc.get(e.target), 'guard', absorbed);
      if (taunting.has(e.target)) add(e.target, 'guard', e.amount - absorbed);
      if (e.downed) {
        add(src, 'kill', 1);
        taunting.delete(e.target);
      }
    } else if (e.type === 'expire' && e.status === 'taunt') taunting.delete(e.target);
  }
  return out;
}

describe('027 기여 측정값(전투 로그와 대조)', () => {
  const N = 300;
  const results = Array.from({ length: N }, (_, i) => {
    const f = fightOf(i);
    return { f, r: resolveCombat(tables, f) };
  });

  it('엔진 집계가 이벤트 로그로 다시 센 값과 모든 항목에서 같다', () => {
    for (const { f, r } of results) {
      const derived = deriveFromEvents(r.events);
      const start = r.events[0] as Extract<CombatEvent, { type: 'start' }>;
      for (const c of start.combatants) expect(r.contributions[c.unitId], `${f.seed} ${c.key}`).toEqual(derived[c.key]);
      void f;
    }
  });

  it('표본에 지속 피해 틱·보호막 흡수·도발 중 피해·기절 면역·해제가 실제로 나온다(대조 테스트가 의미 있게)', () => {
    const all = results.flatMap(({ r }) => r.events);
    expect(all.some((e) => e.type === 'tick')).toBe(true);
    expect(all.some((e) => e.type === 'action' && e.effects.some((f) => f.kind === 'damage' && (f.absorbed ?? 0) > 0))).toBe(true);
    expect(all.some((e) => e.type === 'action' && e.effects.some((f) => f.kind === 'status' && f.status === 'taunt'))).toBe(true);
    expect(all.some((e) => e.type === 'action' && e.effects.some((f) => f.kind === 'status' && f.immune))).toBe(true);
    const guard = results.reduce((a, { r }) => a + Object.values(r.contributions).reduce((b, t) => b + t.guard, 0), 0);
    expect(guard).toBeGreaterThan(0);
  });

  it('지속 피해 틱은 건 사람에게 귀속된다(틱을 맞은 쪽·다른 아군이 아니라)', () => {
    let checked = 0;
    for (const { r } of results) {
      const ticks = r.events.filter((e): e is Extract<CombatEvent, { type: 'tick' }> => e.type === 'tick' && e.target.startsWith('e'));
      if (!ticks.length) continue;
      const casters = new Set(r.events.flatMap((e) => (e.type === 'action' && e.effects.some((f) => f.kind === 'status' && f.status === 'dot' && f.target.startsWith('e')) ? [e.actor] : [])));
      const start = r.events[0] as Extract<CombatEvent, { type: 'start' }>;
      const direct = new Map<string, number>();
      for (const e of r.events) if (e.type === 'action') for (const f of e.effects) if (f.kind === 'damage') direct.set(e.actor, (direct.get(e.actor) ?? 0) + f.amount);
      const tickSum = ticks.reduce((a, t) => a + t.amount, 0);
      const extra = start.combatants.filter((c) => c.side === 'ally').reduce((a, c) => a + r.contributions[c.unitId].damage - (direct.get(c.key) ?? 0), 0);
      expect(extra).toBe(tickSum);
      for (const c of start.combatants.filter((c) => c.side === 'ally' && !casters.has(c.key))) expect(r.contributions[c.unitId].damage).toBe(direct.get(c.key) ?? 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('회복은 실제로 늘어난 체력만 센다(넘친 양 제외): 회복 뒤 체력은 최대 체력을 넘지 않는다', () => {
    let heals = 0;
    for (const { r } of results) {
      const start = r.events[0] as Extract<CombatEvent, { type: 'start' }>;
      const max = new Map(start.combatants.map((c) => [c.key, c.maxHp]));
      for (const e of r.events) if (e.type === 'action') for (const f of e.effects) if (f.kind === 'heal') {
        expect(f.hpAfter).toBeLessThanOrEqual(max.get(f.target)!);
        expect(f.amount).toBeGreaterThanOrEqual(0);
        heals += f.amount;
      }
    }
    expect(heals).toBeGreaterThan(0);
  });

  it('면역으로 막힌 기절은 상태이상 부여에 세지 않는다', () => {
    for (const { r } of results) {
      const start = r.events[0] as Extract<CombatEvent, { type: 'start' }>;
      for (const c of start.combatants.filter((c) => c.side === 'ally')) {
        let landed = 0;
        for (const e of r.events)
          if (e.type === 'action' && e.actor === c.key)
            for (const f of e.effects) if (f.kind === 'status' && !f.immune && f.target.startsWith('e') && ['stun', 'dot', 'mark'].includes(f.status)) landed++;
        expect(r.contributions[c.unitId].status).toBe(landed);
      }
    }
  });

  it('같은 입력·시드면 같은 기록(결정성)', () => {
    for (let i = 0; i < 30; i++) expect(resolveCombat(tables, fightOf(i)).contributions).toEqual(results[i].r.contributions);
  });
});

describe('027 활약도 계산', () => {
  const c = tables.contribution;
  const L = 25; // 21-30 구간
  const bandOf = (level: number) => c.levelBands.find((b) => level >= b.min && level <= b.max)!.id;
  const baselineOf = (role: string, level = L) => Object.fromEntries(c.items.map((i) => [i.id, c.baselines[role]?.[bandOf(level)]?.[i.id] ?? 0]));

  it('레벨 구간 찾기: 경계 10/11, 20/21, 70', () => {
    expect(levelBandOf(tables, 1).id).toBe('1-10');
    expect(levelBandOf(tables, 10).id).toBe('1-10');
    expect(levelBandOf(tables, 11).id).toBe('11-20');
    expect(levelBandOf(tables, 20).id).toBe('11-20');
    expect(levelBandOf(tables, 21).id).toBe('21-30');
    expect(levelBandOf(tables, 70).id).toBe('61-70');
    expect(levelBandOf(tables, 99).id).toBe('61-70'); // 범위 밖은 가장 가까운 구간
  });

  it('같은 역할·같은 레벨대 평균(기준값)을 넣으면 모든 구간에서 100', () => {
    for (const role of tables.roles.filter((r) => r.enabled).map((r) => r.id))
      for (const b of c.levelBands) expect(sortieScore(tables, role, b.min, baselineOf(role, b.min)), `${role} ${b.id}`).toBeCloseTo(100, 6);
  });

  it('가중치 0인 항목은 점수에 영향이 없다(해당 없음 = 불이익 없음)', () => {
    const role = 'warrior';
    const zero = c.items.find((i) => (c.weights[role][i.id] ?? 0) === 0)!;
    const base = sortieScore(tables, role, L, baselineOf(role))!;
    expect(sortieScore(tables, role, L, { ...baselineOf(role), [zero.id]: 9999 })).toBeCloseTo(base, 9);
    expect(isApplicableAt(tables, role, L, zero.id)).toBe(false);
  });

  it('기준값이 0인 항목도 계산에서 빠진다(가중치가 있어도)', () => {
    const band = bandOf(L);
    const t: GameTables = { ...tables, contribution: { ...c, baselines: { ...c.baselines, archer: { ...c.baselines.archer, [band]: { ...c.baselines.archer[band], status: 0 } } } } };
    expect(sortieScore(t, 'archer', L, { ...baselineOf('archer'), status: 0 })).toBeCloseTo(100, 6);
  });

  it('피해와 처치 가중치가 다르면 같은 비율 변화라도 점수가 달라진다(처치 < 피해)', () => {
    const role = 'mage';
    expect(c.weights[role].kill).toBeLessThan(c.weights[role].damage);
    const b = baselineOf(role);
    expect(sortieScore(tables, role, L, { ...b, damage: b.damage * 2 })!).toBeGreaterThan(sortieScore(tables, role, L, { ...b, kill: b.kill * 2 })!);
  });

  it('같은 원값이라도 레벨 구간이 높으면 점수가 낮다(높은 레벨은 기준값이 크다)', () => {
    const b = baselineOf('archer', 15);
    expect(sortieScore(tables, 'archer', 15, b)!).toBeCloseTo(100, 6);
    expect(sortieScore(tables, 'archer', 65, b)!).toBeLessThan(70);
  });

  it('출전 0이면 점수 없음(null, 화면 —)', () => {
    expect(activityScore(tables, 'mage', emptyActivityTally(tables))).toBeNull();
  });

  it('모든 역할·구간에 계산할 항목이 하나 이상 있고, 표는 항목 id만 쓴다', () => {
    const ids = new Set(c.items.map((i) => i.id));
    expect([...ids].sort()).toEqual([...CONTRIBUTION_MEASURES].sort());
    for (const role of tables.roles.filter((r) => r.enabled)) {
      expect(Object.keys(c.weights[role.id]).every((k) => ids.has(k))).toBe(true);
      for (const b of c.levelBands) expect(c.items.some((i) => isApplicableAt(tables, role.id, b.min, i.id)), `${role.id} ${b.id}`).toBe(true);
    }
  });
});

describe('027 시즌·통산 기록', () => {
  const tally = (dmg: number): ContributionTally => ({ ...emptyTally(), damage: dmg, kill: 1 });
  const sortie = (day: number, dmg = 100, over: Partial<SortieInput> = {}): SortieInput => ({ day, role: 'mage', level: 25, riftName: `r${day}`, tier: 'crack', outcome: 'victory', downed: false, tally: tally(dmg), ...over });

  it('시즌 번호 = floor((일차 − 1) ÷ 60) + 1(리그 시즌 길이로 일원화, 028a)', () => {
    expect(seasonOf(tables, 1)).toBe(1);
    expect(seasonOf(tables, 60)).toBe(1);
    expect(seasonOf(tables, 61)).toBe(2);
    expect(seasonOf(tables, 121)).toBe(3);
  });

  it('시즌 경계(60 → 61일)에서 시즌 합계는 새로 시작하고 통산은 유지한다', () => {
    let rec = recordSortie(tables, undefined, sortie(59, 100));
    rec = recordSortie(tables, rec, sortie(60, 50, { outcome: 'defeat', downed: true }));
    expect(rec.season).toMatchObject({ no: 1, sorties: 2, clears: 1, downs: 1 });
    expect(rec.season.items.damage).toBe(150);
    rec = recordSortie(tables, rec, sortie(61, 70));
    expect(rec.season).toMatchObject({ no: 2, sorties: 1, clears: 1, downs: 0 });
    expect(rec.season.items.damage).toBe(70);
    expect(rec.career).toMatchObject({ sorties: 3, clears: 2, downs: 1 });
    expect(rec.career.items.damage).toBe(220);
    expect(rec.pastSeasons.map((p) => [p.no, p.items.damage])).toEqual([[1, 150]]);
  });

  it('누적 활약도는 비율 합계로 다시 계산한다(최근 10건 점수가 아니라 전체 공략, 레벨이 섞여도 각자 구간으로)', () => {
    let rec = recordSortie(tables, undefined, sortie(1, 2000, { level: 8 }));
    for (let d = 2; d <= 12; d++) rec = recordSortie(tables, rec, sortie(d, 10, { level: d < 7 ? 15 : 45 }));
    expect(rec.recent).toHaveLength(10);
    const cumulative = activityScore(tables, 'mage', rec.career)!;
    // 공략별 점수(반올림 전)의 평균과 같다(활약도가 항목 비율에 대해 선형이고 모든 공략에 같은 항목이 들어갈 때)
    const per = [sortieScore(tables, 'mage', 8, { ...tally(2000) })!, ...Array.from({ length: 11 }, (_, k) => sortieScore(tables, 'mage', k + 2 < 7 ? 15 : 45, { ...tally(10) })!)];
    expect(cumulative).toBeCloseTo(per.reduce((a, x) => a + x, 0) / per.length, 6);
    const recentAvg = rec.recent.reduce((a, r) => a + r.score!, 0) / rec.recent.length;
    expect(cumulative).toBeGreaterThan(recentAvg + 10);
    expect(rec.career.ratioCounts.damage).toBe(12);
  });

  it('최근 공략 점수는 그 시점 기준값으로 저장되고 나중에 기준값이 바뀌어도 그대로다', () => {
    const rec = recordSortie(tables, undefined, sortie(3, 300));
    const saved = rec.recent[0].score;
    const c = tables.contribution;
    const t: GameTables = { ...tables, contribution: { ...c, baselines: { ...c.baselines, mage: Object.fromEntries(Object.entries(c.baselines.mage).map(([k, v]) => [k, { ...v, damage: v.damage * 2 }])) } } };
    const rec2 = recordSortie(t, rec, sortie(4, 300));
    expect(rec2.recent[1].score).toBe(saved);
    expect(rec2.recent[0].score).toBeLessThan(saved!);
  });

  it('최근 공략은 최신이 앞, 최대 10건. 지난 시즌은 최근 5시즌만', () => {
    let rec = recordSortie(tables, undefined, sortie(1));
    for (let d = 2; d <= 15; d++) rec = recordSortie(tables, rec, sortie(d));
    expect(rec.recent).toHaveLength(10);
    expect(rec.recent[0].day).toBe(15);
    for (let k = 1; k <= 8; k++) rec = recordSortie(tables, rec, sortie(60 * k + 1));
    expect(rec.pastSeasons.map((p) => p.no)).toEqual([4, 5, 6, 7, 8]);
    expect(rec.season.no).toBe(9);
  });

  it('이번 시즌 보기: 기록이 지난 시즌에 멈춰 있으면 0', () => {
    const rec = recordSortie(tables, undefined, sortie(5));
    expect(currentSeasonTally(tables, rec, 20).sorties).toBe(1);
    expect(currentSeasonTally(tables, rec, 70).sorties).toBe(0);
    expect(currentSeasonTally(tables, undefined, 70).sorties).toBe(0);
  });
});

describe('027 게임 진행과 기록', () => {
  const played = () => {
    let s = newGame(tables, { seed: 'c27-game', guildName: 'g', baseCityId: 'seoul', protagonist: { name: 'm' } });
    const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
    const rift = s.rifts.find((r) => r.cityId === 'seoul')!;
    s = dispatch(tables, s, rift.id, guild.map((m) => ({ mercId: m.id, row: getRole(tables, m.role).defaultRow as Row })));
    for (let i = 0; i < 6 && !s.mercenaries.some((m) => m.activity); i++) s = advanceDay(tables, s).state;
    return { s, ids: guild.map((m) => m.id) };
  };

  it('파견에서 돌아오면 파티원 모두에게 출전·항목 합계·최근 공략이 생기고 리포트 전투와 같은 값이다', () => {
    const { s, ids } = played();
    const rep = s.reports.at(-1)!;
    for (const id of ids) {
      const a = s.mercenaries.find((m) => m.id === id)!.activity!;
      expect(a.career.sorties).toBe(1);
      expect(a.season.no).toBe(seasonOf(tables, rep.day));
      expect(a.recent[0]).toMatchObject({ day: rep.day, riftName: rep.rift.name, tier: rep.rift.tier, outcome: rep.outcome });
      expect(a.career.clears).toBe(rep.outcome === 'victory' ? 1 : 0);
    }
    const derived = deriveFromEvents(rep.events!);
    const start = rep.events![0] as Extract<CombatEvent, { type: 'start' }>;
    for (const c of start.combatants.filter((c) => c.side === 'ally')) {
      expect(s.mercenaries.find((m) => m.id === c.unitId)!.activity!.career.items).toEqual(derived[c.key]);
    }
    // 같은 시드로 다시 하면 같은 기록(결정성)
    expect(played().s.mercenaries.map((m) => m.activity)).toEqual(s.mercenaries.map((m) => m.activity));
  });

  it('충성도로 길드를 떠난 계약자도 기록이 남는다', () => {
    const { s, ids } = played();
    const id = ids[0];
    const t: GameTables = { ...tables, loyalty: { ...tables.loyalty, departure: { ...tables.loyalty.departure, chance: 1, afterConsecutiveDays: 0 } } };
    let cur = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, loyalty: { ...m.loyalty!, value: 0 } } : m)) };
    const before = cur.mercenaries.find((m) => m.id === id)!.activity;
    let departed = false;
    for (let i = 0; i < 5 && !departed; i++) {
      const r = advanceDay(t, cur);
      cur = r.state;
      departed = r.events.some((e) => e.type === 'departed' && e.mercId === id);
    }
    expect(departed).toBe(true);
    const m = cur.mercenaries.find((x) => x.id === id)!;
    expect(m.affiliation.kind).toBe('unaffiliated');
    expect(m.activity).toEqual(before);
  });
});
