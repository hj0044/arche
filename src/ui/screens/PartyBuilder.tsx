/**
 * 파티 편성(시안 Party·PartyDrag, 지시서 017·024). 구역 순서: header · riftCard · front · back · candidates · summary · actions.
 * 024: 슬롯·대기 카드에 '레벨/성장 한계' 배지, 편성된 계약자를 누르면 바로 해제, 길게 눌러 끌면 이동·교체·해제(usePartyDrag, 규칙은 partyDrag.ts).
 * 편성되지 않은 계약자의 시트(훈련 해제, 출전 불가 사유)는 그대로다.
 */
import { useEffect, useMemo, useState } from 'react';
import { getRole, tables, travelDays, type Row } from '../../data';
import { autoParty } from '../../engine/autoParty';
import { compositionMultiplier } from '../../engine/combat';
import { combatPower, estimateRisk } from '../../engine/combatPower';
import { assignedFacility, getFacility, visibleRift } from '../../engine/facilities';
import { dispatch, GameError, isAvailable, isOnExpedition, mercToUnit, refusedToday, unassignFromFacility, type MercenaryState, type PartyMember } from '../../engine/game';
import { BackRow, Card, Icon, MercCard, RiskPill, Screen, Sheet, Slot } from '../components';
import { cardName, elementName, num, pct, roleName, rowName, term } from '../format';
import type { Ctx } from '../nav';
import { winRateRange } from '../partyInfo';
import { applyDrop, canDrop, dropKey, type DragSource, type DropRules, type DropTarget } from '../partyDrag';
import { usePartyDrag, type DragState } from '../usePartyDrag';
import { isUiFixture } from '../../app/saves';
import { daysLeft } from '../riftFilter';
import { latestDeparture } from '../riftInfo';

