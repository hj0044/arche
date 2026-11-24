/**
 * 도움말(시안 Help, 지시서 020). 구역 순서: header · search · topics.
 * 항목과 문구는 데이터 help.json에서 만든다(새 항목은 행 추가). 상태 효과·속성·역할·위험도 목록은 각 데이터 표에서 만든다.
 * 용어 검색은 제목·부제·본문 부분 일치. 펼친 항목은 한 번에 하나.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { tables, type HelpBlock, type HelpTopic } from '../../data';
import { Icon, StatusIcon } from '../components';
import { elementName, roleName } from '../format';
import type { Ctx, Route } from '../nav';

const ROW_NAME: Record<string, string> = { front: '전열', back: '후열' };

/** 생성 블록의 행(이름 · 설명 · 앞 표시) */
interface GenRow {
  key: string;
  name: string;
  text: string;
  lead: ReactNode;
}
function generated(source: Extract<HelpBlock, { type: 'generated' }>['source']): GenRow[] {
  switch (source) {
    case 'statusEffects':
      return tables.statusEffects.effects.map((e) => ({ key: e.id, name: e.name, text: e.description, lead: <StatusIcon id={e.id} size={28} /> }));
    case 'elements':
      return tables.elements.map((e) => ({
        key: e.id,
        name: e.name,
        text: e.strongAgainst.length ? `${e.strongAgainst.map(elementName).join('·')}에 유리` : '유리한 상대 없음',
        lead: <i className="help-dot" data-el={e.id} style={{ ['--sw' as string]: 'var(--el)' }} />,
      }));
    case 'roles':
      return tables.roles
        .filter((r) => r.enabled)
        .map((r) => ({ key: r.id, name: `${roleName(r.id)} · ${ROW_NAME[r.defaultRow] ?? r.defaultRow}`, text: r.description, lead: <i className="help-dot" style={{ ['--sw' as string]: 'var(--trait-role)' }} /> }));
    case 'riskTiers':
      return [...tables.combatPower.riskTiers]
        .sort((a, b) => b.minWinRate - a.minWinRate)
        .map((t) => ({
          key: t.id,
          name: t.name,
          text: t.minWinRate > 0 ? `예상 승률 ${Math.round(t.minWinRate * 100)}% 이상` : '그 아래',
          lead: <i className="help-dot" style={{ ['--sw' as string]: `var(--risk-${t.id})` }} />,
        }));
  }
}

/** 검색용 전체 글 */
function topicText(t: HelpTopic): string {
  return [
    t.title,
    t.subtitle,
    ...t.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : b.type === 'list' ? b.items : generated(b.source).flatMap((r) => [r.name, r.text]))),
  ].join(' ');
}

function Block({ b }: { b: HelpBlock }) {
  if (b.type === 'text') return <div className="help-note">{b.text}</div>;
  if (b.type === 'list')
    return (
      <ul className="help-ul">
        {b.items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  return (
    <>
      {generated(b.source).map((r) => (
        <div key={r.key} className="help-item">
          {r.lead}
          <div className="col grow">
            <span className="nm">{r.name}</span>
            <span className="ds">{r.text}</span>
          </div>
        </div>
      ))}
    </>
  );
}

export function Help({ ctx, topic, back }: { ctx: Ctx; topic?: string; back?: Route }) {
  const [open, setOpen] = useState<string | null>(topic ?? null);
  const [q, setQ] = useState('');
  const texts = useMemo(() => new Map(tables.help.topics.map((t) => [t.id, topicText(t).toLowerCase()])), []);
  const query = q.trim().toLowerCase();
  const list = tables.help.topics.filter((t) => !query || texts.get(t.id)!.includes(query));
  // 검색 중에는 걸린 첫 항목을 펼친다(한 번에 하나)
  const shown = query && list.length && !list.some((t) => t.id === open) ? list[0].id : open;
  return (
    <div className="scr" data-screen="help">
      <main className="scr-body shell-body">
        <div className="help-top" data-role="page">
          <div className="help-head" data-ui="Help.header">
            <button className="back" aria-label="뒤로" onClick={() => ctx.go(back ?? { name: 'saves' })}>
              <Icon name="back" />
            </button>
            <span style={{ fontSize: 20, fontWeight: 700 }}>도움말</span>
          </div>
          {/* 보이는 칸은 시안대로 40px, 누르는 영역은 44px */}
          <label className="help-search-hit" data-touch data-ui="Help.search">
            <span className="help-search">
              <Icon name="search" size={18} />
              <input type="search" placeholder="용어 검색" aria-label="용어 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </label>
        </div>
        <div className="help-list" data-ui="Help.topics" data-role="page">
          {list.map((t) => {
            const on = shown === t.id;
            return (
              <div key={t.id} className="help-sec" data-ui="help.section">
                <button className="help-sec-head" aria-expanded={on} onClick={() => setOpen(on ? null : t.id)}>
                  <span className="col grow">
                    <span className="t">{t.title}</span>
                    <span className="s">{t.subtitle}</span>
                  </span>
                  <Icon name={on ? 'chevronUp' : 'chevronDown'} style={{ color: 'var(--c-text-sub)' }} />
                </button>
                {on && (
                  <div className="help-body">
                    {t.blocks.map((b, i) => (
                      <Block key={i} b={b} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {list.length === 0 && <p className="sub">'{q}'에 맞는 항목이 없습니다</p>}
        </div>
      </main>
    </div>
  );
}
