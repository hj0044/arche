/**
 * 거점(시안 Base, 지시서 017). 구역 순서: header · hq · facilities · locked · training.
 * 시설 카드를 누르면 바텀 시트에서 현재·다음 효과와 건설·강화를 한다(비용을 쓰는 행동이라 한 단계 확인).
 * 배치 칸이 있는 시설(훈련소)은 배치 카드를 눌러 계약자를 넣고 뺀다. 시설·레벨 수는 데이터 표를 그대로 따른다.
 */
import { useState } from 'react';
import { tables } from '../../data';
import { describeEffect, facilityLevel, facilitySlots, levelCost } from '../../engine/facilities';
import { assignBlockReason, assignToFacility, constructionBlockReason, GameError, startConstruction, unassignFromFacility } from '../../engine/game';
import { FACILITY, HQ_BANNER } from '../art/fallback';
import { Art, Avatar, Gauge, LogoRow, Screen, Sheet } from '../components';
import { cityName, num, roleName, termText } from '../format';
import type { Ctx } from '../nav';

export function Base({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const fs = s.facilities;
  const job = fs.construction;
  const [sheet, setSheet] = useState<{ kind: 'facility' | 'assign'; id: string } | null>(null);
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };
  const merc = (id: string) => s.mercenaries.find((m) => m.id === id);
  // 다음 레벨에서라도 배치 칸이 생기는 시설
  const slotFacilities = tables.facilities.facilities.filter((f) => facilitySlots(tables, { ...fs, levels: { ...fs.levels, [f.id]: Math.max(1, facilityLevel(fs, f.id)) } }, f.id) > 0);

  const actionLabel = (id: string) => {
    const f = tables.facilities.facilities.find((x) => x.id === id)!;
    const lv = facilityLevel(fs, id);
    if (job?.facilityId === id) return `공사 중 · ${Math.max(0, job.completeDay - s.day)}일`;
    if (lv >= f.maxLevel) return '최대 레벨';
    const c = levelCost(tables, id, lv + 1);
    return `${lv === 0 ? '건설' : '강화'} ${num(c.zero)} · ${c.days}일`;
  };

  const sheetFacility = sheet ? tables.facilities.facilities.find((f) => f.id === sheet.id)! : null;

  return (
    <Screen ctx={ctx} tab="base">
      <div className="pg top-16 px20" style={{ gap: 8 }} data-role="page">
        <div data-ui="Base.header">
          <LogoRow ctx={ctx} back={{ name: 'base' }} right={<span className="logo-meta">{cityName(s.baseCityId)} · 길드 본부</span>} />
        </div>
        <div className="col" style={{ gap: 8 }} data-ui="Base.hq">
          <div className="card" data-role="card" style={{ position: 'relative', height: 96, overflow: 'hidden' }}>
            <Art kind="banner" id="hq" fallback={HQ_BANNER} fill />
          </div>
          {job && (
            <button className="card base-job" data-role="card" onClick={() => setSheet({ kind: 'facility', id: job.facilityId })}>
              <span className="row between t14">
                <span className="m">
                  공사 중 · {tables.facilities.facilities.find((f) => f.id === job.facilityId)?.name} Lv {job.targetLevel}
                </span>
                <span className="dim">{job.completeDay}일차 완공</span>
              </span>
              <Gauge ratio={(s.day - job.startDay) / Math.max(1, job.completeDay - job.startDay)} color="var(--c-info)" size="h6" />
            </button>
          )}
        </div>
      </div>
      <div className="pg px20" data-role="page">
        <div className="fac-grid">
          <div className="contents" data-ui="Base.facilities">
          {tables.facilities.facilities.map((f) => {
            const lv = facilityLevel(fs, f.id);
            return (
              <button key={f.id} className="fac-card" data-role="card" aria-label={`${f.name} 자세히`} onClick={() => setSheet({ kind: 'facility', id: f.id })}>
                <span className="fac-icon">
                  <span className="fac-icon-in">
                  <Art kind="icon" id={`facility-${f.id}`} fallback={FACILITY[f.id] ?? FACILITY.locked} fill />
                  </span>
                </span>
                <span className="row between">
                  <span className="t15 m">{f.name}</span>
                  <span className="fac-lv">{lv === 0 ? '미건설' : `Lv ${lv}`}</span>
                </span>
                <span className="fac-desc">{lv > 0 ? describeEffect(tables, f.id, lv) : termText(f.description)}</span>
                <span className={`fac-act ${job?.facilityId === f.id ? 'busy' : ''}`}>{actionLabel(f.id)}</span>
              </button>
            );
          })}
          </div>
          <div className="contents" data-ui="Base.locked">
          {tables.ui.lockedFacilities.map((x) => (
            <div key={x.id} className="fac-card locked" data-role="card">
              <span className="fac-icon">
                <span className="fac-icon-in">
                <Art kind="icon" id={`facility-${x.id}`} fallback={FACILITY.locked} fill />
                </span>
              </span>
              <span className="row between">
                <span className="t15 m">{x.name}</span>
                <span className="sub">{x.status}</span>
              </span>
              <span className="fac-desc">{x.note}</span>
              <span style={{ height: 36 }} />
            </div>
          ))}
          </div>
        </div>
      </div>
      <div className="pg px20" data-role="page">
        <div className="col" style={{ gap: 8 }} data-ui="Base.training">
          {slotFacilities.map((f) => {
            const slots = facilitySlots(tables, fs, f.id);
            const assigned = fs.assignments[f.id] ?? [];
            const lv = facilityLevel(fs, f.id);
            return (
              <button key={f.id} className="card base-train" data-role="card" onClick={() => setSheet({ kind: 'assign', id: f.id })}>
                <span className="row between">
                  <span className="t14 m">
                    {f.id === 'training' ? '훈련' : f.name} 배치 {assigned.length}/{slots}
                  </span>
                  <span className="sub">{lv > 0 ? describeEffect(tables, f.id, lv).split(', ').slice(1).join(', ') || describeEffect(tables, f.id, lv) : '건설하면 배치할 수 있음'}</span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {assigned.map((id) => {
                    const m = merc(id);
                    return m ? (
                      <span key={id} className="train-avatar">
                        <Avatar id={m.id} element={m.element} role={m.role} />
                      </span>
                    ) : null;
                  })}
                  <span className="t13 dim" style={{ marginLeft: assigned.length ? 6 : 0 }}>
                    {assigned.length ? assigned.map((id) => merc(id)?.name ?? id).join(' · ') : slots > 0 ? '눌러서 계약자를 배치' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grow" />

      {sheet?.kind === 'facility' && sheetFacility && (() => {
        const f = sheetFacility;
        const lv = facilityLevel(fs, f.id);
        const maxed = lv >= f.maxLevel;
        const reason = constructionBlockReason(tables, s, f.id);
        const building = job?.facilityId === f.id;
        const cost = maxed ? null : levelCost(tables, f.id, lv + 1);
        return (
          <Sheet title={`${f.name} · ${lv === 0 ? '미건설' : `Lv ${lv} / ${f.maxLevel}`}`} onClose={() => setSheet(null)}>
            <p className="sub" style={{ margin: 0 }}>
              {termText(f.description)}
            </p>
            <dl className="kv-list">
              <dt>현재</dt>
              <dd>{lv > 0 ? describeEffect(tables, f.id, lv) : '없음(미건설)'}</dd>
              {!maxed && (
                <>
                  <dt>다음 Lv {lv + 1}</dt>
                  <dd>{describeEffect(tables, f.id, lv + 1)}</dd>
                </>
              )}
              {building && (
                <>
                  <dt>공사</dt>
                  <dd>
                    Lv {job!.targetLevel} · {job!.completeDay}일차 완공({Math.max(0, job!.completeDay - s.day)}일 뒤)
                  </dd>
                </>
              )}
            </dl>
            {!building && !maxed && (
              <>
                {reason && <p className="t13" style={{ margin: 0, color: 'var(--c-warn)' }}>{reason}</p>}
                <button
                  className="btn-act primary"
                  disabled={!!reason}
                  onClick={() =>
                    run(() => {
                      ctx.setState(startConstruction(tables, s, f.id));
                      setSheet(null);
                      ctx.toast(`${f.name} Lv${lv + 1} 공사를 시작했습니다.`);
                    })
                  }
                >
                  {lv === 0 ? '건설' : `Lv ${lv + 1}로 강화`} (제로 {num(cost!.zero)} · {cost!.days}일)
                </button>
                <p className="sub" style={{ margin: 0 }}>
                  한 번에 한 시설만 건설·강화할 수 있고, 시작하면 제로를 바로 냅니다(취소 없음).
                </p>
              </>
            )}
            <button className="btn-act" onClick={() => setSheet(null)}>
              닫기
            </button>
          </Sheet>
        );
      })()}

      {sheet?.kind === 'assign' && sheetFacility && (() => {
        const f = sheetFacility;
        const slots = facilitySlots(tables, fs, f.id);
        const assigned = fs.assignments[f.id] ?? [];
        return (
          <Sheet title={`${f.name} 배치 ${assigned.length}/${slots}`} onClose={() => setSheet(null)}>
            {slots === 0 && <p className="t14 dim" style={{ margin: 0 }}>{f.name}를 건설하면 배치할 수 있습니다.</p>}
            <ul className="assign-list">
              {assigned.map((id) => (
                <li key={id}>
                  <span className="t14 m grow">{merc(id)?.name ?? id}</span>
                  <button className="btn-act" style={{ height: 44, padding: '0 14px', fontSize: 14 }} onClick={() => ctx.setState(unassignFromFacility(s, f.id, id))}>
                    해제
                  </button>
                </li>
              ))}
              {slots > assigned.length &&
                s.mercenaries
                  .filter((m) => m.affiliation.kind === 'guild' && !assigned.includes(m.id))
                  .map((m) => {
                    const why = assignBlockReason(tables, s, f.id, m.id);
                    return (
                      <li key={m.id}>
                        <span className="col grow" style={{ minWidth: 0 }}>
                          <span className="t14 m">
                            {m.name} <span className="sub">Lv {m.level}</span>
                          </span>
                          <span className="sub">{why ?? roleName(m.role)}</span>
                        </span>
                        <button
                          className="btn-act primary"
                          style={{ height: 44, padding: '0 14px', fontSize: 14 }}
                          disabled={!!why}
                          onClick={() => run(() => ctx.setState(assignToFacility(tables, s, f.id, m.id)))}
                        >
                          배치
                        </button>
                      </li>
                    );
                  })}
            </ul>
            <button className="btn-act" onClick={() => setSheet(null)}>
              닫기
            </button>
          </Sheet>
        );
      })()}
    </Screen>
  );
}
