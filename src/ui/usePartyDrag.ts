/**
 * 파티 편성 끌기(지시서 024): 길게 눌러(pointer, 터치·마우스 같음) 끌고, 놓는 곳은 data-drop 속성으로 찾는다.
 * 놓기 규칙은 partyDrag.ts(순수 함수). 키보드: 끌 수 있는 카드에서 방향키로 놓을 칸을 고르고 Enter로 놓기, Esc로 취소.
 * 새 라이브러리 없이 포인터 이벤트만 쓴다.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { tables } from '../data';
import { keyboardTargets, parseDropKey, type DragSource, type DropRules, type DropTarget } from './partyDrag';
import type { PartyMember } from '../engine/game';

export interface DragState {
  src: DragSource;
  /** 끄는 사본의 왼쪽 위(화면 좌표). 키보드 끌기면 null */
  ghost: { x: number; y: number } | null;
  over: DropTarget | null;
  /** 키보드 끌기의 칸 위치 */
  kbdIndex?: number;
}

export function usePartyDrag(party: PartyMember[], rules: DropRules, onDrop: (src: DragSource, target: DropTarget | null) => void, initial: DragState | null = null) {
  const cfg = tables.ui.partyDrag;
  const [drag, setDrag] = useState<DragState | null>(initial);
  const dragRef = useRef<DragState | null>(initial);
  dragRef.current = drag;
  const pending = useRef<{ src: DragSource; x0: number; y0: number; offX: number; offY: number; timer: number } | null>(null);
  const suppressUntil = useRef(0);

  const targetAt = (x: number, y: number): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return parseDropKey(el?.closest('[data-drop]')?.getAttribute('data-drop'));
  };
  const finish = (target: DropTarget | null, commit: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    dragRef.current = null;
    suppressUntil.current = Date.now() + cfg.clickSuppressMs;
    if (d && commit) onDrop(d.src, target);
  };

  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const p = pending.current;
      if (p && !dragRef.current) {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > cfg.moveCancelPx) {
          window.clearTimeout(p.timer);
          pending.current = null;
        }
        return;
      }
      const d = dragRef.current;
      if (!d?.ghost || !p) return;
      setDrag({ ...d, ghost: { x: e.clientX - p.offX, y: e.clientY - p.offY }, over: targetAt(e.clientX, e.clientY) });
    };
    const up = (e: globalThis.PointerEvent) => {
      const p = pending.current;
      if (p) window.clearTimeout(p.timer);
      pending.current = null;
      if (dragRef.current?.ghost) finish(targetAt(e.clientX, e.clientY), true);
    };
    const cancel = () => {
      const p = pending.current;
      if (p) window.clearTimeout(p.timer);
      pending.current = null;
      if (dragRef.current) finish(null, false);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) cancel();
    };
    // 끌기 중에는 페이지 스크롤을 막는다(passive가 아니어야 막힌다)
    const touch = (e: TouchEvent) => {
      if (dragRef.current?.ghost) e.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', touch, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', touch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 끌 수 있는 카드에 붙이는 속성 */
  const bind = (src: DragSource, enabled: boolean) =>
    enabled
      ? {
          onPointerDown: (e: PointerEvent<HTMLElement>) => {
            if (e.button !== 0 || dragRef.current) return;
            const r = e.currentTarget.getBoundingClientRect();
            const offX = e.clientX - r.left;
            const offY = e.clientY - r.top;
            const x0 = e.clientX;
            const y0 = e.clientY;
            const timer = window.setTimeout(() => {
              const next: DragState = { src, ghost: { x: x0 - offX, y: y0 - offY }, over: targetAt(x0, y0) };
              dragRef.current = next;
              setDrag(next);
            }, cfg.longPressMs);
            pending.current = { src, x0, y0, offX, offY, timer };
          },
          onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
          onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
            const d = dragRef.current;
            const targets = keyboardTargets(party, rules);
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (step) {
              e.preventDefault();
              const i = d && d.kbdIndex !== undefined ? (d.kbdIndex + step + targets.length) % targets.length : 0;
              setDrag({ src: d?.src ?? src, ghost: null, over: targets[i], kbdIndex: i });
              return;
            }
            if ((e.key === 'Enter' || e.key === ' ') && d && d.kbdIndex !== undefined) {
              e.preventDefault();
              finish(d.over, true);
            }
          },
        }
      : {};

  /** 끌기를 끝낸 직후의 클릭이면 무시 */
  const clickAllowed = () => Date.now() > suppressUntil.current && !dragRef.current;

  return { drag, bind, clickAllowed };
}
