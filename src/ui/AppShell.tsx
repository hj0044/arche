import type { ReactNode } from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** 세로 모바일(390×844 기준) 화면 틀: 상단 제목, 스크롤되는 본문, 엄지 닿는 하단 영역. */
export function AppShell({ title, subtitle, children, footer }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <h1>{title}</h1>
        {subtitle && <p className="shell-subtitle">{subtitle}</p>}
      </header>
      <main className="shell-body">{children}</main>
      {footer && <footer className="shell-footer">{footer}</footer>}
    </div>
  );
}
