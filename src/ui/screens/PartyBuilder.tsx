import { useMemo, useState } from 'react';
import { getRole, tables, travelDays, type Row } from '../../data';
import { autoParty } from '../../engine/autoParty';
import { combatPower, estimateRisk } from '../../engine/combatPower';
import { assignedFacility, getFacility, visibleRift } from '../../engine/facilities';
import { compositionMultiplier, elementMultiplier } from '../../engine/combat';
import { dispatch, unassignFromFacility, expPerMemberAt, GameError, guildUpkeepPerDay, mercToUnit, shareOf, isAvailable, isOnExpedition, refusedToday, type PartyMember } from '../../engine/game';
import { AppShell } from '../AppShell';
import { ElementTag, RoleTag, RiskLabel } from '../components';
import { elementName, num, pct, rowName, term, josa, withJosa } from '../format';
import type { Ctx } from '../nav';
import { RiftCard } from './RiftList';

const GROUP_NAME: Record<string, string> = { vanguard: '전위', damage: '딜러', support: '지원' };
const fmtRange = (r: [number, number]) => (r[0] === r[1] ? num(r[0]) : `${num(r[0])}~${num(r[1])}`);

export function PartyBuilder({ ctx, riftId }: { ctx: Ctx; riftId: string }) {
  const s = ctx.game.state;
  const rift = s.rifts.find((r) => r.id === riftId);
  const [party, setParty] = useState<PartyMember[]>([]);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const { maxSize } = tables.combat.party;

  // 전투력과 예상 위험도: 편성이 바뀔 때만 다시 계산한다(같은 입력은 엔진에서도 메모이제이션).
  // 위험도는 탐지소로 보이는 정보만 쓴다.
  const risk = useMemo(() => {
    if (!rift) return null;
    const slots = party
      .filter((p) => s.mercenaries.some((m) => m.id === p.mercId))
      .map((p) => ({ unit: mercToUnit(tables, s.mercenaries.find((m) => m.id === p.mercId)!), row: p.row }));
    return { power: combatPower(tables, slots), estimate: estimateRisk(tables, slots, visibleRift(tables, s.facilities, rift)) };
  }, [party, rift, s.mercenaries, s.facilities]);

  if (!rift) {
    return (
      <AppShell title="파티 편성" onBack={() => ctx.go({ name: 'rifts' })}>
        <p className="muted">리프트가 사라졌습니다.</p>
      </AppShell>
    );
  }

  const merc = (id: string) => s.mercenaries.find((m) => m.id === id)!;
  const candidates = s.mercenaries.filter((m) => m.affiliation.kind === 'guild');
  const slot = (id: string) => party.find((p) => p.mercId === id);
  const unavailableReason = (m: (typeof candidates)[number]) =>
    refusedToday(s, m)
      ? '오늘 거부'
      : m.injury
        ? `${m.injury.recoverDay}일차부터 출전`
        : isOnExpedition(s, m.id)
          ? '파견 중'
          : assignedFacility(s.facilities, m.id)
            ? `${getFacility(tables, assignedFacility(s.facilities, m.id)!).name} 배치`
            : '불가';
  // 이미 짜 둔 파티에 오늘 쓸 수 없게 된 용병이 있으면 빼고 알린다(거부 판정은 하루 시작 때 정해진다).
  const dropped = party.filter((p) => !isAvailable(s, p.mercId));
  const trainees = candidates.filter((m) => assignedFacility(s.facilities, m.id));

  const toggle = (id: string) => {
    setError('');
    if (slot(id)) setParty(party.filter((p) => p.mercId !== id));
    else if (party.length < maxSize) setParty([...party, { mercId: id, row: getRole(tables, merc(id).role).defaultRow }]);
  };
  const setRow = (id: string, row: Row) => setParty(party.map((p) => (p.mercId === id ? { ...p, row } : p)));

  const roles = party.map((p) => merc(p.mercId).role);
  const comp = compositionMultiplier(tables, roles);
  const groups = new Set(roles.map((r) => getRole(tables, r).group));
  const missing = tables.combat.composition.groups.filter((g) => !groups.has(g));
  const travel = travelDays(tables, s.baseCityId, rift.cityId);
  // 소요 일수는 리프트마다 확정값이라 복귀일도 확정값이다.
  const returnDay = s.day + travel * 2 + rift.durationDays;
  // 상성 안내도 탐지소로 보이는 속성만 쓴다.
  const enemyElements = visibleRift(tables, s.facilities, rift).elements ?? [];
  // 예상 경험치(한 명당, 승리 기준). 탐지소로 보이는 몬스터 레벨 범위로 계산해 숨은 레벨이 새지 않게 한다.
  const vis = visibleRift(tables, s.facilities, rift);
  const expPreview = (() => {
    const n = Math.max(1, party.length);
    const lo = shareOf(tables, expPerMemberAt(tables, rift.tier, 'victory', vis.level[0]), n);
    const hi = shareOf(tables, expPerMemberAt(tables, rift.tier, 'victory', vis.level[1]), n);
    const v = lo === hi ? `${lo}` : `${lo}~${hi}`;
    return `한 명당 ${v}${party.length ? ` (${party.length}명, 승리 시)` : ' (1명 기준, 승리 시)'}`;
  })();
  const front = party.filter((p) => p.row === 'front').map((p) => merc(p.mercId).name);
  const back = party.filter((p) => p.row === 'back').map((p) => merc(p.mercId).name);

  const send = () => {
    try {
      ctx.setState(dispatch(tables, s, rift.id, party.filter((p) => isAvailable(s, p.mercId))));
      ctx.toast(`${rift.name}에 파견했습니다. ${returnDay}일차에 복귀합니다.`);
      ctx.go({ name: 'home' });
    } catch (e) {
      setError(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  return (
    <AppShell
      title="파티 편성"
      subtitle={rift.name}
      onBack={() => ctx.go({ name: 'rifts', cityId: rift.cityId })}
      footer={
        <button className="btn primary block" disabled={party.length === 0} onClick={send}>
          {party.length ? `파견 (${party.length}명 · ${returnDay}일차 복귀)` : `${withJosa(term.merc, '을/를')} 고르세요`}
        </button>
      }
    >
      <RiftCard rift={rift} day={s.day} baseCityId={s.baseCityId} facilities={s.facilities} compact />

      <section className="panel party-summary" aria-live="polite">
        {/* 첫 화면 우선: 위험도, 복귀일, 한 명당 경험치. 나머지는 "자세히"로 펼친다. */}
        <div className="summary-grid">
          <span className="muted small">예상 위험도</span>
          <span className={risk && party.length ? '' : 'muted'}>
            {!risk || party.length === 0 ? `${withJosa(term.merc, '을/를')} 넣으면 보입니다` : <RiskLabel best={risk.estimate.best} worst={risk.estimate.worst} />}
            {risk && party.length > 0 && risk.estimate.estimated && <span className="muted small"> (추정)</span>}
          </span>
          <span className="muted small">복귀 예정</span>
          <span className="strong">
            {returnDay}일차 <span className="muted small">({returnDay - s.day}일 뒤{travel ? `, 이동 왕복 ${travel * 2}일 포함` : ''})</span>
          </span>
          <span className="muted small">예상 경험치</span>
          <span>{expPreview}</span>
          <span className="muted small">
            배치 {party.length}/{maxSize}
          </span>
          <span className={`ellipsis ${party.length && comp < 1 ? 'warn' : ''}`}>
            {party.length === 0 ? <span className="muted">비어 있음</span> : `구성 ${pct(comp - 1)}${missing.length ? ` · 없음: ${missing.map((g) => GROUP_NAME[g] ?? g).join(', ')}` : ''}`}
          </span>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => (setError(''), setParty(autoParty(tables, s, rift)))}>
            자동 편성
          </button>
          <button className="btn" disabled={party.length === 0} onClick={() => setParty([])}>
            비우기
          </button>
        </div>
        <button className="btn block details-toggle" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
          <span>자세히</span>
          <span className="muted small">전투력·유지비·도움말 {showDetails ? '▴' : '▾'}</span>
        </button>
        {showDetails && (
          <div className="summary-grid">
            <span className="muted small">전투력</span>
            <span>
              {risk ? num(risk.power) : '-'} <span className="muted small">/ 상대 추정 {risk ? fmtRange(risk.estimate.enemyPower) : '-'}</span>
            </span>
            <span className="muted small">길드 하루 유지비</span>
            <span>제로 {num(guildUpkeepPerDay(tables, s))}</span>
            <span className="muted small">열 배치</span>
            <span className="ellipsis">
              {rowName.front} {front.length ? front.join(', ') : '-'} / {rowName.back} {back.length ? back.join(', ') : '-'}
            </span>
            <span className="muted small">도움말</span>
            <span className="small muted">
              예상 위험도는 보이는 정보로 여러 번 모의 전투한 결과이며, 실제 전투에는 변수가 있어 보장되지 않습니다. 탭해서 넣고 빼며, 넣은 {term.merc}{josa(term.merc, '은', '는')} 오른쪽에서
              열을 고릅니다. 기본 위치가 아닌 열은 주는 피해가 줄고 받는 피해가 늡니다.
            </span>
          </div>
        )}
      </section>

      {trainees.length > 0 && (
        <section className="panel" aria-label={`훈련 중인 ${term.merc}`}>
          <p className="small muted">훈련 중 {trainees.length}명은 파견할 수 없습니다. 해제하면 오늘 편성에 넣을 수 있습니다(오늘 훈련 경험치는 받지 않음).</p>
          {trainees.map((m) => {
            const fid = assignedFacility(s.facilities, m.id)!;
            return (
              <div key={m.id} className="trainee-row">
                <span className="small">
                  <span className="strong">{m.name}</span> <span className="muted">Lv{m.level} · {getFacility(tables, fid).name}</span>
                </span>
                <button
                  className="btn small"
                  onClick={() => {
                    ctx.setState(unassignFromFacility(s, fid, m.id));
                    ctx.toast(`${m.name} 배치 해제`);
                  }}
                >
                  지금 해제
                </button>
              </div>
            );
          })}
        </section>
      )}
      {dropped.length > 0 && (
        <p className="warn small" role="status">
          {dropped.map((p) => merc(p.mercId).name).join(', ')}은(는) 오늘 파견할 수 없어 파티에서 빠집니다.
        </p>
      )}

      <ul className="rows candidate-list">
        {candidates.map((m) => {
          const free = isAvailable(s, m.id);
          const sel = slot(m.id);
          const strong = enemyElements.filter((el) => elementMultiplier(tables, m.element, el) > 1);
          const weak = enemyElements.filter((el) => elementMultiplier(tables, m.element, el) < 1);
          const off = sel && getRole(tables, m.role).defaultRow !== sel.row;
          return (
            <li key={m.id} className={`candidate ${sel ? 'selected' : ''}`}>
              <button
                className="candidate-main"
                disabled={!free || (!sel && party.length >= maxSize)}
                onClick={() => toggle(m.id)}
                aria-pressed={!!sel}
              >
                <span className="strong">
                  {m.name} <span className="muted small">Lv{m.level}</span>
                </span>
                <span className="tags">
                  <ElementTag id={m.element} />
                  <RoleTag id={m.role} />
                  {strong.length > 0 && <span className="small ok">{strong.map(elementName).join('·')}에 유리</span>}
                  {weak.length > 0 && <span className="small warn">{weak.map(elementName).join('·')}에 불리</span>}
                  {off && <span className="small warn">기본 위치 아님</span>}
                  {!free && <span className="small muted">{unavailableReason(m)}</span>}
                </span>
              </button>
              <div className="candidate-side">
                {sel ? (
                  <div className="row-switch" role="group" aria-label={`${m.name} 열`}>
                    {(['front', 'back'] as Row[]).map((row) => (
                      <button key={row} className={sel.row === row ? 'on' : ''} aria-pressed={sel.row === row} onClick={() => setRow(m.id, row)}>
                        {rowName[row]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={`pill ${refusedToday(s, m) ? 'bad' : ''}`}>{free ? '추가' : unavailableReason(m)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </AppShell>
  );
}
