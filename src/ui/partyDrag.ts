/**
 * 파티 편성 끌기 규칙(지시서 024). React에 의존하지 않는 순수 함수라 단위 테스트한다.
 * 파티는 배열이고 열 안의 순서 = 배열 순서다. 빈 칸 위치는 저장하지 않는다(빈 칸에 놓으면 그 열의 맨 뒤).
 * 엔진의 편성 규칙(최대 인원, 열당 인원)은 그대로 쓰고 바꾸지 않는다.
 */
import type { Row } from '../data';
import type { PartyMember } from '../engine/game';

/** 끄는 대상: 편성된 칸의 계약자 또는 대기 목록의 계약자 */
export type DragSource = { from: 'slot' | 'bench'; mercId: string };
/** 놓는 곳: 빈 칸(열), 채워진 칸(그 칸의 계약자), 대기 목록 구역 */
export type DropTarget = { kind: 'empty'; row: Row } | { kind: 'filled'; mercId: string } | { kind: 'bench' };

export type DropResult =
  | { ok: true; party: PartyMember[]; action: 'add' | 'move' | 'swap' | 'replace' | 'remove' | 'none'; removed?: string }
  | { ok: false; party: PartyMember[]; error: string };

export interface DropRules {
  maxSize: number;
  maxPerRow: number;
  /** 열 이름(토스트용) */
  rowName: Record<Row, string>;
  /** 출전 불가면 이유(끌 수 없음), 가능하면 null */
  blockReason: (mercId: string) => string | null;
}

const rowCount = (party: PartyMember[], row: Row) => party.filter((p) => p.row === row).length;

/** 놓았을 때의 새 파티. 실패하면 원래 파티와 이유(토스트) */
export function applyDrop(party: PartyMember[], src: DragSource, target: DropTarget | null, rules: DropRules): DropResult {
  const none = (): DropResult => ({ ok: true, party, action: 'none' });
  const fail = (error: string): DropResult => ({ ok: false, party, error });
  if (!target) return none();
  const inParty = party.find((p) => p.mercId === src.mercId);
  if (!inParty) {
    const why = rules.blockReason(src.mercId);
    if (why) return fail(why);
  }
  switch (target.kind) {
    case 'bench':
      // 편성된 계약자를 대기 목록에 놓으면 해제, 대기 계약자는 아무 일 없음
      return inParty ? { ok: true, party: party.filter((p) => p.mercId !== src.mercId), action: 'remove', removed: src.mercId } : none();
    case 'empty': {
      const { row } = target;
      if (inParty) {
        // 다른 열로 옮길 때만 그 열 인원을 본다. 같은 열이면 맨 뒤로
        if (inParty.row !== row && rowCount(party, row) >= rules.maxPerRow) return fail(`${rules.rowName[row]}은 ${rules.maxPerRow}명까지`);
        return { ok: true, party: [...party.filter((p) => p.mercId !== src.mercId), { mercId: src.mercId, row }], action: 'move' };
      }
      if (party.length >= rules.maxSize) return fail(`파티는 최대 ${rules.maxSize}명`);
      if (rowCount(party, row) >= rules.maxPerRow) return fail(`${rules.rowName[row]}은 ${rules.maxPerRow}명까지`);
      return { ok: true, party: [...party, { mercId: src.mercId, row }], action: 'add' };
    }
    case 'filled': {
      if (target.mercId === src.mercId) return none();
      const ti = party.findIndex((p) => p.mercId === target.mercId);
      if (ti < 0) return none();
      if (inParty) {
        // 자리 교체: 두 칸의 계약자를 맞바꾼다(같은 열이면 순서, 다른 열이면 열이 바뀐다)
        const si = party.indexOf(inParty);
        const next = party.map((p) => ({ ...p }));
        next[si] = { mercId: party[ti].mercId, row: party[si].row };
        next[ti] = { mercId: party[si].mercId, row: party[ti].row };
        return { ok: true, party: next, action: 'swap' };
      }
      // 대기 계약자를 채워진 칸에: 그 칸의 계약자는 해제, 같은 자리(열 유지)에 들어온다
      const next = party.map((p, i) => (i === ti ? { mercId: src.mercId, row: p.row } : p));
      return { ok: true, party: next, action: 'replace', removed: target.mercId };
    }
  }
}

/** 놓을 수 있는가(강조 표시용). 바뀌는 것이 없는 곳(같은 자리, 대기 계약자를 대기 목록에)은 false */
export function canDrop(party: PartyMember[], src: DragSource, target: DropTarget | null, rules: DropRules): boolean {
  const r = applyDrop(party, src, target, rules);
  return r.ok && r.action !== 'none';
}

/** 키보드 끌기의 칸 순서(전열 칸 → 후열 칸 → 대기 목록). 빈 칸은 열마다 하나(맨 뒤에 붙으므로) */
export function keyboardTargets(party: PartyMember[], rules: DropRules): DropTarget[] {
  const out: DropTarget[] = [];
  for (const row of ['front', 'back'] as Row[]) {
    for (const p of party.filter((x) => x.row === row)) out.push({ kind: 'filled', mercId: p.mercId });
    if (rowCount(party, row) < rules.maxPerRow) out.push({ kind: 'empty', row });
  }
  out.push({ kind: 'bench' });
  return out;
}

/** data-drop 속성 값 ↔ 놓는 곳 */
export const dropKey = (t: DropTarget): string => (t.kind === 'empty' ? `empty:${t.row}` : t.kind === 'filled' ? `filled:${t.mercId}` : 'bench');
export function parseDropKey(key: string | null | undefined): DropTarget | null {
  if (!key) return null;
  if (key === 'bench') return { kind: 'bench' };
  const [kind, v] = key.split(':');
  if (kind === 'empty' && (v === 'front' || v === 'back')) return { kind: 'empty', row: v };
  if (kind === 'filled' && v) return { kind: 'filled', mercId: v };
  return null;
}
