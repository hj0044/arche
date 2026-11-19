import type { GameTables } from '../data';
import type { CombatSlot } from './combat';
import { createMercenary, createMonster } from './unit';

/** 엔진 확인용 샘플 파티(용병 5인). 실제 로스터는 M6에서 데이터 표로 만든다. */
export function sampleParty(tables: GameTables, level = 5): CombatSlot[] {
  const m = (id: string, name: string, element: string, role: string) =>
    createMercenary(tables, { id, name, element, role, level });
  return [
    { unit: m('m_shield', '한도윤', 'frost', 'shield'), row: 'front' },
    { unit: m('m_warrior', '서지호', 'fire', 'warrior'), row: 'front' },
    { unit: m('m_archer', '유하린', 'lightning', 'archer'), row: 'back' },
    { unit: m('m_mage', '백서연', 'light', 'mage'), row: 'back' },
    { unit: m('m_healer', '정예린', 'light', 'healer'), row: 'back' },
  ];
}

/** 흑막 쪽 샘플 몬스터 무리(공허 속성). */
export function sampleMonsters(tables: GameTables, level = 5, grade = 'mid'): CombatSlot[] {
  const mon = (id: string, name: string, role: string) =>
    createMonster(tables, { id, name, element: 'void', role, grade, level });
  return [
    { unit: mon('x_brute', '공허 짐승', 'warrior'), row: 'front' },
    { unit: mon('x_husk', '껍데기 수호자', 'shield'), row: 'front' },
    { unit: mon('x_spitter', '잠식 포자', 'archer'), row: 'back' },
    { unit: mon('x_caller', '균열 술사', 'mage'), row: 'back' },
  ];
}
