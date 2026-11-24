/**
 * 파티 편성(시안 Party, 지시서 017). 구역 순서: header · riftCard · front · back · candidates · summary · actions.
 * 시안에 자리가 없는 열 바꾸기·빼기·훈련 해제는 바텀 시트로 흡수했다.
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
import { isUiFixture } from '../../app/saves';
import { daysLeft } from '../riftFilter';
import { latestDeparture } from '../riftInfo';

export function PartyBuilder({ ctx, riftId }: { ctx: Ctx; riftId: string }) {
  const s = ctx.game.state;
  const rift = s.rifts.find((r) => r.id === riftId);
  // 개발용 픽스처에서는 시안처럼 자동 편성된 상태로 연다
  const [party, setParty] = useState<PartyMember[]>(() => (rift && isUiFixture() ? autoParty(tables, s, rift).slice(0, 4) : []));
  const [sheet, setSheet] = useState<string | null>(null);
  const { maxSize, maxPerRow } = tables.combat.party;

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
  const tapCandidate = (m: MercenaryState) => {
    if (inParty(m.id)) return setSheet(m.id);
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
  const reason = (m: MercenaryState) =>
    refusedToday(s, m)
      ? '오늘 거부'
      : m.injury
        ? `${m.injury.recoverDay}일차~`
        : isOnExpedition(s, m.id)
          ? '파견 중'
          : assignedFacility(s.facilities, m.id)
            ? '훈련 중'
            : '불가';
  const availableCount = guild.filter((m) => isAvailable(s, m.id)).length;
  const sheetMerc = sheet ? merc(sheet) : null;

  const rowSlots = (row: Row) => {
    const members = party.filter((p) => p.row === row);
    return Array.from({ length: maxPerRow }, (_, i) => {
      const p = members[i];
      if (!p) return <Slot key={`e${i}`} onClick={() => ctx.toast(`아래에서 ${term.merc}를 고르세요`)} label={`${rowName[row]} 빈 칸`} />;
      const m = merc(p.mercId);
      return <Slot key={m.id} filled={{ id: m.id, name: m.name, shortName: cardName(m), element: m.element, role: m.role, level: m.level, roleName: roleName(m.role) }} onClick={() => setSheet(m.id)} label={`${m.name} ${rowName[row]}`} />;
    });
  };

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
        <div className="merc-grid" data-role="grid">
          {guild.map((m) => {
            const free = isAvailable(s, m.id);
            return (
              <div key={m.id} className={inParty(m.id) ? 'picked-wrap' : ''}>
                <MercCard
                  compact
                  id={m.id}
                  name={m.name}
                  shortName={cardName(m)}
                  element={m.element}
                  role={m.role}
                  roleName={roleName(m.role)}
                  level={m.level}
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
      {sheetMerc && (
        <Sheet title={sheetMerc.name} onClose={() => setSheet(null)}>
          {inParty(sheetMerc.id) ? (
            <>
              {(['front', 'back'] as Row[])
                .filter((row) => row !== inParty(sheetMerc.id)!.row)
                .map((row) => (
                  <button
                    key={row}
                    className="btn-act"
                    disabled={rowCount(row) >= maxPerRow}
                    onClick={() => (setParty(party.map((p) => (p.mercId === sheetMerc.id ? { ...p, row } : p))), setSheet(null))}
                  >
                    {rowName[row]}로 옮기기
                  </button>
                ))}
              <button className="btn-act" onClick={() => (setParty(party.filter((p) => p.mercId !== sheetMerc.id)), setSheet(null))}>
                파티에서 빼기
              </button>
            </>
          ) : assignedFacility(s.facilities, sheetMerc.id) && !sheetMerc.injury && !isOnExpedition(s, sheetMerc.id) ? (
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
