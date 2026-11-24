import { getRole, type GameTables } from '../data';
import { compositionGroup, elementMultiplier } from './combat';
import { isAvailable, type GameState, type MercenaryState, type PartyMember } from './game';
import { visibleRift } from './facilities';
import type { Rift } from './rift';

/** 리프트에 나오는 몬스터의 실제 속성(몬스터 데이터에서). 화면과 자동 편성은 visibleRift를 쓴다. */
export function riftEnemyElements(tables: GameTables, rift: Rift): string[] {
  const out: string[] = [];
  for (const e of rift.enemies) {
    const el = tables.monsters.find((m) => m.id === e.monsterId)?.element;
    if (el && !out.includes(el)) out.push(el);
  }
  return out;
}

/** 자동 편성 후보 점수: 레벨 + 리프트 몬스터 속성에 대한 평균 상성 점수(가중치는 auto-party.json) */
export function autoPartyScore(tables: GameTables, m: MercenaryState, enemyElements: string[]): number {
  const w = tables.autoParty.weights;
  let element = 0;
  for (const el of enemyElements) {
    const mult = elementMultiplier(tables, m.element, el);
    element += mult > 1 ? w.elementAdvantage : mult < 1 ? w.elementDisadvantage : 0;
  }
  return m.level * w.level + (enemyElements.length ? element / enemyElements.length : 0);
}

/**
 * 자동 편성(순수 함수). 가용 용병(길드 소속, 부상·파견 중 아님)에서 고른다.
 * 1) 구성 분류(전위·딜러·지원) 중 빠진 분류를 점수가 가장 높은 후보로 하나씩 채운다.
 * 2) 남은 자리를 점수 순으로 채운다. 동점은 용병 id 순.
 * 열은 역할의 기본 위치다. 가용 인원이 모자라면 있는 만큼만 넣는다.
 */
export function autoParty(tables: GameTables, state: GameState, rift: Rift): PartyMember[] {
  const cfg = tables.autoParty;
  const max = tables.combat.party.maxSize;
  // 탐지소로 보이는 정보만 쓴다(공개되지 않은 몬스터 속성은 점수에 넣지 않음).
  const enemies = visibleRift(tables, state.facilities, rift).elements ?? [];
  const score = new Map<string, number>();
  const pool = state.mercenaries
    .filter((m) => isAvailable(state, m.id) && getRole(tables, m.role).enabled)
    .map((m) => {
      score.set(m.id, autoPartyScore(tables, m, enemies));
      return m;
    })
    .sort((a, b) => score.get(b.id)! - score.get(a.id)! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const picked: MercenaryState[] = [];
  const take = (m: MercenaryState | undefined) => {
    if (m && picked.length < max && !picked.includes(m)) picked.push(m);
  };
  if (cfg.fillGroupsFirst) {
    for (const group of tables.combat.composition.groups) {
      if (picked.some((m) => compositionGroup(tables, m.role) === group)) continue;
      take(pool.find((m) => !picked.includes(m) && compositionGroup(tables, m.role) === group));
    }
  }
  for (const m of pool) take(m);
  return picked.map((m) => ({ mercId: m.id, row: getRole(tables, m.role).defaultRow }));
}
