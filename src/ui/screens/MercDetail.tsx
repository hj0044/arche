/**
 * 계약자 상세(시안 MercDetail, 지시서 017·020·021). 구역 순서: header · identity · coreStats · subStats · growth · skills · traits · actions.
 * 영웅 그림 아래(스탯~특성)는 스크롤(merc.scroll), 헤더와 하단 버튼은 고정이다.
 * 시안에 자리가 없는 프로필(이름 영역), 충성도 기록·급료 보너스(충성도 칸), 훈련 배치(훈련 버튼)는 바텀 시트로 흡수했다.
 */
import { useState } from 'react';
import { getRole, getSkill, tables } from '../../data';
import {

  expToNextLevel,
  GameError,
  isOnExpedition,
  levelUp,
  levelUpCost,
  paySalaryBonus,
  salaryBonusCost,
  LEVEL_UP_BLOCKED_ON_EXPEDITION,
  mercToUnit,
  mercTraitIds,
  mercGrowthRates,
  newTraitsOnLevelUp,
  recruit,
  recruitInfo,
  recruitUpkeepOutlook,
  upkeepPerDay,
  assignToFacility,
  unassignFromFacility,
} from '../../engine/game';
import { trainingAccess } from '../../engine/status';
import { Gauge, Portrait, Sheet, StatRow, TextWithStatus, TraitRow } from '../components';
import { Icon } from '../components';
import { loyaltyDisplay, loyaltyTier, tendencyOf } from '../../engine/loyalty';
import { allyAuraRows, computeEffectiveStats, getTrait, growthStars } from '../../engine/stats';
import { assignedFacility, getFacility } from '../../engine/facilities';
import { injuryText, loyaltyReasonName, backgroundShort, cityName, factionName, num, tierName, worldName, term, statValue, traitName, traitCategoryName, roleName, elementName, statName } from '../format';
import { statBarMax } from '../mercInfo';
import type { Ctx } from '../nav';


