import { useState } from 'react';
import { getSkill, tables } from '../../data';
import {
  canLevelUp,
  expToNextLevel,
  GameError,
  isOnExpedition,
  levelUp,
  levelUpCost,
  paySalaryBonus,
  salaryBonusCost,
  LEVEL_UP_BLOCKED_ON_EXPEDITION,
  mercToUnit,
  recruit,
  recruitInfo,
  recruitUpkeepOutlook,
  upkeepPerDay,
  assignToFacility,
  unassignFromFacility,
} from '../../engine/game';
import { trainingAccess } from '../../engine/status';
import { AppShell } from '../AppShell';
import { Bar, ConfirmDialog, ElementTag, LoyaltyBadge, Panel, RoleTag } from '../components';
import { loyaltyDisplay, loyaltyTier, tendencyOf } from '../../engine/loyalty';
import { assignedFacility, getFacility } from '../../engine/facilities';
import { injuryText, loyaltyReasonName, backgroundShort, cityName, factionName, growthSpeedName, num, tierName, worldName } from '../format';
import type { Ctx } from '../nav';

const SKILL_DESC: Record<string, string> = {
  enemy: '적 하나',
  enemyRow: '적 한 열',
  enemyAll: '적 전체',
  self: '자신',
  allyLowest: '체력이 가장 낮은 아군',
  allyAll: '아군 전체',
};

