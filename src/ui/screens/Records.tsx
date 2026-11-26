/**
 * 계약자 기록(시안 Records, 지시서 027). 구역 순서: header · range · score · rank · metrics · counts · recent · actions.
 * 헤더와 하단 버튼은 고정하고 본문만 스크롤한다(항목이 늘어도). 항목 칸은 contribution.json 항목 행에서 만든다(2열).
 * 순위는 028(리그)에서 채운다. 쓰러짐은 영구 사망이 아니라 "쓰러짐(부상)"이다.
 */
import { useState } from 'react';
import { tables } from '../../data';
import { activityScore, currentSeasonTally, isApplicable, itemRatio, type ActivityTally } from '../../engine/contribution';
import { getMerc } from '../../engine/game';
import { Icon } from '../components';
import { elementName, num, roleName, tierName } from '../format';
import type { Ctx, Route } from '../nav';

type Range = 'season' | 'career';
const RESULT: Record<string, { label: string; tone: string }> = {
  victory: { label: '클리어', tone: 'up' },
  retreat: { label: '철수', tone: 'down' },
  defeat: { label: '패배', tone: 'bad' },
};
/** 막대: 0 ~ 평균의 2배를 칸 전체로, 가운데 선이 평균 */
const barWidth = (ratio: number) => `${Math.round(Math.max(0, Math.min(1, ratio / 2)) * 100)}%`;
const pct = (ratio: number) => {
  const d = Math.round((ratio - 1) * 100);
  return `${d >= 0 ? '+' : ''}${d}%`;
};
const itemValue = (v: number) => num(Math.round(v));

export function Records({ ctx, mercId, back }: { ctx: Ctx; mercId: string; back?: Route }) {
  const s = ctx.game.state;
  const m = getMerc(s, mercId);
  const [range, setRange] = useState<Range>('season');
  const rec = m.activity;
  const t: ActivityTally = range === 'season' ? currentSeasonTally(tables, rec, s.day) : (rec?.career ?? currentSeasonTally(tables, undefined, s.day));
  const score = activityScore(tables, m.role, t.items, t.sorties);
  const role = roleName(m.role);
  const items = tables.contribution.items;
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  const goBack = () => ctx.go(back ?? { name: 'merc', mercId });

  return (
    <div className="scr" data-screen="records">
      <main className="scr-body shell-body" style={{ overflow: 'hidden' }}>
        <div className="rec-head" data-ui="Records.header">
          <button className="back" aria-label="뒤로" onClick={goBack}>
            <Icon name="back" />
          </button>
          <span className="col grow">
            <span className="rec-title">{m.name} 기록</span>
            <span className="rec-sub">
              {role} · <span style={{ color: `var(--el-${m.element})` }}>{elementName(m.element)}</span> · Lv {m.level}
            </span>
          </span>
        </div>
        <div className="rec-scroll" data-ui="records.scroll" data-role="page">
          <div className="rec-range" role="tablist" data-ui="Records.range">
            {(['season', 'career'] as Range[]).map((r) => (
              <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
                {r === 'season' ? '이번 시즌' : '통산'}
              </button>
            ))}
          </div>

          <div className="rec-card" data-ui="Records.score">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <span className="col">
                <span className="rec-cap">활약도</span>
                <span className="rec-big" data-ui="records.scoreValue">
                  {score === null ? '—' : Math.round(score)}
                </span>
              </span>
              <span className="col" style={{ textAlign: 'right' }}>
                <span className="rec-cap">{role} 평균 100 대비</span>
                {score !== null && (
                  <span className="rec-delta" data-tone={score >= 100 ? 'up' : 'down'}>
                    {pct(score / 100)}
                  </span>
                )}
              </span>
            </div>
            <div className="rec-bar big">
              <i data-tone="grad" style={{ width: score === null ? '0%' : barWidth(score / 100) }} />
              <b />
            </div>
            <div className="row rec-scale">
              <span>0</span>
              <span>평균 100</span>
              <span>200</span>
            </div>
          </div>

          <div className="rec-rank" data-ui="Records.rank">
            <span>{role} 순위</span>
            <span className="dim">리그 시작 후 표시 (028)</span>
          </div>

          <div className="col" style={{ gap: 6 }} data-ui="Records.metrics">
            <span className="rec-label">항목별 기여 (역할 평균 대비)</span>
            {rows.map((pair) => (
              <div key={pair[0].id} className="row" style={{ gap: 6 }}>
                {pair.map((it) => {
                  const v = t.items[it.id] ?? 0;
                  const na = !isApplicable(tables, m.role, it.id);
                  const ratio = itemRatio(tables, m.role, it.id, v, t.sorties);
                  return (
                    <div key={it.id} className="rec-metric" data-na={na || undefined} data-item={it.id}>
                      <span className="rec-cap">{it.name}</span>
                      <span className="v">{itemValue(v)}</span>
                      {na ? (
                        <span className="rec-note">이 역할은 해당 없음</span>
                      ) : ratio === null ? (
                        <span className="rec-note">—</span>
                      ) : (
                        <>
                          <div className="rec-bar">
                            <i data-tone={ratio >= 1 ? 'up' : 'down'} style={{ width: barWidth(ratio) }} />
                            <b />
                          </div>
                          <span className="rec-note" data-tone={ratio >= 1 ? 'up' : 'down'}>
                            평균 대비 {pct(ratio)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="row" style={{ gap: 6 }} data-ui="Records.counts">
            {[
              ['출전', t.sorties],
              ['클리어', t.clears],
              ['쓰러짐(부상)', t.downs],
            ].map(([k, v]) => (
              <div key={k} className="rec-count">
                <span className="rec-cap" style={{ fontSize: 11 }}>
                  {k}
                </span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>

          <div className="col" style={{ gap: 6 }} data-ui="Records.recent">
            <span className="rec-label">최근 공략</span>
            {!rec?.recent.length ? (
              <div className="rec-empty">아직 공략 기록이 없습니다</div>
            ) : (
              rec.recent.map((r, i) => (
                <div key={`${r.day}:${i}`} className="rec-row">
                  <span className="d">{r.day}일차</span>
                  <span className="col grow" style={{ minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontSize: 13 }}>
                      {r.riftName}
                    </span>
                    <span className="rec-cap" style={{ fontSize: 11 }}>
                      {tierName(r.tier)}
                    </span>
                  </span>
                  <span className="sc">{r.score === null ? '—' : r.score}</span>
                  <span className="rec-badge" data-tone={RESULT[r.outcome].tone}>
                    {RESULT[r.outcome].label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
      <div className="foot" style={{ paddingTop: 8, paddingBottom: 12 }} data-ui="Records.actions">
        <button className="btn-act" style={{ width: '100%', fontSize: 15 }} onClick={goBack}>
          계약자 상세로
        </button>
      </div>
    </div>
  );
}
