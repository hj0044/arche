// 지시서 024: 파티 편성 끌기 규칙
import { describe, expect, it } from 'vitest';
import type { PartyMember } from '../engine/game';
import { applyDrop, canDrop, dropKey, keyboardTargets, parseDropKey, type DropRules } from './partyDrag';

const rules = (blocked: Record<string, string> = {}): DropRules => ({
  maxSize: 5,
  maxPerRow: 5,
  rowName: { front: '전열', back: '후열' },
  blockReason: (id) => blocked[id] ?? null,
});
const P = (...xs: [string, 'front' | 'back'][]): PartyMember[] => xs.map(([mercId, row]) => ({ mercId, row }));
const ids = (party: PartyMember[], row: 'front' | 'back') => party.filter((p) => p.row === row).map((p) => p.mercId);

describe('024 놓기 규칙', () => {
  const base = P(['a', 'front'], ['b', 'front'], ['c', 'back']);

  it('빈 칸: 편성된 계약자는 그 열의 맨 뒤로, 대기 계약자는 새로 편성', () => {
    const moved = applyDrop(base, { from: 'slot', mercId: 'a' }, { kind: 'empty', row: 'back' }, rules());
    expect(moved.ok && moved.action).toBe('move');
    expect(ids(moved.party, 'front')).toEqual(['b']);
    expect(ids(moved.party, 'back')).toEqual(['c', 'a']);
    const sameRow = applyDrop(base, { from: 'slot', mercId: 'a' }, { kind: 'empty', row: 'front' }, rules());
    expect(ids(sameRow.party, 'front')).toEqual(['b', 'a']);
    const added = applyDrop(base, { from: 'bench', mercId: 'd' }, { kind: 'empty', row: 'back' }, rules());
    expect(added.ok && added.action).toBe('add');
    expect(ids(added.party, 'back')).toEqual(['c', 'd']);
  });

  it('열이 꽉 차면 놓을 수 없고 이유를 돌려준다(열당 5명)', () => {
    const full = P(['a', 'front'], ['b', 'front'], ['c', 'front'], ['d', 'front'], ['e', 'front']);
    const r = applyDrop(full, { from: 'slot', mercId: 'e' }, { kind: 'empty', row: 'back' }, { ...rules(), maxSize: 10 });
    expect(r.ok).toBe(true);
    const into = applyDrop(P(['a', 'back'], ...full.slice(0, 4).map((p) => [p.mercId, 'front'] as [string, 'front']), ['x', 'front']), { from: 'slot', mercId: 'a' }, { kind: 'empty', row: 'front' }, rules());
    expect(into.ok).toBe(false);
    if (!into.ok) expect(into.error).toBe('전열은 5명까지');
    expect(canDrop(into.party, { from: 'slot', mercId: 'a' }, { kind: 'empty', row: 'front' }, rules())).toBe(false);
  });

  it('5명이 차면 대기 계약자를 빈 칸에 더 넣을 수 없다(5+5 한도와 최대 인원)', () => {
    const five = P(['a', 'front'], ['b', 'front'], ['c', 'back'], ['d', 'back'], ['e', 'back']);
    const r = applyDrop(five, { from: 'bench', mercId: 'f' }, { kind: 'empty', row: 'front' }, rules());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('파티는 최대 5명');
    // 같은 열 안 교체·다른 열 이동은 인원이 그대로라 된다
    expect(applyDrop(five, { from: 'slot', mercId: 'a' }, { kind: 'empty', row: 'back' }, rules()).ok).toBe(true);
  });

  it('채워진 칸: 같은 열이면 순서만, 다른 열이면 열이 서로 바뀐다', () => {
    const same = applyDrop(base, { from: 'slot', mercId: 'a' }, { kind: 'filled', mercId: 'b' }, rules());
    expect(same.ok && same.action).toBe('swap');
    expect(ids(same.party, 'front')).toEqual(['b', 'a']);
    const cross = applyDrop(base, { from: 'slot', mercId: 'a' }, { kind: 'filled', mercId: 'c' }, rules());
    expect(ids(cross.party, 'front')).toEqual(['c', 'b']);
    expect(ids(cross.party, 'back')).toEqual(['a']);
    expect(cross.party).toHaveLength(3);
  });

  it('대기 계약자를 채워진 칸에 놓으면 그 칸의 계약자가 해제되고 같은 자리에 들어온다', () => {
    const r = applyDrop(base, { from: 'bench', mercId: 'd' }, { kind: 'filled', mercId: 'b' }, rules());
    expect(r.ok && r.action).toBe('replace');
    if (r.ok) expect(r.removed).toBe('b');
    expect(ids(r.party, 'front')).toEqual(['a', 'd']);
  });

  it('대기 목록에 놓으면 편성된 계약자는 해제, 대기 계약자는 아무 일 없음', () => {
    const r = applyDrop(base, { from: 'slot', mercId: 'c' }, { kind: 'bench' }, rules());
    expect(r.ok && r.action).toBe('remove');
    expect(r.party.map((p) => p.mercId)).toEqual(['a', 'b']);
    const n = applyDrop(base, { from: 'bench', mercId: 'd' }, { kind: 'bench' }, rules());
    expect(n.ok && n.action).toBe('none');
    expect(canDrop(base, { from: 'bench', mercId: 'd' }, { kind: 'bench' }, rules())).toBe(false);
  });

  it('출전 불가 계약자는 끌어 놓을 수 없다', () => {
    const r = applyDrop(base, { from: 'bench', mercId: 'd' }, { kind: 'empty', row: 'back' }, rules({ d: '부상 중' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('부상 중');
    expect(r.party).toBe(base);
  });

  it('해제 후 다시 편성할 수 있고, 같은 계약자가 두 번 들어가지 않는다', () => {
    let party = applyDrop(base, { from: 'slot', mercId: 'a' }, { kind: 'bench' }, rules()).party;
    party = applyDrop(party, { from: 'bench', mercId: 'a' }, { kind: 'empty', row: 'back' }, rules()).party;
    expect(party.map((p) => p.mercId).sort()).toEqual(['a', 'b', 'c']);
    // 이미 편성된 계약자를 빈 칸에 놓으면 이동일 뿐 중복되지 않는다
    for (const t of [{ kind: 'empty', row: 'front' }, { kind: 'empty', row: 'back' }, { kind: 'filled', mercId: 'b' }] as const) {
      const r = applyDrop(party, { from: 'slot', mercId: 'a' }, t, rules());
      expect(new Set(r.party.map((p) => p.mercId)).size).toBe(r.party.length);
    }
  });

  it('밖에 놓으면(대상 없음) 그대로', () => {
    const r = applyDrop(base, { from: 'slot', mercId: 'a' }, null, rules());
    expect(r.ok && r.action).toBe('none');
    expect(r.party).toBe(base);
  });
});

describe('024 키보드·속성', () => {
  it('키보드 칸 순서: 전열 칸 → 전열 빈 칸 하나 → 후열 → 대기 목록', () => {
    const t = keyboardTargets(P(['a', 'front'], ['c', 'back']), rules());
    expect(t.map(dropKey)).toEqual(['filled:a', 'empty:front', 'filled:c', 'empty:back', 'bench']);
  });
  it('data-drop 값 왕복', () => {
    for (const k of ['bench', 'empty:front', 'empty:back', 'filled:m01']) expect(dropKey(parseDropKey(k)!)).toBe(k);
    expect(parseDropKey('x')).toBeNull();
  });
});