export function MercDetail({ ctx, mercId }: { ctx: Ctx; mercId: string }) {
  const s = ctx.game.state;
  const [confirm, setConfirm] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const m = s.mercenaries.find((x) => x.id === mercId);
  if (!m) return null;
  const unit = mercToUnit(tables, m);
  const need = expToNextLevel(tables, m.level, m.growth.speed);
  const cost = levelUpCost(tables, m.level);
  const capped = m.level >= m.growth.cap;
  const isGuild = m.affiliation.kind === 'guild';
  const onExpedition = isOnExpedition(s, m.id);
  const info = recruitInfo(tables, s, m.id);
  const outlook = recruitUpkeepOutlook(tables, s, m.id);
  const tendency = tendencyOf(tables, m.profile.background);
  const speed = tables.growthSpeeds.find((g) => g.id === m.growth.speed);

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const status = m.injury
    ? injuryText(m.injury)
    : isOnExpedition(s, m.id)
      ? '파견 중'
      : assignedFacility(s.facilities, m.id)
        ? `${getFacility(tables, assignedFacility(s.facilities, m.id)!).name} 배치 중`
        : isGuild
        ? '길드 · 대기'
        : m.affiliation.kind === 'faction'
          ? factionName(m.affiliation.factionId)
          : '';

  const unlockText =
    info.unlock &&
    (info.unlock.type === 'totalVictories'
      ? `리프트 공략 성공 ${info.unlock.count}회`
      : `${tierName(info.unlock.tier)} 공략 성공 ${info.unlock.count}회`);

  let footer = null;
  if (isGuild) {
    footer = (
      <button
        className="btn primary block"
        disabled={!canLevelUp(tables, s, m.id)}
        onClick={() =>
          run(() => {
            ctx.setState(levelUp(tables, s, m.id));
            ctx.toast(`${m.name} Lv${m.level + 1}`);
          })
        }
      >
        {onExpedition
          ? LEVEL_UP_BLOCKED_ON_EXPEDITION
          : capped
          ? '성장 한계에 도달'
          : m.exp < need
            ? `레벨업: 경험치 ${m.exp}/${need}`
            : `레벨업 (아르케 ${num(cost)}${s.resources.arche < cost ? ' 부족' : ''})`}
      </button>
    );
  } else if (info.eligible) {
    footer = (
      <button className="btn primary block" disabled={!info.unlocked || s.resources.zero < info.cost} onClick={() => setConfirm(true)}>
        {!info.unlocked
          ? `잠김: ${unlockText} (${info.progress?.current}/${info.progress?.required})`
          : `영입 (제로 ${num(info.cost)}${s.resources.zero < info.cost ? ' 부족' : ''})`}
      </button>
    );
  }

  return (
    <AppShell title={m.name} subtitle={status} onBack={() => ctx.go({ name: 'mercs' })} footer={footer}>
      <Panel>
        <div className="tags">
          <ElementTag id={m.element} />
          <RoleTag id={m.role} />
          {m.isProtagonist && <span className="pill small">주인공</span>}
        </div>
        <div className="kv">
          <span>레벨</span>
          <span className="strong">{m.level}</span>
          <span>성장 한계</span>
          <span className="strong">{m.growth.cap}</span>
          <span>성장 속도</span>
          <span>
            {growthSpeedName(m.growth.speed)} <span className="muted small">(필요 경험치 ×{speed?.expToNextMultiplier})</span>
          </span>
          <span>최초 레벨</span>
          <span>{m.initialLevel}</span>
          {upkeepPerDay(tables, m) > 0 && (
            <>
              <span>하루 유지비</span>
              <span>제로 {num(upkeepPerDay(tables, m))}</span>
            </>
          )}
        </div>
        {isGuild && (
          <>
            <div className="small muted">
              경험치 {m.exp} / {need}
            </div>
            <Bar value={m.exp} max={need} kind="exp" />
          </>
        )}
        {m.unpaidUpkeep && (
          <p className="small warn">
            유지비 미납 {m.unpaidUpkeep.days}일 · 제로 {num(m.unpaidUpkeep.zero)}
          </p>
        )}
      </Panel>

      {isGuild && m.loyalty && (
        <Panel title="충성도" action={<LoyaltyBadge value={m.loyalty.value} />}>
          <div className="small">
            <span className="strong">{loyaltyDisplay(m.loyalty.value)}</span>
            <span className="muted"> / {tables.loyalty.range[1]}</span>
            {(() => {
              const tier = loyaltyTier(tables, m.loyalty!.value);
              return tier.statBonus !== 0 ? (
                <span className={tier.statBonus > 0 ? 'ok' : 'warn'}>
                  {' '}
                  · 공격·방어 {tier.statBonus > 0 ? '+' : ''}
                  {Math.round(tier.statBonus * 100)}%
                </span>
              ) : null;
            })()}
          </div>
          <Bar value={m.loyalty.value} max={tables.loyalty.range[1]} />
          {loyaltyTier(tables, m.loyalty.value).warn && (
            <p className="warn small" role="status">
              {loyaltyTier(tables, m.loyalty.value).refuseChance > 0
                ? `충성도가 위험합니다. 파견을 거부할 수 있고, ${tables.loyalty.departure.afterConsecutiveDays}일 넘게 이어지면 길드를 떠날 수 있습니다.`
                : '충성도가 낮아 전투 능력이 줄었습니다.'}
            </p>
          )}
          <button
            className="btn block"
            disabled={m.loyalty.bonusDay === s.day || s.resources.zero < salaryBonusCost(tables, m)}
            onClick={() =>
              run(() => {
                ctx.setState(paySalaryBonus(tables, s, m.id));
                ctx.toast(`${m.name}에게 급료 보너스를 줬습니다.`);
              })
            }
          >
            {m.loyalty.bonusDay === s.day
              ? '오늘 급료 보너스를 줬습니다'
              : `급료 보너스 (제로 ${num(salaryBonusCost(tables, m))}${s.resources.zero < salaryBonusCost(tables, m) ? ' 부족' : ''})`}
          </button>
          {m.loyalty.refusedOnDay === s.day && <p className="bad small">오늘은 파견을 거부했습니다.</p>}
          {m.loyalty.restStreak > 0 && (
            <p className={`small ${m.loyalty.restStreak > tables.loyalty.restMaxDays ? 'warn' : 'muted'}`}>
              대기 {m.loyalty.restStreak}일
              {m.loyalty.restStreak > tables.loyalty.restMaxDays
                ? ` · ⚠ 대기 하락 중(출전 없이 ${tables.loyalty.restMaxDays}일을 넘김)`
                : ` · 쉬는 날 상승(${tables.loyalty.restMaxDays}일까지)`}
            </p>
          )}
          {m.loyalty.recent.length > 0 && (() => {
            // 최신 기록 몇 줄만 보이고 나머지는 펼쳐서 본다(지시서 014).
            const all = [...m.loyalty!.recent].reverse();
            const shown = logOpen ? all : all.slice(0, tables.ui.loyaltyLogPreview);
            return (
              <>
                <ul className="loyalty-log" aria-label="최근 충성도 기록">
                  {shown.map((r, i) => (
                    <li key={i} className="small">
                      <span className="muted">{r.day}일차</span> {loyaltyReasonName[r.reason] ?? r.reason}{' '}
                      <span className={r.delta >= 0 ? 'ok' : 'warn'}>
                        {r.delta >= 0 ? '+' : ''}
                        {r.delta}
                      </span>
                    </li>
                  ))}
                </ul>
                {all.length > tables.ui.loyaltyLogPreview && (
                  <button className="link more-toggle" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
                    {logOpen ? '기록 접기 ▴' : `기록 ${all.length - tables.ui.loyaltyLogPreview}줄 더 보기 ▾`}
                  </button>
                )}
              </>
            );
          })()}
        </Panel>
      )}

      {isGuild && !m.isProtagonist && (() => {
        const t = trainingAccess(tables, s, m.id);
        if (!t.facilityId) return null;
        const fname = getFacility(tables, t.facilityId).name;
        return (
          <Panel title={fname} action={t.built ? <span className="muted small">칸 {t.used}/{t.slots}</span> : undefined}>
            {!t.built ? (
              <>
                <p className="small muted">거점에서 {fname}를 건설하면 배치할 수 있습니다.</p>
                <button className="btn block" onClick={() => ctx.go({ name: 'base' })}>
                  거점으로 ›
                </button>
              </>
            ) : t.assigned ? (
              <>
                <p className="small">
                  배치 중 · 하루 경험치 +{num(t.expPerDay)} · 배치 중에는 파견할 수 없습니다.
                </p>
                <button
                  className="btn block"
                  onClick={() =>
                    run(() => {
                      ctx.setState(unassignFromFacility(s, t.facilityId!, m.id));
                      ctx.toast(`${m.name} ${fname} 배치 해제`);
                    })
                  }
                >
                  배치 해제
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn block"
                  disabled={!!t.reason}
                  onClick={() =>
                    run(() => {
                      ctx.setState(assignToFacility(tables, s, t.facilityId!, m.id));
                      ctx.toast(`${m.name} ${fname}에 배치`);
                    })
                  }
                >
                  {t.reason ? `${fname}에 배치할 수 없음 · ${t.reason}` : `${fname}에 배치 (하루 경험치 +${num(t.expPerDay)})`}
                </button>
              </>
            )}
          </Panel>
        );
      })()}


      <Panel title="프로필">
        <div className="kv">
          {m.profile.age !== undefined && (
            <>
              <span>나이</span>
              <span>{m.profile.age}세</span>
            </>
          )}
          {m.profile.gender && (
            <>
              <span>성별</span>
              <span>{m.profile.gender}</span>
            </>
          )}
          {m.profile.hometown && (
            <>
              <span>고향</span>
              <span>{cityName(m.profile.hometown)}</span>
            </>
          )}
          <span>배경</span>
          <span>{backgroundShort(m.profile.background)}</span>
          {!m.isProtagonist && tendency && (
            <>
              <span>계약 성향</span>
              <span>
                {tendency.name}형 <span className="muted small">· {tendency.description}</span>
              </span>
            </>
          )}
          <span>세계</span>
          <span>{worldName(m.profile.world)}</span>
          {!isGuild && m.affiliation.kind === 'faction' && (
            <>
              <span>소속</span>
              <span>{factionName(m.affiliation.factionId)}</span>
            </>
          )}
        </div>
        {!isGuild && info.eligible && unlockText && (
          <p className={`small ${info.unlocked ? 'ok' : 'muted'}`}>
            영입 조건: {unlockText} ({info.progress?.current}/{info.progress?.required})
          </p>
        )}
      </Panel>

      <Panel title="능력치">
        <div className="kv">
          {tables.stats.stats.map((st) => (
            <span key={st.id} className="contents">
              <span>{st.name}</span>
              <span className="strong">{unit.stats[st.id]}</span>
            </span>
          ))}
        </div>
      </Panel>
      <Panel title="스킬">
        <ul className="rows">
          {unit.skills.map((id, i) => {
            const sk = getSkill(tables, id);
            return (
              <li key={id} className="row-item">
                <div>
                  <div className="strong">
                    {sk.name} <span className="muted small">{i === 0 ? '기본 공격' : `쿨다운 ${sk.cooldown}`}</span>
                  </div>
                  <div className="muted small">
                    {SKILL_DESC[sk.target]}
                    {sk.power ? ` · 위력 ${sk.power}${sk.hits ? `×${sk.hits}` : ''}` : ''}
                    {sk.kind === 'taunt' ? ` · 도발 ${sk.duration}라운드` : ''}
                    {sk.kind === 'buff' ? ` · ${sk.stat === 'atk' ? '공격' : '방어'} +${Math.round((sk.amount ?? 0) * 100)}% ${sk.duration}라운드` : ''}
                    {sk.kind === 'heal' ? ' · 회복' : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="hint">스킬 속성은 용병 속성을 따릅니다.</p>
      </Panel>

      {confirm && (
        <ConfirmDialog
          title={`${m.name} 영입`}
          message={
            <div className="kv">
              <span>영입비</span>
              <span className="strong">제로 {num(outlook.cost)}</span>
              <span>남는 제로</span>
              <span>{num(outlook.zeroAfter)}</span>
              <span>길드 하루 유지비</span>
              <span>
                {num(outlook.dailyUpkeepBefore)} → <span className="strong">{num(outlook.dailyUpkeepAfter)}</span>
              </span>
              <span>수입 없이 버틸 일수</span>
              <span className={outlook.daysAffordable < tables.ui.upkeepWarnDays ? 'warn strong' : 'strong'}>
                {Number.isFinite(outlook.daysAffordable) ? `${outlook.daysAffordable}일` : '제한 없음'}
              </span>
            </div>
          }
          confirmLabel="영입"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            run(() => {
              ctx.setState(recruit(tables, s, m.id));
              ctx.toast(`${m.name}이(가) 길드에 합류했습니다.`);
            });
          }}
        />
      )}
    </AppShell>
  );
}
