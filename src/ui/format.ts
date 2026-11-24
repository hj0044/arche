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
/** 홈 '최근 보고' 카드의 결과 글자(시안 Main) */
export const reportOutcomeName: Record<Outcome, string> = { victory: '성공', retreat: '철수', defeat: '실패' };
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
  idleDecay: '대기 하락',
  salaryBonus: '급료 보너스',
};

/** 리프트 영역 세력 표시(지시서 013). 없으면 "영역 미정" */
export const territoryLabel = (factionId: string | null | undefined) => (factionId ? `${factionName(factionId)} 영역` : '영역 미정');

/** 받침이 있으면 a, 없으면 b(을/를, 이/가). 한글이 아니면 a(b) 형태 */
export function josa(word: string, a: string, b: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${a}(${b})`;
  return code % 28 ? a : b;
}

/** 부상 표기(지시서 015): 남은 일수 대신 출전할 수 있게 되는 날. "경상 · 13일차부터 출전" */
export const injuryText = (injury: { severity: string; recoverDay: number }) => `${severityName(injury.severity)} · ${injury.recoverDay}일차부터 출전`;

/** 스탯 표시 이름(stats.json) */
export const statName = (id: string) => tables.stats.stats.find((s) => s.id === id)?.name ?? id;
/** 스탯 여러 개를 "물리공격·에너지공격"처럼 */
export const statsLabel = (ids: readonly string[] | undefined) => (ids ?? []).map(statName).join('·');
/** 스탯 값 표시: 비율은 %, 배율은 ×, 나머지는 반올림 정수 */
export function statValue(id: string, v: number): string {
  const fmt = tables.stats.stats.find((s) => s.id === id)?.format;
  if (fmt === 'percent') return `${Math.round(v * 1000) / 10}%`;
  if (fmt === 'multiplier') return `×${Math.round(v * 100) / 100}`;
  return num(Math.round(v));
}

/** 화면 용어(terms.json). 용병은 화면에 "계약자"로 보인다(지시서 016) */
export const term = tables.terms;
/** 단어 + 조사. pair는 "을/를", "이/가", "은/는", "과/와"처럼 받침 있을 때/없을 때 순서 */
export function withJosa(word: string, pair: string): string {
  const [a, b] = pair.split('/');
  return word + josa(word, a, b);
}
/** 데이터 문구의 {merc} 자리에 용어를 넣는다(조사 포함 형태 {merc:이/가}도 가능) */
export function termText(text: string): string {
  return text.replace(/\{merc(?::([^}]+))?\}/g, (_, pair?: string) => (pair ? withJosa(term.merc, pair) : term.merc));
}

/** 특성 이름(traits.json) */
export const traitName = (id: string) => tables.traits.traits.find((t) => t.id === id)?.name ?? id;
/** 특성 종류 이름 */
export const traitCategoryName: Record<string, string> = { common: '공통', role: '역할', background: '배경', race: '종족', element: '속성', unique: '고유' };

/** 카드용 짧은 이름(roster.json shortName, 지시서 017b). 명단에 없으면(주인공 등) 이름 그대로 */
export const cardName = (m: { id: string; name: string }) => tables.roster.find((r) => r.id === m.id)?.shortName ?? m.name;
