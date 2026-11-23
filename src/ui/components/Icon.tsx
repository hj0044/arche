/**
 * 인라인 SVG 아이콘 모음(지시서 017 C). UI 1차 시안의 아이콘을 그대로 옮겼다. 색은 currentColor 또는 테마 변수.
 */
import type { CSSProperties } from 'react';

export type IconName =
  | 'logo'
  | 'gear'
  | 'back'
  | 'home'
  | 'compass'
  | 'users'
  | 'base'
  | 'clock'
  | 'arrowUp'
  | 'heart'
  | 'plus'
  | 'search'
  | 'lock'
  | 'check'
  | 'zero'
  | 'arche'
  | 'material'
  | 'rift';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function Icon({ name, size, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  const common = { 'aria-hidden': true, style, className } as const;
  switch (name) {
    case 'logo':
      return (
        <svg width={size ?? 30} height={size ?? 30} viewBox="0 0 32 32" {...common}>
          <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="var(--c-panel-2)" stroke="var(--c-gold)" strokeWidth="1.8" />
          <path d="M17 6 L12 15 L18 18 L13 27" stroke="var(--c-gold)" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
        </svg>
      );
    case 'gear':
      return (
        <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 24 24" {...stroke} {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </svg>
      );
    case 'back':
      return (
        <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case 'home':
      return (
        <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M4 11l8-7 8 7v9H4z" />
        </svg>
      );
    case 'compass':
      return (
        <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" {...stroke} {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </svg>
      );
    case 'users':
      return (
        <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" {...stroke} {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 14c2 .6 3 2.2 3 5" />
        </svg>
      );
    case 'base':
      return (
        <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M4 20V9l4-2 4 2 4-2 4 2v11zM9 20v-5h6v5" />
        </svg>
      );
    case 'clock':
      return (
        <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" {...stroke} {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'arrowUp':
      return (
        <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      );
    case 'heart':
      return (
        <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z" />
        </svg>
      );
    case 'plus':
      return (
        <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" {...stroke} {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'search':
      return (
        <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 24 24" {...stroke} {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case 'lock':
      return (
        <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      );
    case 'check':
      return (
        <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...common}>
          <path d="M5 12l5 5 9-10" />
        </svg>
      );
    case 'zero':
      return (
        <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 20 20" {...common}>
          <circle cx="10" cy="10" r="9" fill="var(--c-gold)" />
          <circle cx="10" cy="10" r="5.5" fill="none" stroke="var(--c-gold-dark)" strokeWidth="1.5" />
        </svg>
      );
    case 'arche':
      return (
        <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 20 20" {...common}>
          <polygon points="10,1 18,9 10,19 2,9" fill="var(--c-info)" />
          <polygon points="10,1 18,9 10,9" fill="var(--c-arche-light)" />
        </svg>
      );
    case 'material':
      return (
        <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 20 20" {...common}>
          <polygon points="10,1 18,6 18,14 10,19 2,14 2,6" fill="var(--el-earth)" />
          <polygon points="10,1 18,6 10,10 2,6" fill="var(--c-material-light)" />
        </svg>
      );
    case 'rift':
      return (
        <svg width={size ?? 36} height={size ?? 36} viewBox="0 0 40 40" {...common}>
          <path d="M24 5 L16 17 L26 23 L14 38" stroke="var(--trait-common)" strokeWidth="3.2" fill="none" strokeLinejoin="round" />
        </svg>
      );
  }
}
