// 지시서 016: 화면 용어와 조사
import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { josa, term, termText, withJosa } from './format';

describe('조사', () => {
  it('받침 없는 단어(계약자)와 있는 단어(용병)', () => {
    expect(withJosa('계약자', '을/를')).toBe('계약자를');
    expect(withJosa('계약자', '이/가')).toBe('계약자가');
    expect(withJosa('계약자', '은/는')).toBe('계약자는');
    expect(withJosa('용병', '을/를')).toBe('용병을');
    expect(withJosa('용병', '이/가')).toBe('용병이');
    expect(withJosa('용병', '은/는')).toBe('용병은');
    expect(josa('Arche', '을', '를')).toBe('을(를)');
  });
});

describe('용어 표', () => {
  it('용병은 화면에 "계약자"로 보이고, 표를 바꾸면 문구가 따라간다', () => {
    expect(term.merc).toBe('계약자');
    expect(termText('배치한 {merc:이/가} 매일 경험치를 얻는다.')).toBe('배치한 계약자가 매일 경험치를 얻는다.');
    const before = tables.terms.merc;
    try {
      tables.terms.merc = '용병';
      expect(termText('배치한 {merc:이/가} 매일')).toBe('배치한 용병이 매일');
      expect(termText('{merc} 목록')).toBe('용병 목록');
    } finally {
      tables.terms.merc = before;
    }
  });

  it('역할 표시 이름은 새 이름이고 id는 그대로다', () => {
    const names = Object.fromEntries(tables.roles.map((r) => [r.id, r.name]));
    expect(names).toEqual({ shield: '수호자', warrior: '투사', archer: '저격수', mage: '마도사', healer: '사제', commander: '전술가', assassin: '자객', disruptor: '기만자' });
  });
});
