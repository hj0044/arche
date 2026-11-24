// npm run days와 npm run loyalty-sweep이 함께 쓰는 자동 플레이 정책(정책 값은 src/data/autoplay.json).
// 하루: 훈련 배치 해제 → (시설 우선이면) 시설 건설·강화 → 영입 → 파견 → 남은 가용 용병 훈련 배치 → 레벨업 → 하루 넘기기.
import { getRiftTier, type GameTables } from '../src/data';
import { facilitySlots, levelCost, facilityLevel } from '../src/engine/facilities';
import {
  advanceDay,
  assignToFacility,
  canLevelUp,
  constructionBlockReason,
  dispatch,
  isAvailable,
  levelUp,
  recruit,
  recruitInfo,
  riftLevel,
  startConstruction,
  unassignFromFacility,
  type DayEvent,
  type GameState,
} from '../src/engine/game';

export function autoplayDay(t: GameTables, start: GameState, log: (line: string) => void = () => {}): { state: GameState; events: DayEvent[] } {
  let s = start;
  const policy = t.autoplay;
  // 1) 전날 훈련 배치는 모두 풀고 다시 정한다(파견을 먼저 고려하기 위해)
  for (const [fid, ids] of Object.entries(s.facilities.assignments)) for (const id of ids) s = unassignFromFacility(s, fid, id);

  const build = () => {
    for (const id of policy.facilityOrder) {
      if (constructionBlockReason(t, s, id)) continue;
      const cost = levelCost(t, id, facilityLevel(s.facilities, id) + 1).zero;
      if (s.resources.zero < cost + policy.facilityReserveZero) continue;
      s = startConstruction(t, s, id);
      log(`${s.day}일 건설: ${t.facilities.facilities.find((f) => f.id === id)!.name} Lv${facilityLevel(s.facilities, id) + 1} (제로 ${cost})`);
      break;
    }
  };
  const hire = () => {
    for (const m of s.mercenaries) {
      const info = recruitInfo(t, s, m.id);
      if (info.eligible && info.unlocked && s.resources.zero >= info.cost + policy.recruitReserveZero) s = recruit(t, s, m.id);
    }
  };
  if (policy.facilitiesBeforeRecruit) {
    build();
    hire();
  } else {
    hire();
    build();
  }

  // 2) 3명 이상 모이면 거점 도시에서 몬스터 레벨이 가장 낮은 리프트로 최대 5명
  const rowOf = (role: string) => t.roles.find((r) => r.id === role)!.defaultRow;
  const free = s.mercenaries.filter((m) => isAvailable(s, m.id));
  const target = s.rifts.filter((r) => r.cityId === s.baseCityId).sort((a, b) => riftLevel(a) - riftLevel(b))[0];
  if (free.length >= Math.min(3, s.mercenaries.filter((m) => m.affiliation.kind === 'guild').length) && target) {
    s = dispatch(t, s, target.id, free.slice(0, 5).map((m) => ({ mercId: m.id, row: rowOf(m.role) })));
    log(`${s.day}일 출발: ${target.name}(${getRiftTier(t, target.tier).name}, Lv${riftLevel(target)}) ← ${free.slice(0, 5).map((m) => m.name).join(' ')}`);
  }

  // 3) 남은 가용 계약자를 배치형 시설 칸에 넣는다
  if (policy.assignIdleToTraining) {
    for (const f of t.facilities.facilities) {
      let room = facilitySlots(t, s.facilities, f.id) - (s.facilities.assignments[f.id] ?? []).length;
      for (const m of s.mercenaries) {
        if (room <= 0) break;
        if (!isAvailable(s, m.id)) continue;
        s = assignToFacility(t, s, f.id, m.id);
        room--;
      }
    }
  }

  for (const m of s.mercenaries) while (canLevelUp(t, s, m.id)) s = levelUp(t, s, m.id);
  return advanceDay(t, s);
}
