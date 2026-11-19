import { useState } from 'react';
import { getSkill, tables } from '../../data';
import {
  canLevelUp,
  expToNextLevel,
  GameError,
  isOnExpedition,
  levelUp,
  levelUpCost,
  mercToUnit,
  recruit,
  recruitInfo,
  upkeepPerDay,
} from '../../engine/game';
import { AppShell } from '../AppShell';
import { Bar, ConfirmDialog, ElementTag, Panel, RoleTag } from '../components';
import { backgroundShort, cityName, factionName, growthSpeedName, num, severityName, tierName, worldName } from '../format';
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
  const m = s.mercenaries.find((x) => x.id === mercId);
  if (!m) return null;
  const unit = mercToUnit(tables, m);
  const need = expToNextLevel(tables, m.level, m.growth.speed);
  const cost = levelUpCost(tables, m.level);
  const capped = m.level >= m.growth.cap;
  const isGuild = m.affiliation.kind === 'guild';
  const info = recruitInfo(tables, s, m.id);
  const speed = tables.growthSpeeds.find((g) => g.id === m.growth.speed);

  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const status = m.injury
    ? `${severityName(m.injury.severity)} · ${m.injury.recoverDay}일차 회복`
    : isOnExpedition(s, m.id)
      ? '파견 중'
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
        {capped
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
          title="영입"
          message={
            <p>
              {m.name}(Lv{m.level}, 한계 {m.growth.cap})을(를) 제로 {num(info.cost)}에 영입합니다.
              <br />
              보유 제로 {num(s.resources.zero)} · 영입 후 하루 유지비 {num(upkeepPerDay(tables, m))}
            </p>
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