export function MercDetail({ ctx, mercId }: { ctx: Ctx; mercId: string }) {
  const s = ctx.game.state;
  const [sheet, setSheet] = useState<null | 'profile' | 'loyalty' | 'training' | 'recruit'>(null);
  const [logOpen, setLogOpen] = useState(false);
  const m = s.mercenaries.find((x) => x.id === mercId);
  if (!m) return null;
  const unit = mercToUnit(tables, m);
  // 레벨당 성장률(지시서 021): 계약자 값, 없으면 기본값
  const rates = { ...tables.stats.levelGrowthRate, ...mercGrowthRates(tables, m) };
  // 최종 스탯 계산 한 곳(stats.ts): 전투 시작 상황, 체력 가득, 기본 열
  const finalStats = computeEffectiveStats(tables, unit, { round: 1, hpRatio: 1, row: getRole(tables, m.role).defaultRow, allyAuras: allyAuraRows(tables, unit) });
  // 특성 슬롯: 해금 레벨이 성장 한계 이하이고 데이터에 특성이 있는 칸
  const ids = mercTraitIds(tables, m);
  const traitSlots = tables.traits.slotUnlockLevels
    .map((level, slot) => ({ slot, level, id: ids[slot], unlocked: m.level >= level && !!ids[slot] }))
    .filter((x) => x.id && x.level <= m.growth.cap);
  const unlockedCount = traitSlots.filter((t) => t.unlocked).length;
  const nextSlot = traitSlots.find((t) => !t.unlocked);
  const need = expToNextLevel(tables, m.level);
  const cost = levelUpCost(tables, m.level);
  const capped = m.level >= m.growth.cap;
  const isGuild = m.affiliation.kind === 'guild';
  const onExpedition = isOnExpedition(s, m.id);
  const info = recruitInfo(tables, s, m.id);
  const outlook = recruitUpkeepOutlook(tables, s, m.id);
  const tendency = tendencyOf(tables, m.profile.background);
  const training = isGuild ? trainingAccess(tables, s, m.id) : null;

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const status = m.injury
    ? injuryText(m.injury)
    : onExpedition
      ? '파견 중'
      : assignedFacility(s.facilities, m.id)
        ? `${getFacility(tables, assignedFacility(s.facilities, m.id)!).name} 배치 중`
        : isGuild
          ? '대기'
          : '';
  const affiliation = isGuild ? s.guildName : m.affiliation.kind === 'faction' ? factionName(m.affiliation.factionId) : '무소속';
  const idLine = [m.profile.hometown ? cityName(m.profile.hometown) : null, affiliation, backgroundShort(m.profile.background)].filter(Boolean).join(' · ');

  const unlockText =
    info.unlock &&
    (info.unlock.type === 'totalVictories' ? `리프트 공략 성공 ${info.unlock.count}회` : `${tierName(info.unlock.tier)} 공략 성공 ${info.unlock.count}회`);

  const stat = (id: 'hp' | 'spd' | 'pAtk' | 'eAtk' | 'pDef' | 'eDef') => ({
    name: tables.stats.stats.find((x) => x.id === id)!.name,
    value: statValue(id, finalStats[id]),
    ratio: Math.min(1, finalStats[id] / statBarMax(tables, id, m.level)),
    color: `var(--stat-${id})`,
  });
  const sub = (id: 'crit' | 'critDmg' | 'eva') => {
    const v = finalStats[id];
    // 시안은 치명타 피해율도 %로 쓴다(×1.5 → 150%)
    return { name: tables.stats.stats.find((x) => x.id === id)!.name, value: id === 'critDmg' ? `${Math.round(v * 100)}%` : statValue(id, v) };
  };
  const tier = m.loyalty ? loyaltyTier(tables, m.loyalty.value) : null;

  const levelLabel = onExpedition
    ? LEVEL_UP_BLOCKED_ON_EXPEDITION
    : capped
      ? '성장 한계에 도달'
      : m.exp < need
        ? `레벨업 (경험치 ${num(m.exp)}/${num(need)})`
        : `레벨업 (아르케 ${num(cost)})`;
  const doLevelUp = () =>
    run(() => {
      if (s.resources.arche < cost && m.exp >= need && !capped && !onExpedition) return ctx.toast(`아르케가 부족합니다 (필요 ${num(cost)})`);
      ctx.setState(levelUp(tables, s, m.id));
      const fresh = newTraitsOnLevelUp(tables, m, m.level, m.level + 1);
      ctx.toast(`${m.name} Lv${m.level + 1}${fresh.length ? ` · 새 특성: ${fresh.map(traitName).join(', ')}` : ''}`);
    });

  return (
    <div className="scr" data-screen="merc">
      <main className="scr-body shell-body" style={{ overflow: 'hidden' }}>
        <div className="md-hero">
          <Portrait id={m.id} element={m.element} role={m.role} fill />
          <div className="md-hero-shade" />
          <button className="md-back" aria-label="뒤로" data-ui="MercDetail.header" onClick={() => ctx.go({ name: 'mercs' })}>
            <Icon name="back" />
          </button>
          <button className="md-id" data-ui="MercDetail.identity" aria-label={`${m.name} 프로필`} onClick={() => setSheet('profile')}>
            <span className="col" style={{ gap: 3, minWidth: 0 }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="md-chip" style={{ ['--chip' as string]: 'var(--c-info)' }}>
                  {roleName(m.role)}
                </span>
                <span className="md-chip" data-el={m.element} style={{ ['--chip' as string]: 'var(--el)' }}>
                  {elementName(m.element)}
                </span>
                <span className="md-chip" style={{ ['--chip' as string]: 'var(--c-gold)' }}>
                  성장 한계 {m.growth.cap}
                </span>
              </span>
              <span className="md-name">{m.name}</span>
              <span className="ellipsis" style={{ fontSize: 12, color: 'var(--c-text-banner)' }}>
                {idLine}
              </span>
            </span>
            <span className="md-lv">
              {m.level}
              <span>/{m.growth.cap}</span>
            </span>
          </button>
        </div>
        <div className="md-scroll" data-ui="merc.scroll">
        <div className="md-scroll-in" data-role="page">
          <Gauge ratio={capped ? 1 : m.exp / need} size="h6" color="linear-gradient(90deg, var(--c-ok), var(--c-gold))" />
          <div className="col" style={{ gap: 6 }} data-ui="MercDetail.coreStats">
            <StatRow items={[stat('hp'), stat('spd')]} />
            <StatRow items={[stat('pAtk'), stat('eAtk')]} />
            <StatRow items={[stat('pDef'), stat('eDef')]} />
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'stretch' }} data-ui="MercDetail.subStats">
            {(['crit', 'critDmg', 'eva'] as const).map((id) => {
              const x = sub(id);
              return (
                <div key={id} className="stat-sm">
                  <span>{x.name}</span>
                  <b>{x.value}</b>
                </div>
              );
            })}
            <button className="md-sub-btn" aria-label="충성도 자세히" disabled={!m.loyalty} onClick={() => setSheet('loyalty')}>
              <span className="stat-sm" style={{ display: 'flex' }}>
                <span>충성도</span>
                <b style={tier?.warn ? { color: 'var(--c-warn)' } : undefined}>{tier ? tier.name : '—'}</b>
              </span>
            </button>
          </div>
          {/* 지시서 021: 성장률(핵심 6스탯, 별 5단계 + 레벨당 %) */}
          <div className="col" style={{ gap: 6 }} data-ui="MercDetail.growth">
            <div className="row between" style={{ alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>성장률</span>
              <span className="sub">★★★ = 기본 · 레벨당 증가</span>
            </div>
            {(
              [
                ['hp', 'spd'],
                ['pAtk', 'eAtk'],
                ['pDef', 'eDef'],
              ] as const
            ).map((pair) => (
              <div key={pair[0]} className="row" style={{ gap: 6 }}>
                {pair.map((id) => {
                  const rate = rates[id];
                  const stars = growthStars(tables, id, rate);
                  return (
                    <div key={id} className="growth-cell" data-stat={id} data-stars={stars}>
                      <div className="row between">
                        <span className="nm">{statName(id)}</span>
                        <span className="stars" aria-label={`별 ${stars}개`}>
                          <span className="on">{'★'.repeat(stars)}</span>
                          <span className="off">{'★'.repeat(5 - stars)}</span>
                        </span>
                      </div>
                      <span className="val">
                        <b>+{(rate * 100).toFixed(2)}%</b> <span>/ 레벨</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* 지시서 020: 스킬(기본 공격 1 + 액티브 3) */}
          <div className="col" style={{ gap: 6 }} data-ui="MercDetail.skills">
            <div className="row between" style={{ alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>스킬</span>
              <span className="sub">
                기본 공격 1 · 액티브 {unit.skills.length - 1}
              </span>
            </div>
            {unit.skills.map((id, i) => {
              const sk = getSkill(tables, id);
              const basic = i === 0;
              return (
                <div key={id} className="skill-row" style={{ ['--kind' as string]: basic ? 'var(--trait-common)' : 'var(--trait-role)' }}>
                  <span className="kind">{basic ? '기본' : '액티브'}</span>
                  <div className="col grow" style={{ minWidth: 0 }}>
                    <span className="nm">{sk.name}</span>
                    <span className="ds">
                      <TextWithStatus text={sk.description ?? ''} />
                    </span>
                  </div>
                  <span className={`cd ${sk.cooldown ? '' : 'none'}`}>{sk.cooldown ? `쿨 ${sk.cooldown}` : '쿨 없음'}</span>
                </div>
              );
            })}
          </div>
          <div className="col" style={{ gap: 6 }} data-ui="MercDetail.traits">
            <div className="row between" style={{ alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>특성</span>
              <span className="sub">
                {unlockedCount} / {traitSlots.length} 해금{nextSlot ? ` · 다음 Lv ${nextSlot.level}` : ''}
              </span>
            </div>
            {traitSlots.map((t) => {
              const tr = getTrait(tables, t.id);
              return (
                <TraitRow
                  key={t.slot}
                  category={tr.category}
                  kindName={traitCategoryName[tr.category] ?? tr.category}
                  name={tr.name}
                  description={tr.description}
                  level={t.level}
                  locked={!t.unlocked}
                />
              );
            })}
          </div>
        </div>
        <div className="md-scroll-fade" />
        </div>
      </main>
      <div className="foot" style={{ paddingTop: 0, paddingBottom: 12 }} data-ui="MercDetail.actions">
        {isGuild ? (
          <>
            <button className="btn-act" style={{ width: '30%', flex: 'none', fontSize: 15, fontWeight: 500 }} disabled={!training} onClick={() => setSheet('training')}>
              훈련
            </button>
            <button className="btn-big" style={{ height: 48, fontSize: 15 }} disabled={onExpedition || capped || m.exp < need} onClick={doLevelUp}>
              {levelLabel}
            </button>
          </>
        ) : info.eligible ? (
          <button className="btn-big" style={{ height: 48, fontSize: 15 }} disabled={!info.unlocked || s.resources.zero < info.cost} onClick={() => setSheet('recruit')}>
            {!info.unlocked ? `잠김: ${unlockText} (${info.progress?.current}/${info.progress?.required})` : `영입 (제로 ${num(info.cost)})`}
          </button>
        ) : null}
      </div>

      {sheet === 'profile' && (
        <Sheet title={`${m.name} 프로필`} onClose={() => setSheet(null)}>
          <dl className="kv-list">
            {status && <Kv k="상태" v={status} />}
            {m.profile.age !== undefined && <Kv k="나이" v={`${m.profile.age}세`} />}
            {m.profile.gender && <Kv k="성별" v={m.profile.gender} />}
            {m.profile.hometown && <Kv k="고향" v={cityName(m.profile.hometown)} />}
            <Kv k="배경" v={backgroundShort(m.profile.background)} />
            {tendency && <Kv k="계약 성향" v={`${tendency.name}형 · ${tendency.description}`} />}
            <Kv k="세계" v={worldName(m.profile.world)} />
            <Kv k="최초 레벨" v={`${m.initialLevel}`} />
            {isGuild && <Kv k="경험치" v={`${num(m.exp)} / ${num(need)}`} />}
            {upkeepPerDay(tables, m) > 0 && <Kv k="하루 유지비" v={`제로 ${num(upkeepPerDay(tables, m))}`} />}
            {m.unpaidUpkeep && <Kv k="유지비 미납" v={`${m.unpaidUpkeep.days}일 · 제로 ${num(m.unpaidUpkeep.zero)}`} />}
            {!isGuild && info.eligible && unlockText && <Kv k="영입 조건" v={`${unlockText} (${info.progress?.current}/${info.progress?.required})`} />}
          </dl>
          <p className="sub" style={{ margin: 0 }}>
            스킬 속성은 {term.merc} 속성을 따릅니다. 능력치는 레벨·충성도와 항상 켜진 특성을 반영한 값이고, 조건이 붙은 특성은 전투 중에만 더해집니다.
          </p>
          <button className="btn-act" onClick={() => setSheet(null)}>
            닫기
          </button>
        </Sheet>
      )}

      {sheet === 'loyalty' && m.loyalty && tier && (
        <Sheet title={`충성도 · ${tier.name}`} onClose={() => setSheet(null)}>
          <div className="row between t14">
            <span>
              <b>{loyaltyDisplay(m.loyalty.value)}</b>
              <span className="dim"> / {tables.loyalty.range[1]}</span>
            </span>
            {tier.statBonus !== 0 && (
              <span style={{ color: tier.statBonus > 0 ? 'var(--c-ok)' : 'var(--c-warn)' }}>
                공격·방어 {tier.statBonus > 0 ? '+' : ''}
                {Math.round(tier.statBonus * 100)}%
              </span>
            )}
          </div>
          <Gauge ratio={m.loyalty.value / tables.loyalty.range[1]} color={tier.warn ? 'var(--c-warn)' : 'var(--c-ok)'} />
          {tier.warn && (
            <p className="t13" style={{ margin: 0, color: 'var(--c-warn)' }} role="status">
              {tier.refuseChance > 0
                ? `충성도가 위험합니다. 파견을 거부할 수 있고, ${tables.loyalty.departure.afterConsecutiveDays}일 넘게 이어지면 길드를 떠날 수 있습니다.`
                : '충성도가 낮아 전투 능력이 줄었습니다.'}
            </p>
          )}
          {m.loyalty.refusedOnDay === s.day && (
            <p className="t13" style={{ margin: 0, color: 'var(--c-bad)' }}>
              오늘은 파견을 거부했습니다.
            </p>
          )}
          {m.loyalty.restStreak > 0 && (
            <p className="sub" style={{ margin: 0, color: m.loyalty.restStreak > tables.loyalty.restMaxDays ? 'var(--c-warn)' : undefined }}>
              대기 {m.loyalty.restStreak}일
              {m.loyalty.restStreak > tables.loyalty.restMaxDays ? ` · 대기 하락 중(출전 없이 ${tables.loyalty.restMaxDays}일을 넘김)` : ` · 쉬는 날 상승(${tables.loyalty.restMaxDays}일까지)`}
            </p>
          )}
          {m.loyalty.recent.length > 0 &&
            (() => {
              const all = [...m.loyalty!.recent].reverse();
              const shown = logOpen ? all : all.slice(0, tables.ui.loyaltyLogPreview);
              return (
                <>
                  <ul className="col" style={{ gap: 2, margin: 0, padding: 0, listStyle: 'none' }} aria-label="최근 충성도 기록">
                    {shown.map((r, i) => (
                      <li key={i} className="t13">
                        <span className="dim">{r.day}일차</span> {loyaltyReasonName[r.reason] ?? r.reason}{' '}
                        <span style={{ color: r.delta >= 0 ? 'var(--c-ok)' : 'var(--c-warn)' }}>
                          {r.delta >= 0 ? '+' : ''}
                          {r.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {all.length > tables.ui.loyaltyLogPreview && (
                    <button className="btn-act" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>
                      {logOpen ? '기록 접기' : `기록 ${all.length - tables.ui.loyaltyLogPreview}줄 더 보기`}
                    </button>
                  )}
                </>
              );
            })()}
          {isGuild && (
            <button
              className="btn-act primary"
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
          )}
          <button className="btn-act" onClick={() => setSheet(null)}>
            닫기
          </button>
        </Sheet>
      )}

      {sheet === 'training' && training && (() => {
        const t = training;
        const fname = t.facilityId ? getFacility(tables, t.facilityId).name : '훈련소';
        return (
          <Sheet title={t.built ? `${fname} · 칸 ${t.used}/${t.slots}` : fname} onClose={() => setSheet(null)}>
            {!t.facilityId || !t.built ? (
              <>
                <p className="t14 dim" style={{ margin: 0 }}>
                  거점에서 {fname}를 건설하면 배치할 수 있습니다.
                </p>
                <button className="btn-act primary" onClick={() => ctx.go({ name: 'base' })}>
                  거점으로
                </button>
              </>
            ) : t.assigned ? (
              <>
                <p className="t14" style={{ margin: 0 }}>
                  배치 중 · 하루 경험치 +{num(t.expPerDay)} · 배치 중에는 파견할 수 없습니다.
                </p>
                <button
                  className="btn-act primary"
                  onClick={() =>
                    run(() => {
                      ctx.setState(unassignFromFacility(s, t.facilityId!, m.id));
                      setSheet(null);
                      ctx.toast(`${m.name} ${fname} 배치 해제`);
                    })
                  }
                >
                  배치 해제
                </button>
              </>
            ) : (
              <>
                {t.reason && (
                  <p className="t14 dim" style={{ margin: 0 }}>
                    배치할 수 없음 · {t.reason}
                  </p>
                )}
                <button
                  className="btn-act primary"
                  disabled={!!t.reason}
                  onClick={() =>
                    run(() => {
                      ctx.setState(assignToFacility(tables, s, t.facilityId!, m.id));
                      setSheet(null);
                      ctx.toast(`${m.name} ${fname}에 배치`);
                    })
                  }
                >
                  {fname}에 배치 (하루 경험치 +{num(t.expPerDay)})
                </button>
              </>
            )}
            <button className="btn-act" onClick={() => setSheet(null)}>
              닫기
            </button>
          </Sheet>
        );
      })()}

      {sheet === 'recruit' && (
        <Sheet title={`${m.name} 영입`} onClose={() => setSheet(null)}>
          <dl className="kv-list">
            <Kv k="영입비" v={`제로 ${num(outlook.cost)}`} />
            <Kv k="남는 제로" v={num(outlook.zeroAfter)} />
            <Kv k="길드 하루 유지비" v={`${num(outlook.dailyUpkeepBefore)} → ${num(outlook.dailyUpkeepAfter)}`} />
            <Kv k="수입 없이 버틸 일수" v={Number.isFinite(outlook.daysAffordable) ? `${outlook.daysAffordable}일` : '제한 없음'} warn={outlook.daysAffordable < tables.ui.upkeepWarnDays} />
          </dl>
          <button
            className="btn-act primary"
            onClick={() => {
              setSheet(null);
              run(() => {
                ctx.setState(recruit(tables, s, m.id));
                ctx.toast(`${m.name}이(가) 길드에 합류했습니다.`);
              });
            }}
          >
            영입
          </button>
          <button className="btn-act" onClick={() => setSheet(null)}>
            취소
          </button>
        </Sheet>
      )}
    </div>
  );
}

function Kv({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <>
      <dt>{k}</dt>
      <dd style={warn ? { color: 'var(--c-warn)' } : undefined}>{v}</dd>
    </>
  );
}
