import { useState } from 'react';
import { tables } from '../../data';
import { describeEffect, facilityLevel, facilitySlots, levelCost } from '../../engine/facilities';
import {
  assignBlockReason,
  assignToFacility,
  constructionBlockReason,
  GameError,
  startConstruction,
  unassignFromFacility,
} from '../../engine/game';
import { AppShell } from '../AppShell';
import { ElementTag, Panel, RoleTag } from '../components';
import { cityName, num } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

/** 거점(시작 도시 한 곳)의 시설. 시설·레벨 수를 가정하지 않고 데이터 표를 그대로 그린다. */
export function Base({ ctx }: { ctx: Ctx }) {
  const s = ctx.game.state;
  const fs = s.facilities;
  const [picking, setPicking] = useState<string | null>(null);
  const [effectsOpen, setEffectsOpen] = useState<string | null>(null);
  const job = fs.construction;

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };
  const name = (id: string) => s.mercenaries.find((m) => m.id === id)?.name ?? id;

  return (
    <AppShell title="거점" subtitle={`${cityName(s.baseCityId)} · 제로 ${num(s.resources.zero)}`} footer={<MainTabs ctx={ctx} current="base" />}>
      {tables.facilities.facilities.map((f) => {
        const lv = facilityLevel(fs, f.id);
        const next = lv + 1;
        const maxed = lv >= f.maxLevel;
        const cost = maxed ? null : levelCost(tables, f.id, next);
        const reason = constructionBlockReason(tables, s, f.id);
        const building = job?.facilityId === f.id;
        const slots = facilitySlots(tables, fs, f.id);
        const assigned = fs.assignments[f.id] ?? [];
        const canHaveSlots = (() => {
          // 다음 레벨에서라도 칸이 생기는 시설이면 배치 영역을 보인다
          const probe = { ...fs, levels: { ...fs.levels, [f.id]: Math.max(1, lv) } };
          return facilitySlots(tables, probe, f.id) > 0;
        })();
        return (
          <Panel
            key={f.id}
            title={
              <>
                {f.name} <span className="pill small">{lv === 0 ? '미건설' : `Lv${lv} / ${f.maxLevel}`}</span>
              </>
            }
          >
            <button
              className="btn block"
              disabled={!!reason}
              onClick={() =>
                run(() => {
                  ctx.setState(startConstruction(tables, s, f.id));
                  ctx.toast(`${f.name} Lv${next} 공사를 시작했습니다.`);
                })
              }
            >
              {building
                ? `🔨 Lv${job!.targetLevel} 공사 중 · ${Math.max(0, job!.completeDay - s.day)}일 뒤 완료(${job!.completeDay}일차)`
                : maxed
                  ? '최대 레벨'
                  : reason
                    ? `${lv === 0 ? '건설' : '강화'} 불가 · ${reason}`
                    : `${lv === 0 ? '건설' : `Lv${next}로 강화`} (제로 ${num(cost!.zero)}, ${cost!.days}일)`}
            </button>
            {/* 현재·다음 효과 비교는 펼쳐서 본다(비용·일수는 위 버튼에만, 지시서 014) */}
            <button className="link more-toggle" aria-expanded={effectsOpen === f.id} onClick={() => setEffectsOpen(effectsOpen === f.id ? null : f.id)}>
              {effectsOpen === f.id ? '효과 접기 ▴' : '효과 보기 ▾'}
            </button>
            {effectsOpen === f.id && (
              <div className="facility-effects small">
                <p className="muted">{f.description}</p>
                <p>현재: {lv > 0 ? describeEffect(tables, f.id, lv) : '없음(미건설)'}</p>
                {!maxed && <p>다음 Lv{next}: {describeEffect(tables, f.id, next)}</p>}
              </div>
            )}

            {canHaveSlots && (
              <div className="assign-block">
                <div className="small strong">
                  배치 {assigned.length} / {slots}
                  {slots === 0 && <span className="muted"> · 건설하면 배치할 수 있음</span>}
                </div>
                <ul className="rows">
                  {assigned.map((id) => (
                    <li key={id} className="row-item">
                      <span className="strong">{name(id)}</span>
                      <button className="btn small" onClick={() => ctx.setState(unassignFromFacility(s, f.id, id))}>
                        해제
                      </button>
                    </li>
                  ))}
                </ul>
                {slots > assigned.length && (
                  <button className="btn block" aria-expanded={picking === f.id} onClick={() => setPicking(picking === f.id ? null : f.id)}>
                    {picking === f.id ? '닫기 ▴' : '용병 배치 ▾'}
                  </button>
                )}
                {picking === f.id && (
                  <ul className="rows">
                    {s.mercenaries
                      .filter((m) => m.affiliation.kind === 'guild' && !assigned.includes(m.id))
                      .map((m) => {
                        const why = assignBlockReason(tables, s, f.id, m.id);
                        return (
                          <li key={m.id}>
                            <button
                              className="row-item row-button"
                              disabled={!!why}
                              onClick={() =>
                                run(() => {
                                  const next2 = assignToFacility(tables, s, f.id, m.id);
                                  ctx.setState(next2);
                                  if ((next2.facilities.assignments[f.id] ?? []).length >= slots) setPicking(null);
                                })
                              }
                            >
                              <div>
                                <div className="strong">
                                  {m.name} <span className="muted small">Lv{m.level}</span>
                                </div>
                                <div className="tags">
                                  <ElementTag id={m.element} />
                                  <RoleTag id={m.role} />
                                </div>
                              </div>
                              <span className={`pill ${why ? '' : 'ok'}`}>{why ?? '배치'}</span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        );
      })}
      <p className="hint">한 번에 한 시설만 건설·강화할 수 있고, 시작하면 제로를 바로 냅니다(취소 없음).</p>
    </AppShell>
  );
}
