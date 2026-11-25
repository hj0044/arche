/**
 * 시안에 반복되는 부품(지시서 017 C). 부품 하나가 시안의 모양 하나에 대응한다. 모든 부품은 data-ui를 받는다.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { tables } from '../../data';
import type { RiskTierRow } from '../../engine/combatPower';
import { portraitSvg, riftBannerSvg } from '../art/fallback';
import { Art } from './Art';
import { Icon } from './Icon';

type UiProps = { 'data-ui'?: string };

export function Card({ children, className, style, onClick, 'data-ui': dataUi, label }: UiProps & { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void; label?: string }) {
  if (onClick)
    return (
      <button className={`card ${className ?? ''}`} style={style} onClick={onClick} data-ui={dataUi} data-role="card" aria-label={label}>
        {children}
      </button>
    );
  return (
    <div className={`card ${className ?? ''}`} style={style} data-ui={dataUi} data-role="card">
      {children}
    </div>
  );
}

/** 제목 + 목록 구역 */
export function Section({ title, right, children, className, 'data-ui': dataUi }: UiProps & { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pg g6 ${className ?? ''}`} data-ui={dataUi}>
      {(title || right) && (
        <div className="row between">
          {title && <span className="sec-title">{title}</span>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** 알약 칩(높이 36, 터치 영역 44) */
export function Chip({ on, accent, children, onClick, label }: { on?: boolean; accent?: boolean; children: ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button className="chip-touch" data-touch onClick={onClick} aria-pressed={on} aria-label={label}>
      <span className={`chip ${on ? 'on' : ''} ${accent ? 'accent' : ''}`}>{children}</span>
    </button>
  );
}

/** 가로로 스크롤되는 칩 줄(스와이프 이동 제외) */
export function ChipRow({ children, label, 'data-ui': dataUi }: UiProps & { children: ReactNode; label: string }) {
  return (
    <div className="chip-row" role="group" aria-label={label} data-noswipe data-ui={dataUi}>
      {children}
    </div>
  );
}

/** 위험도 알약: 색 + 라벨 + 5칸 막대(좋을수록 많이 켜짐). 색만으로 구분하지 않는다 */
export function RiskPill({ best, worst }: { best: RiskTierRow; worst: RiskTierRow }) {
  const total = tables.combatPower.riskTiers.length;
  const lit = total + 1 - worst.step;
  const text = best.id === worst.id ? worst.name : `${best.name}~${worst.name}`;
  return (
    <span className="risk-pill" data-risk={worst.id} data-role="risk-pill" aria-label={`위험도 ${text}`}>
      <span className="risk-bars" data-role="risk-bars" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < lit ? 'on' : ''} style={{ height: `${4 + i * 2}px` }} />
        ))}
      </span>
      {text}
    </span>
  );
}

/** 진행 막대 */
export function Gauge({ ratio, color, size = 'md', 'data-ui': dataUi }: UiProps & { ratio: number; color?: string; size?: 'thin' | 'h4' | 'md' | 'h6' }) {
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <div className={`bar ${size === 'md' ? '' : size}`} role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100} data-ui={dataUi}>
      <i style={{ width: `${r * 100}%`, ...(color ? { ['--bar' as string]: color } : {}) }} />
    </div>
  );
}
export const ProgressBar = Gauge;

/** 계약자 초상(그림 슬롯) */
export function Portrait({ id, element, role, fill }: { id: string; element: string; role: string; fill?: boolean }) {
  return <Art kind="portrait" id={id} fallback={portraitSvg(id, element, role)} fill={fill} />;
}

/** 원형 아바타 */
export function Avatar({ id, element, role, large }: { id: string; element: string; role: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? 'lg' : ''}`}>
      <Portrait id={id} element={element} role={role} fill />
    </span>
  );
}

/** 성장 한계 구간(ui.json capTiers): min이 큰 것부터 */
export function capTier(cap: number) {
  const rows = [...tables.ui.capTiers].sort((a, b) => b.min - a.min);
  return rows.find((r) => cap >= r.min) ?? rows[rows.length - 1];
}
/** 보석 표시 구간(시안: 55~60, 65~) */
const GEM_TIERS = (): string[] => tables.ui.capTiers.slice(-2).map((t) => t.id);

/**
 * 초상 왼쪽 위 '레벨/성장 한계' 배지(계약자 카드·영입 카드·파티 편성이 같이 쓴다).
 * large: 영입 카드(시안 Recruit: 12px), slot: 파티 슬롯(시안 Party: 12px 굵게), plain: 한계 숫자도 같은 굵기·색(시안 Party 대기 카드)
 */
export function LevelBadge({ level, cap, large, slot, plain, ui }: { level: number; cap?: number; large?: boolean; slot?: boolean; plain?: boolean; ui?: string }) {
  return (
    <span className={`mcard-lv ${large ? 'lg' : ''} ${slot ? 'in-slot' : ''} ${plain ? 'plain' : ''}`} data-ui={ui}>
      {level}
      {cap !== undefined && <span>/{cap}</span>}
    </span>
  );
}

