import type { ReactNode } from 'react';
import { tables } from '../data';
import { loyaltyDisplay, loyaltyTier } from '../engine/loyalty';
import { elementName, roleName } from './format';

export function ElementTag({ id }: { id: string }) {
  return <span className={`tag el-${id}`}>{elementName(id)}</span>;
}

export function RoleTag({ id }: { id: string }) {
  return <span className="tag role">{roleName(id)}</span>;
}

export function Bar({ value, max, kind = 'hp' }: { value: number; max: number; kind?: 'hp' | 'exp' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const level = ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'warn' : 'bad';
  return (
    <div className={`bar bar-${kind}`} role="meter" aria-valuenow={value} aria-valuemax={max}>
      <div className={`bar-fill ${kind === 'hp' ? level : ''}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function Panel({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="dialog">
        <h2>{props.title}</h2>
        <div className="dialog-body">{props.message}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={props.onCancel}>
            취소
          </button>
          <button className={`btn ${props.danger ? 'danger' : 'primary'}`} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <button className="toast" onClick={onClose}>
      {message}
    </button>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === props.value}
          className={o.value === props.value ? 'on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 흑막 징조 표식. 색만이 아니라 글자로도 구분한다. */
export function OmenBadge() {
  return (
    <span className="tag omen" aria-label="징조 표식">
      <span aria-hidden="true">◈</span> 징조
    </span>
  );
}

/** 충성도 구간 배지. 글자로 구간을 쓰고, 경고 구간은 ⚠를 붙인다. */
export function LoyaltyBadge({ value, showValue = false }: { value: number; showValue?: boolean }) {
  const tier = loyaltyTier(tables, value);
  return (
    <span className={`tag loyalty loyalty-${tier.id}`} aria-label={`충성도 ${tier.name} ${loyaltyDisplay(value)}`}>
      {tier.warn && <span aria-hidden="true">⚠ </span>}충성 {tier.name}
      {showValue && ` ${loyaltyDisplay(value)}`}
    </span>
  );
}

/**
 * 칩 한 줄(012 용병 화면에서 만듦). 같은 축 안에서 하나만 고르고, 다시 누르면 해제(전체).
 * required면 "전체" 칩이 없고 해제되지 않는다(013 도시 칩). 칩마다 배지를 붙일 수 있다.
 */
export function ChipRow<T extends { id: string; name: string; badge?: ReactNode; ariaLabel?: string }>(props: {
  label: string;
  items: T[];
  value: string | null;
  onChange: (v: string | null) => void;
  elementColor?: boolean;
  /** 라벨 줄을 숨기고 aria-label로만 둔다 */
  hideLabel?: boolean;
  required?: boolean;
}) {
  return (
    <>
      {!props.hideLabel && <p className="filter-label">{props.label}</p>}
      <div className="chips scroll" role="group" aria-label={props.label}>
        {!props.required && (
          <button className={`chip small ${props.value === null ? 'on' : ''}`} aria-pressed={props.value === null} onClick={() => props.onChange(null)}>
            전체
          </button>
        )}
        {props.items.map((it) => (
          <button
            key={it.id}
            className={`chip small ${props.elementColor ? `el-${it.id}` : ''} ${props.value === it.id ? 'on' : ''}`}
            aria-pressed={props.value === it.id}
            aria-label={it.ariaLabel}
            onClick={() => props.onChange(props.value === it.id && !props.required ? null : it.id)}
          >
            {it.name}
            {it.badge}
          </button>
        ))}
      </div>
    </>
  );
}
