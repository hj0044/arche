import { getSkill, tables } from '../../data';
import { canLevelUp, expToNextLevel, GameError, isOnExpedition, levelUp, levelUpCost, mercToUnit } from '../../engine/game';
import { AppShell } from '../AppShell';
import { Bar, ElementTag, Panel, RoleTag } from '../components';
import { factionName, num, severityName } from '../format';
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
  const m = s.mercenaries.find((x) => x.id === mercId);
  if (!m) return null;
  const unit = mercToUnit(tables, m);
  const need = expToNextLevel(tables, m.level);
  const cost = levelUpCost(tables, m.level);
  const capped = m.level >= m.growth.cap;
  const isGuild = m.affiliation.kind === 'guild';

  const doLevelUp = () => {
    try {
      ctx.setState(levelUp(tables, s, m.id));
      ctx.toast(`${m.name} Lv${m.level + 1}`);
    } catch (e) {
      ctx.toast(e instanceof GameError ? e.message : (e as Error).message);
    }
  };

  const status = m.injury
    ? `${severityName(m.injury.severity)} · ${m.injury.recoverDay}일차 회복`
    : isOnExpedition(s, m.id)
      ? '파견 중'
      : isGuild
        ? '대기'
        : m.affiliation.kind === 'faction'
          ? factionName(m.affiliation.factionId)
          : '';

  return (
    <AppShell
      title={m.name}
      subtitle={status}
      onBack={() => ctx.go({ name: 'mercs' })}
      footer={
        isGuild && (
          <button className="btn primary block" disabled={!canLevelUp(tables, s, m.id)} onClick={doLevelUp}>
            {capped
              ? '성장 한계에 도달'
              : m.exp < need
                ? `레벨업: 경험치 ${m.exp}/${need}`
                : `레벨업 (아르케 ${num(cost)}${s.resources.arche < cost ? ' 부족' : ''})`}
          </button>
        )
      }
    >
      <Panel>
        <div className="tags">
          <ElementTag id={m.element} />
          <RoleTag id={m.role} />
          {m.isProtagonist && <span className="pill small">주인공</span>}
        </div>
        <div className="kv">
          <span>레벨</span>
          <span className="strong">
            {m.level} <span className="muted small">/ 한계 {m.growth.cap}</span>
          </span>
          <span>성장 속도</span>
          <span>×{m.growth.speed}</span>
        </div>
        <div className="small muted">
          경험치 {m.exp} / {need}
        </div>
        <Bar value={m.exp} max={need} kind="exp" />
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
    </AppShell>
  );
}