/** 계약자 카드(시안 Merc·Party): 초상, 레벨/한계, 속성 점, UP, 이름, (역할), 경험치 막대, 상태 글자, 한계 구간 테두리·빛·보석 */
export function MercCard({
  id,
  name,
  element,
  role,
  roleName,
  level,
  cap,
  expRatio,
  expColor,
  up,
  state,
  stateClass,
  off,
  onClick,
  compact,
  shortName,
  plainBadge,
  levelUi,
}: {
  /** 파티 대기 카드처럼 한계 숫자를 흐리게 하지 않는다(지시서 024) */
  plainBadge?: boolean;
  /** 배지의 data-ui(파티 편성: party.level) */
  levelUi?: string;
  /** 파티 후보처럼 작게(초상 52, 막대 없음) */
  compact?: boolean;
  id: string;
  name: string;
  /** 카드에 보일 짧은 이름(017b). 접근성 이름은 전체 name */
  shortName?: string;
  element: string;
  role: string;
  /** 파티 후보처럼 역할 이름을 보일 때 */
  roleName?: string;
  level: number;
  /** 성장 한계(없으면 레벨만) */
  cap?: number;
  expRatio?: number;
  expColor?: string;
  up?: boolean;
  state: string;
  stateClass?: string;
  off?: boolean;
  onClick?: () => void;
}) {
  const tier = cap !== undefined ? capTier(cap) : undefined;
  return (
    <button className={`mcard ${off ? 'off' : ''} ${compact ? 'compact' : ''}`} data-cap={tier?.id} data-el={element} onClick={onClick} aria-label={`${name} Lv${level}${cap ? `/${cap}` : ''} ${state}`}>
      <div className="mcard-art">
        <Portrait id={id} element={element} role={role} fill />
        <LevelBadge level={level} cap={cap} plain={plainBadge} ui={levelUi} />
        <span className="mcard-el" />
        {up && <span className="mcard-up">UP</span>}
      </div>
      <div className="mcard-info">
        <span className="mcard-name">{shortName ?? name}</span>
        {roleName && <span className="mcard-role">{roleName}</span>}
        {expRatio !== undefined && <Gauge ratio={expRatio} color={expColor} size="thin" />}
        <span className={`mcard-state ${stateClass ?? ''}`}>{state}</span>
      </div>
      {tier && GEM_TIERS().includes(tier.id) && (
        <span className="mcard-gem" aria-hidden="true">
          <i />
        </span>
      )}
    </button>
  );
}

/** 파티 슬롯(+ 또는 계약자: 초상 56 · 이름 · 역할) */
export function Slot({
  filled,
  onClick,
  label,
  className,
  ...rest
}: {
  filled?: { id: string; name: string; shortName?: string; element: string; role: string; level: number; cap?: number; roleName: string };
  onClick: () => void;
  label: string;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className'>) {
  return (
    <button className={`slot ${filled ? '' : 'empty'} ${className ?? ''}`} data-role="slot" onClick={onClick} aria-label={label} {...rest}>
      {filled ? (
        <>
          <span className="slot-art">
            <Portrait id={filled.id} element={filled.element} role={filled.role} fill />
            {/* 지시서 024: 레벨/성장 한계 배지 */}
            <LevelBadge level={filled.level} cap={filled.cap} slot plain ui="party.level" />
          </span>
          <span className="slot-info">
            <span className="slot-name">{filled.shortName ?? filled.name}</span>
            <span className="slot-role">{filled.roleName}</span>
          </span>
        </>
      ) : (
        <span aria-hidden="true">+</span>
      )}
    </button>
  );
}

/** 바텀 시트(시안에 없는 기존 기능을 흡수하는 확인·선택 상자) */
export function Sheet({ title, children, onClose }: { title: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** 스탯 상자(이름 · 값 · 막대) */
export function StatRow({ items }: { items: { name: string; value: string; ratio: number; color: string }[] }) {
  return (
    <div className="stat-row">
      {items.map((it) => (
        <div className="stat" key={it.name}>
          <div className="stat-head">
            <span>{it.name}</span>
            <b>{it.value}</b>
          </div>
          <Gauge ratio={it.ratio} color={it.color} size="h4" />
        </div>
      ))}
    </div>
  );
}

/** 특성 행(종류 칩 · 이름 · 설명 · 해금 Lv) 또는 잠금 행 */
export function TraitRow({ category, kindName, name, description, level, locked }: { category: string; kindName: string; name: string; description: string; level: number; locked?: boolean }) {
  if (locked)
    return (
      <div className="trait locked">
        <Icon name="lock" />
        <span className="t13 grow dim">{kindName} 특성</span>
        <span className="trait-lv">Lv {level} 해금</span>
      </div>
    );
  return (
    <div className="trait" data-trait={category}>
      <span className="trait-kind">{kindName}</span>
      <div className="col grow" style={{ minWidth: 0 }}>
        <span className="t14 m">{name}</span>
        <span className="trait-desc">{description}</span>
      </div>
      <span className="trait-lv">Lv {level}</span>
    </div>
  );
}

/** 1x/2x/3x 세그먼트 */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

/** 리프트 배너 장면(그림 슬롯, 350:52) */
export function Banner({ tier, risk, children }: { tier: string; risk: string; children?: ReactNode }) {
  return (
    <div style={{ position: 'relative', height: 52 }}>
      <Art kind="banner" id={`rift-${tier}`} fallback={riftBannerSvg(tier, risk)} fill />
      {children}
    </div>
  );
}
