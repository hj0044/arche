import type { ReactNode } from 'react';
import { elementName, roleName } from './format';

export function ElementTag({ id }: { id: string }) {
  return <span className={`tag el-${id}`}>{elementName(id)}</span>;
}

export function RoleTag({ id }: { id: string }) {
  return <span className="tag role">{roleName(id)}</span>;
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
