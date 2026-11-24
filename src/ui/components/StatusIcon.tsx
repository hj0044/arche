// 상태 효과 아이콘(지시서 020, 시안 Help·HelpSheet·Battle·MercDetail). 모양은 시안 그대로, 색은 theme.css --status-<id>.
// 새 상태 효과가 늘면 statusEffects.json 행과 이 표의 무늬 하나를 더한다.
import type { ReactNode } from 'react';
import { tables } from '../../data';

const GLYPH: Record<string, ReactNode> = {
  stun: <path d="M12 4l2.2 5.1 5.5.5-4.2 3.6 1.3 5.4L12 15.8 7.2 18.6l1.3-5.4L4.3 9.6l5.5-.5z" fill="var(--status-stun-ink)" />,
  dot: <path d="M12 4c3 4 5 6.5 5 9.5a5 5 0 01-10 0C7 10.5 9 8 12 4z" fill="var(--status-dot-ink)" />,
  shield: <path d="M12 4l7 2.5v5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5v-5z" fill="var(--status-shield-ink)" />,
  mark: (
    <>
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--status-mark-ink)" strokeWidth="2" />
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="var(--status-mark-ink)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  weaken: <path d="M12 5v11M7 12l5 6 5-6" fill="none" stroke="var(--status-weaken-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
};

/** 상태 효과 id(statusEffects.json의 id 또는 kind)의 행 */
export const statusRow = (idOrKind: string) => tables.statusEffects.effects.find((e) => e.id === idOrKind || e.kind === idOrKind);

export function StatusIcon({ id, size = 16, style }: { id: string; size?: number; style?: React.CSSProperties }) {
  const row = statusRow(id);
  const key = row?.id ?? id;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={row?.name ?? id}
      data-status={key}
      className="status-icon"
      style={{ background: `var(--status-${key}, var(--c-line-dim))`, ...style }}
    >
      {GLYPH[key]}
    </svg>
  );
}

/** 설명 글에서 상태 효과 이름 앞에 작은 아이콘(14px)을 넣는다(시안 MercDetail 스킬 행). 끝의 마침표는 뗀다 */
export function TextWithStatus({ text }: { text: string }) {
  const body = text.replace(/\.$/, '');
  const names = [...tables.statusEffects.effects].sort((a, b) => b.name.length - a.name.length);
  const parts: ReactNode[] = [];
  let rest = body;
  let key = 0;
  while (rest) {
    let hit: { i: number; id: string; name: string } | null = null;
    for (const e of names) {
      const i = rest.indexOf(e.name);
      if (i >= 0 && (!hit || i < hit.i)) hit = { i, id: e.id, name: e.name };
    }
    if (!hit) {
      parts.push(rest);
      break;
    }
    if (hit.i > 0) parts.push(rest.slice(0, hit.i));
    parts.push(
      <span key={key++} className="status-inline">
        <StatusIcon id={hit.id} size={14} /> {hit.name}
      </span>,
    );
    rest = rest.slice(hit.i + hit.name.length);
  }
  return <>{parts}</>;
}
