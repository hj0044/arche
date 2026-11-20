import { describe, expect, it } from 'vitest';
import { getRole, tables } from '../data';
import { autoParty, autoPartyScore } from './autoParty';
import { dispatch, getMerc, guildUpkeepPerDay, newGame, recruitInfo, recruitUpkeepOutlook, upkeepPerDay, type GameState } from './game';
import type { Rift } from './rift';

const opener = (role = 'warrior') =>
  newGame(tables, {
    seed: 'auto',
    guildName: 'g',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: 'p', element: 'fire', role, background: 'survivor' },
  });

const rift = (id = 'A', monsterId = 'void_hound'): Rift => ({
  id,
  cityId: 'seoul',
  tier: 'crack',
  name: id,
  appearedDay: 1,
  fog: { deadlineOffset: 0, levelOffset: 0, countOffset: 0, rewardU: 0 },
  deadlineDay: 9,
  durationDays: 1,
  enemies: [{ monsterId, grade: 'low', level: 3, row: 'front' }],
  reward: { zero: 100, arche: 10, materials: {} },
});

/** 길드에 용병을 더 넣는다(영입비 없이 소속만 바꿈) */
const join = (s: GameState, ...ids: string[]): GameState => ({
  ...s,
  mercenaries: s.mercenaries.map((m) => (ids.includes(m.id) ? { ...m, affiliation: { kind: 'guild' } } : m)),
});
const groups = (s: GameState, party: { mercId: string }[]) =>
  new Set(party.map((p) => getRole(tables, getMerc(s, p.mercId).role).group));

describe('자동 편성', () => {
  it('같은 입력이면 같은 결과', () => {
    const s = join(opener(), 'm05', 'm06', 'm07', 'm10', 'm16', 'm28');
    expect(autoParty(tables, s, rift())).toEqual(autoParty(tables, structuredClone(s), rift()));
  });

  it('주인공이 가용하면 포함하고, 전위·딜러·지원을 모두 갖추며, 최대 인원을 넘지 않는다', () => {
    const s = join(opener(), 'm05', 'm06', 'm07', 'm10', 'm16', 'm28');
    const party = autoParty(tables, s, rift());
    expect(party).toHaveLength(tables.combat.party.maxSize);
    expect(party.map((p) => p.mercId)).toContain('hero');
    expect(groups(s, party)).toEqual(new Set(['vanguard', 'damage', 'support']));
    for (const p of party) expect(p.row).toBe(getRole(tables, getMerc(s, p.mercId).role).defaultRow);
  });

  it('부상·파견 중인 용병은 빼고, 가용 인원이 모자라면 있는 만큼만 넣는다', () => {
    let s = opener();
    s = { ...s, rifts: [...s.rifts, rift('A'), rift('B')] };
    s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === 'm03' ? { ...m, injury: { severity: 'light', recoverDay: 5 } } : m)) };
    s = dispatch(tables, s, 'A', [{ mercId: 'm02', row: 'back' }]);
    const party = autoParty(tables, s, rift('B'));
    expect(party.map((p) => p.mercId).sort()).toEqual(['hero', 'm04']);
  });

  it('주인공이 파견 중이면 주인공 없이 편성한다', () => {
    let s = { ...opener(), rifts: [...opener().rifts, rift('A'), rift('B')] };
    s = dispatch(tables, s, 'A', [{ mercId: 'hero', row: 'front' }]);
    expect(autoParty(tables, s, rift('B')).map((p) => p.mercId)).not.toContain('hero');
  });

  it('리프트 몬스터 속성에 유리한 용병이 같은 분류에서 먼저 뽑힌다', () => {
    // 지원 후보: 마야 참(빛, Lv3, 어둠에 유리) vs 문채원 없음 → 백서린(냉기 지휘관 Lv3). 같은 레벨이면 상성으로 갈린다.
    const s = join(opener('mage'), 'm07');
    const m03 = getMerc(s, 'm03');
    const m07 = getMerc(s, 'm07');
    expect(m03.level).toBe(m07.level);
    expect(autoPartyScore(tables, m03, ['void'])).toBeGreaterThan(autoPartyScore(tables, m07, ['void']));
    const supports = autoParty(tables, s, rift()).filter((p) => getRole(tables, getMerc(s, p.mercId).role).group === 'support');
    expect(supports[0].mercId).toBe('m03');
  });
});

describe('영입 후 유지비 전망', () => {
  it('영입 후 길드 하루 유지비와 수입 없이 버틸 일수를 계산한다', () => {
    const s = opener();
    const o = recruitUpkeepOutlook(tables, s, 'm05');
    const cost = recruitInfo(tables, s, 'm05').cost;
    const after = guildUpkeepPerDay(tables, s) + upkeepPerDay(tables, getMerc(s, 'm05'));
    expect(o).toEqual({
      cost,
      zeroAfter: s.resources.zero - cost,
      dailyUpkeepBefore: guildUpkeepPerDay(tables, s),
      dailyUpkeepAfter: after,
      daysAffordable: Math.floor((s.resources.zero - cost) / after),
    });
  });

  it('제로가 모자라면 버틸 일수는 0', () => {
    const s = { ...opener(), resources: { zero: 10, arche: 0, materials: {} } };
    expect(recruitUpkeepOutlook(tables, s, 'm05').daysAffordable).toBe(0);
  });
});
