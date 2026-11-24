// 전투 로그 한 줄 문구(지시서 020). 시뮬레이션 출력과 재생 화면이 같이 쓴다.
import type { GameTables } from '../data';
import type { CombatEffect, CombatEvent, StatusType } from './combat';

/** 상태 이름: 상태 효과 5종은 statusEffects.json의 이름, 도발·강화는 고정 */
export function statusName(tables: GameTables, type: StatusType): string {
  if (type === 'taunt') return '도발';
  if (type === 'buff') return '강화';
  return tables.statusEffects.effects.find((e) => e.kind === type)?.name ?? type;
}

const statLabel = (tables: GameTables, ids: readonly string[] | undefined) =>
  (ids ?? []).map((id) => tables.stats.stats.find((s) => s.id === id)?.name ?? id).join('·');

/** 행동 결과 하나의 문구. 빈 문자열이면 보이지 않는다 */
export function effectText(tables: GameTables, e: CombatEffect, nameOf: (key: string) => string): string {
  const t = nameOf(e.target);
  switch (e.kind) {
    case 'damage':
      if (e.evaded) return `${t} 회피`;
      return `${t}에게 ${e.amount} 피해${e.crit ? '(치명타)' : ''}${e.absorbed ? `(보호막 ${e.absorbed} 흡수)` : ''}${e.downed ? ', 쓰러짐' : ''}`;
    case 'heal':
      return e.amount > 0 ? `${t} ${e.amount} 회복` : '';
    case 'cleanse':
      return `${t} ${e.removed.map((s) => statusName(tables, s)).join('·')} 해제`;
    case 'status':
      if (e.immune) return `${t} 기절 면역`;
      if (e.status === 'taunt') return `${t} 도발`;
      if (e.status === 'buff') return `${t} ${statLabel(tables, e.stats)} 상승`;
      if (e.status === 'shield') return `${t} 보호막 ${e.value ?? 0}`;
      return `${t} ${statusName(tables, e.status)} ${e.duration}라운드`;
  }
}

/** 행동이 아닌 사건(기절로 건너뜀, 지속 피해, 상태 만료)의 문구. 해당 없으면 null */
export function eventText(tables: GameTables, ev: CombatEvent, nameOf: (key: string) => string): string | null {
  switch (ev.type) {
    case 'skip':
      return `${nameOf(ev.actor)} 기절, 행동 건너뜀`;
    case 'tick':
      return `${nameOf(ev.target)} 지속 피해 ${ev.amount}${ev.absorbed ? `(보호막 ${ev.absorbed} 흡수)` : ''}${ev.downed ? ', 쓰러짐' : ''}`;
    case 'expire':
      return `${nameOf(ev.target)} ${statusName(tables, ev.status)} 풀림`;
    default:
      return null;
  }
}
