import {
  getCity,
  getElement,
  getMaterial,
  getMonster,
  getMonsterGrade,
  getRiftTier,
  getRole,
  getSkill,
  tables,
  type Outcome,
} from '../data';

// 화면 표기. 속성은 표기명(화염, 냉기 등)을 쓴다.
export const elementName = (id: string) => getElement(tables, id).name;
export const roleName = (id: string) => getRole(tables, id).name;
export const tierName = (id: string) => getRiftTier(tables, id).name;
export const gradeName = (id: string) => getMonsterGrade(tables, id).name;
export const cityName = (id: string) => getCity(tables, id).name;
export const monsterName = (id: string) => getMonster(tables, id).name;
export const skillName = (id: string) => getSkill(tables, id).name;
export const materialName = (id: string) => getMaterial(tables, id).name;
export const backgroundName = (id: string) => tables.backgrounds.find((b) => b.id === id)?.name ?? id;
/** 용병 프로필용 짧은 배경 이름(군인, 연구원 등) */
export const backgroundShort = (id: string) => tables.backgrounds.find((b) => b.id === id)?.shortName ?? id;
export const growthSpeedName = (id: string) => tables.growthSpeeds.find((g) => g.id === id)?.name ?? id;
export const worldName = (id: string) => tables.worlds.find((w) => w.id === id)?.name ?? id;
export const severityName = (id: string) => tables.injuries.severities.find((s) => s.id === id)?.name ?? id;
export const factionName = (id: string) => tables.factions.find((f) => f.id === id)?.name ?? id;

export const outcomeName: Record<Outcome, string> = { victory: '승리', retreat: '철수', defeat: '패배' };
export const rowName = { front: '전열', back: '후열' } as const;

export const pct = (ratio: number) => `${ratio >= 0 ? '+' : ''}${Math.round(ratio * 100)}%`;
export const num = (n: number) => n.toLocaleString('ko-KR');

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 징조 표식 문구. 데이터에 없는 id면 빈 문자열 */
export const omenText = (id: string) => tables.omens.find((o) => o.id === id)?.text ?? '';

export const loyaltyTierName = (id: string) => tables.loyalty.tiers.find((t) => t.id === id)?.name ?? id;
export const loyaltyReasonName: Record<string, string> = {
  victory: '파견 승리',
  defeat: '파견 패배',
  injury: '부상',
  unpaidDay: '유지비 미납',
  restDay: '길드에서 휴식',
  salaryBonus: '급료 보너스',
};