export function PartyBuilder({ ctx, riftId, dragPreview }: { ctx: Ctx; riftId: string; dragPreview?: boolean }) {
  const s = ctx.game.state;
  const rift = s.rifts.find((r) => r.id === riftId);
  // 개발용 픽스처에서는 시안처럼 자동 편성된 상태로 연다
  const [party, setParty] = useState<PartyMember[]>(() => (rift && isUiFixture() ? autoParty(tables, s, rift).slice(0, 4) : []));
  const [sheet, setSheet] = useState<string | null>(null);
  const { maxSize, maxPerRow } = tables.combat.party;
  const blockReason = (id: string) => {
    const m = s.mercenaries.find((x) => x.id === id);
    if (!m || m.affiliation.kind !== 'guild') return '길드 소속이 아님';
    return isAvailable(s, id) ? null : reason(m);
  };
  const rules: DropRules = { maxSize, maxPerRow, rowName, blockReason };
  const nameOf = (id: string) => s.mercenaries.find((m) => m.id === id)?.name ?? id;
  const onDrop = (src: DragSource, target: DropTarget | null) => {
    const r = applyDrop(party, src, target, rules);
    if (!r.ok) return ctx.toast(r.error);
    if (r.action === 'none') return;
    setParty(r.party);
    if (r.action === 'remove') ctx.toast(`${nameOf(src.mercId)} 해제`);
    if (r.action === 'replace' && r.removed) ctx.toast(`${nameOf(r.removed)} 해제`);
  };
  // 개발 픽스처(시안 PartyDrag): 후열 첫 계약자를 끄는 중인 모습으로 연다
  const preview = (): DragState | null => {
    if (!dragPreview) return null;
    const first = (rift && isUiFixture() ? autoParty(tables, s, rift).slice(0, 4) : []).find((p) => p.row === 'back');
    return first ? { src: { from: 'slot', mercId: first.mercId }, ghost: { x: 150, y: 268 }, over: null } : null;
  };
  const { drag, bind, clickAllowed } = usePartyDrag(party, rules, onDrop, preview());

  const slots = party.filter((p) => s.mercenaries.some((m) => m.id === p.mercId)).map((p) => ({ unit: mercToUnit(tables, s.mercenaries.find((m) => m.id === p.mercId)!), row: p.row }));
  // 017b: 요약의 위험도·승률은 상세 평가(96회). 파티가 바뀔 때마다 한 번만, 짧게 늦춰 계산하고 그동안 직전 값을 흐리게 둔다.
  const partyKey = JSON.stringify(slots.map((x) => [x.unit.id, x.row]));
  const [info, setInfo] = useState<{ key: string; power: number; estimate: ReturnType<typeof estimateRisk>; win: [number, number] | null } | null>(null);
  const power = useMemo(() => (slots.length ? combatPower(tables, slots) : 0), [partyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rift || !slots.length) return setInfo(null);
    const t = window.setTimeout(() => {
      const v = visibleRift(tables, s.facilities, rift);
      setInfo({ key: partyKey, power, estimate: estimateRisk(tables, slots, v, { detail: true }), win: winRateRange(tables, slots, v) });
    }, tables.ui.partyRiskDebounceMs);
    return () => window.clearTimeout(t);
  }, [partyKey, rift?.id, s.facilities]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = !!slots.length && info?.key !== partyKey;

  const back = () => ctx.go({ name: 'rifts', cityId: rift?.cityId });
  if (!rift) {
    return (
      <Screen>
        <div className="pg top-16" data-role="page">
          <div data-ui="Party.header">
            <BackRow title="파티 편성" onBack={back} />
          </div>
          <p className="t14 dim">리프트가 사라졌습니다.</p>
        </div>
      </Screen>
    );
  }

  const merc = (id: string) => s.mercenaries.find((m) => m.id === id)!;
  const guild = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const v = visibleRift(tables, s.facilities, rift);
  const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`);
  const left = daysLeft(tables, s.facilities, rift, s.day);
  const depart = latestDeparture(tables, s.facilities, rift, s.baseCityId);
  const travel = travelDays(tables, s.baseCityId, rift.cityId);
  const totalDays = travel * 2 + rift.durationDays;
  const inParty = (id: string) => party.find((p) => p.mercId === id);
  const rowCount = (row: Row) => party.filter((p) => p.row === row).length;

  const add = (m: MercenaryState) => {
    if (party.length >= maxSize) return ctx.toast(`파티는 최대 ${maxSize}명입니다`);
    const def = getRole(tables, m.role).defaultRow;
    const row: Row = rowCount(def) < maxPerRow ? def : def === 'front' ? 'back' : 'front';
    setParty([...party, { mercId: m.id, row }]);
  };
  const remove = (id: string) => {
    setParty(party.filter((p) => p.mercId !== id));
    ctx.toast(`${nameOf(id)} 해제`);
  };
  const tapCandidate = (m: MercenaryState) => {
    if (!clickAllowed()) return;
    if (inParty(m.id)) return remove(m.id);
    if (isAvailable(s, m.id)) return add(m);
    setSheet(m.id); // 출전할 수 없는 이유(훈련이면 해제)
  };
  const send = () => {
    try {
      ctx.setState(dispatch(tables, s, rift.id, party.filter((p) => isAvailable(s, p.mercId))));
      ctx.toast(`${rift.name}에 파견했습니다. ${s.day + totalDays}일차에 복귀합니다.`);
      ctx.go({ name: 'home' });
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const roles = party.map((p) => merc(p.mercId).role);
  const comp = compositionMultiplier(tables, roles);
  function reason(m: MercenaryState) {
    return (
    refusedToday(s, m)
      ? '오늘 거부'
      : m.injury
        ? `${m.injury.recoverDay}일차~`
        : isOnExpedition(s, m.id)
          ? '파견 중'
          : assignedFacility(s.facilities, m.id)
            ? '훈련 중'
            : '불가'
    );
  }
  const availableCount = guild.filter((m) => isAvailable(s, m.id)).length;
  const sheetMerc = sheet ? merc(sheet) : null;

  // 끌기 중 강조: 놓을 수 있는 열의 '들어갈 빈 칸'(빈 칸은 열 맨 뒤에 붙으므로 첫 빈 칸)과, 손가락 아래의 놓을 수 있는 채워진 칸
  const lit = (t: DropTarget) => !!drag && canDrop(party, drag.src, t, rules);
  const hoverRow = drag?.over?.kind === 'empty' ? drag.over.row : null;
  const srcRow = drag ? inParty(drag.src.mercId)?.row : undefined;
  const rowSlots = (row: Row) => {
    const members = party.filter((p) => p.row === row);
    return Array.from({ length: maxPerRow }, (_, i) => {
      const p = members[i];
      if (!p) {
        const landing = i === members.length && lit({ kind: 'empty', row }) && (row !== srcRow || hoverRow === row);
        return (
          <Slot
            key={`e${i}`}
            className={landing ? 'drop-target' : ''}
            data-ui={landing ? 'party.dropTarget' : undefined}
            data-drop={dropKey({ kind: 'empty', row })}
            onClick={() => clickAllowed() && ctx.toast(`아래에서 ${term.merc}를 고르세요`)}
            label={`${rowName[row]} 빈 칸`}
          />
        );
      }
      const m = merc(p.mercId);
      const target: DropTarget = { kind: 'filled', mercId: m.id };
      const hovered = drag?.over?.kind === 'filled' && drag.over.mercId === m.id && lit(target);
      return (
        <Slot
          key={m.id}
          className={`${drag?.src.mercId === m.id ? 'drag-origin' : ''} ${hovered ? 'drop-target' : ''}`}
          data-ui={hovered ? 'party.dropTarget' : undefined}
          data-drop={dropKey(target)}
          filled={{ id: m.id, name: m.name, shortName: cardName(m), element: m.element, role: m.role, level: m.level, cap: m.growth.cap, roleName: roleName(m.role) }}
          onClick={() => clickAllowed() && remove(m.id)}
          label={`${m.name} ${rowName[row]}, 누르면 해제, 길게 눌러 끌기`}
          {...bind({ from: 'slot', mercId: m.id }, true)}
        />
      );
    });
  };
  const ghostMerc = drag?.ghost ? merc(drag.src.mercId) : null;

  return (
    <Screen
      footer={
        <>
          <div className="pg" style={{ paddingTop: 0, paddingBottom: 8 }} data-ui="Party.summary">
            <Card style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, opacity: pending ? 0.5 : 1, transition: 'opacity 0.12s' }}>
              <div className="row between">
                <div className="col" style={{ gap: 1 }}>
                  <span className="t13 dim">파티 전투력</span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{num(power)}</span>
                </div>
                <div className="col" style={{ gap: 3, alignItems: 'flex-end' }}>
                  {info && slots.length ? <RiskPill best={info.estimate.best} worst={info.estimate.worst} /> : <span className="sub">{slots.length ? '계산 중' : `${term.merc}를 넣으면 보입니다`}</span>}
                  {slots.length > 0 && info?.win && (
                    <span className="sub">
                      승률 약 {range([Math.round(info.win[0] * 100), Math.round(info.win[1] * 100)])}%{info.estimate.estimated ? ' (추정)' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="comp-chip">구성 {pct(comp - 1)}</span>
                <span className="sub ellipsis">{roles.length ? `${[...new Set(roles)].map(roleName).join(' · ')} 조합` : '비어 있음'}</span>
              </div>
            </Card>
          </div>
          <div className="foot" style={{ paddingTop: 0, paddingBottom: 16 }} data-ui="Party.actions">
            <button className="btn-act" style={{ width: 112, flex: 'none', height: 52, fontSize: 15, fontWeight: 500 }} onClick={() => setParty(autoParty(tables, s, rift))}>
              자동 편성
            </button>
            <button className="btn-big" disabled={party.length === 0} onClick={send}>
              파견 ({totalDays}일)
            </button>
          </div>
        </>
      }
    >
      <div className="pg top-16" data-role="page">
        <div data-ui="Party.header">
          <BackRow title="파티 편성" onBack={back} />
        </div>
        <Card data-ui="Party.riftCard" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="rift-icon">
            <Icon name="rift" />
          </span>
          <span className="col grow" style={{ gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }} className="ellipsis">
              {rift.name}
            </span>
            <span className="t13 dim ellipsis">
              적 {range(v.count)}명 · {v.elements ? v.elements.map(elementName).join('·') : '속성 ?'} · Lv {range(v.level)} · {totalDays}일 소요
            </span>
            {left && depart && (
              <span className="t13 dim ellipsis">
                마감 D-{range(left)} · 늦어도 {range([Math.max(s.day, depart.day[0]), depart.day[1]])}일차까지 출발
              </span>
            )}
          </span>
        </Card>
      </div>
      <div className="pg g4" data-role="page">
        <span className="t13 dim">{rowName.front}</span>
        <div className="slots" data-ui="Party.front" data-noswipe>
          {rowSlots('front')}
        </div>
        <span className="t13 dim">{rowName.back}</span>
        <div className="slots" data-ui="Party.back" data-noswipe>
          {rowSlots('back')}
        </div>
      </div>
      <div className="pg g6" style={{ paddingTop: 10, paddingBottom: 10 }} data-role="page" data-ui="Party.candidates">
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <span className="sec-title">대기 {term.merc}</span>
          <span className="sub">출전 가능 {availableCount}명</span>
        </div>
        <div className="merc-grid" data-role="grid" data-drop="bench" data-noswipe>
          {guild.map((m) => {
            const free = isAvailable(s, m.id);
            const src: DragSource = { from: inParty(m.id) ? 'slot' : 'bench', mercId: m.id };
            return (
              <div key={m.id} className={`${inParty(m.id) ? 'picked-wrap' : ''} ${drag?.src.mercId === m.id && drag.src.from === 'bench' ? 'drag-origin-wrap' : ''}`} {...bind(src, free || !!inParty(m.id))}>
                <MercCard
                  compact
                  id={m.id}
                  name={m.name}
                  shortName={cardName(m)}
                  element={m.element}
                  role={m.role}
                  roleName={roleName(m.role)}
                  level={m.level}
                  cap={m.growth.cap}
                  plainBadge
                  levelUi="party.level"
                  state={inParty(m.id) ? '편성됨' : free ? '출전 가능' : reason(m)}
                  stateClass={inParty(m.id) ? 'gold' : free ? 'ok' : 'warn'}
                  off={!free && !inParty(m.id)}
                  onClick={() => tapCandidate(m)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {drag && (
        <div className="party-drag-guide" role="status">
          놓을 칸을 고르세요 · 대기 목록에 놓으면 해제
        </div>
      )}
      {ghostMerc && drag?.ghost && (
        <div className="party-ghost" data-ui="party.ghost" style={{ left: drag.ghost.x, top: drag.ghost.y }} aria-hidden="true">
          <Slot
            filled={{ id: ghostMerc.id, name: ghostMerc.name, shortName: cardName(ghostMerc), element: ghostMerc.element, role: ghostMerc.role, level: ghostMerc.level, cap: ghostMerc.growth.cap, roleName: roleName(ghostMerc.role) }}
            onClick={() => {}}
            label=""
            tabIndex={-1}
          />
        </div>
      )}
      {sheetMerc && !inParty(sheetMerc.id) && (
        <Sheet title={sheetMerc.name} onClose={() => setSheet(null)}>
          {assignedFacility(s.facilities, sheetMerc.id) && !sheetMerc.injury && !isOnExpedition(s, sheetMerc.id) ? (
            <>
              <p className="t14 dim" style={{ margin: 0 }}>
                {getFacility(tables, assignedFacility(s.facilities, sheetMerc.id)!).name}에 배치되어 있습니다. 해제하면 오늘 편성에 넣을 수 있습니다(오늘 훈련 경험치는 받지 않음).
              </p>
              <button
                className="btn-act primary"
                onClick={() => {
                  const fid = assignedFacility(s.facilities, sheetMerc.id)!;
                  ctx.setState(unassignFromFacility(s, fid, sheetMerc.id));
                  setSheet(null);
                  ctx.toast(`${sheetMerc.name} 배치 해제`);
                }}
              >
                훈련 해제
              </button>
            </>
          ) : (
            <p className="t14 dim" style={{ margin: 0 }}>
              오늘은 출전할 수 없습니다: {reason(sheetMerc)}
            </p>
          )}
          <button className="btn-act" onClick={() => setSheet(null)}>
            닫기
          </button>
        </Sheet>
      )}
    </Screen>
  );
}
