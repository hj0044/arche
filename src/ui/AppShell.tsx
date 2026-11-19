import type { ReactNode } from 'react';

interface AppShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** 세로 모바일(390×844 기준) 화면 틀: 상단 제목, 스크롤되는 본문, 엄지가 닿는 하단 영역. */
export function AppShell({ title, subtitle, onBack, headerRight, children, footer }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        {onBack && (
          <button className="back" onClick={onBack} aria-label="뒤로">
            ‹
          </button>
        )}
        <div className="shell-title">
          <h1>{title}</h1>
          {subtitle && <p className="shell-subtitle">{subtitle}</p>}
        </div>
        {headerRight}
      </header>
      <main className="shell-body">{children}</main>
      {footer && <footer className="shell-footer">{footer}</footer>}
    </div>
  );
}
