import { describe, expect, it } from 'vitest';
import { tables, travelDays } from '../data';
import { initialFacilities, visibleRift } from '../engine/facilities';
import { dispatch, GameError, newGame } from '../engine/game';
import type { Rift } from '../engine/rift';
import { injuryText } from './format';
import { expeditionDays, latestDeparture, zeroPerDay } from './riftInfo';

const fsAt = (scout: number) => ({ ...initialFacilities(tables), levels: { ...initialFacilities(tables).levels, scout } });
const rift = (patch: Partial<Rift> = {}): Rift => ({
  id: 'X',
  cityId: 'seoul',
  tier: 'gate',
  name: 'X',
  appearedDay: 1,
  deadlineDay: 10,
  durationDays: 3,
  enemies: [{ monsterId: 'void_hound', grade: 'mid', level: 20, row: 'front' }],
  reward: { zero: 250, arche: 40, materials: {} },
  fog: { deadlineOffset: 1, levelOffset: 2, countOffset: 0, rewardU: 0 },
  territoryFactionId: null,
  ...patch,
});

describe('출발 마감 표기(지시서 015)', () => {
  it('거점·다른 도시 리프트 모두 "늦어도 ○일차까지 출발" = 마감일 − 편도 이동일', () => {
    for (const cityId of tables.cities.map((c) => c.id)) {
      const r = rift({ cityId });
      const d = latestDeparture(tables, fsAt(3), r, 'seoul')!;
      const travel = travelDays(tables, 'seoul', cityId);
      expect(d.travel).toBe(travel);
      expect(d.day).toEqual([10 - travel, 10 - travel]);
    }
  });
  it('엔진 판정과 맞다: 그날까지는 보낼 수 있고 다음 날은 못 보낸다', () => {
    const s0 = newGame(tables, { seed: 'dl', guildName: 'g', baseCityId: 'seoul', protagonist: { mode: 'opener', name: 'p', element: 'fire', role: 'warrior', background: 'soldier' } });
    const r = rift({ cityId: 'newyork', deadlineDay: 6 });
    const last = latestDeparture(tables, fsAt(3), r, 'seoul')!.day[0];
    const party = [{ mercId: 'hero', row: 'front' as const }];
    expect(() => dispatch(tables, { ...s0, day: last, rifts: [r] }, 'X', party)).not.toThrow();
    expect(() => dispatch(tables, { ...s0, day: last + 1, rifts: [r] }, 'X', party)).toThrow(GameError);
  });
  it('탐지소가 낮아 마감이 범위로 보이면 출발일도 범위이고, 실제 출발 마감은 그 안에 있다', () => {
    const r = rift({ cityId: 'newyork' });
    const d = latestDeparture(tables, fsAt(1), r, 'seoul')!;
    const v = visibleRift(tables, fsAt(1), r).deadline!;
    expect(d.day).toEqual([v[0] - d.travel, v[1] - d.travel]);
    expect(10 - d.travel).toBeGreaterThanOrEqual(d.day[0]);
    expect(10 - d.travel).toBeLessThanOrEqual(d.day[1]);
  });
  it('마감 없는 안정화된 통로는 null', () => {
    expect(latestDeparture(tables, fsAt(3), rift({ deadlineDay: null, stable: true }), 'seoul')).toBeNull();
  });
});

describe('파견 하루당 수익', () => {
  it('보이는 승리 제로 ÷ (소요 + 왕복 이동)', () => {
    for (const cityId of ['seoul', 'newyork']) {
      const r = rift({ cityId });
      const days = r.durationDays + travelDays(tables, 'seoul', cityId) * 2;
      expect(expeditionDays(tables, r, 'seoul')).toBe(days);
      const z = visibleRift(tables, fsAt(3), r).victoryReward.zero;
      expect(zeroPerDay(tables, fsAt(3), r, 'seoul')).toEqual([Math.floor(z[0] / days), Math.floor(z[1] / days)]);
    }
  });
  it('범위 표시에서는 숨은 실제 보상이 새지 않는다(보이는 정보가 같으면 결과가 같다)', () => {
    const a = rift({ reward: { zero: 210, arche: 40, materials: {} } });
    const b = rift({ reward: { zero: 315, arche: 40, materials: {} } });
    expect(zeroPerDay(tables, fsAt(1), a, 'seoul')).toEqual(zeroPerDay(tables, fsAt(1), b, 'seoul'));
    // 정확히 보이면 달라진다
    expect(zeroPerDay(tables, fsAt(3), a, 'seoul')).not.toEqual(zeroPerDay(tables, fsAt(3), b, 'seoul'));
  });
});

describe('부상 표기', () => {
  it('회복일이 13일차면 "13일차부터 출전"', () => {
    expect(injuryText({ severity: 'light', recoverDay: 13 })).toBe('경상 · 13일차부터 출전');
  });
});
