import { useEffect, useMemo, useState } from 'react';
import { tables } from '../../data';
import type { CombatantSnapshot, CombatEvent } from '../../engine/combat';
import { AppShell } from '../AppShell';
import { Bar, ElementTag } from '../components';
import { outcomeName, pct, roleName, rowName, skillName } from '../format';
import type { Ctx, Route } from '../nav';

interface Frame {
  round: number;
  hp: Record<string, number>;
  actor?: string;
  targets: string[];
  line: string;
}

/** 전투 로그를 재생용 프레임 목록으로 바꾼다. 프레임 하나가 행동 하나다. */
export function buildFrames(events: CombatEvent[]): { units: CombatantSnapshot[]; frames: Frame[]; comp: number } {
  const start = events.find((e) => e.type === 'start');
  if (start?.type !== 'start') return { units: [], frames: [], comp: 1 };
  const units = start.combatants;
  const nameOf = (k: string) => units.find((u) => u.key === k)?.name ?? k;
  let hp = Object.fromEntries(units.map((u) => [u.key, u.hp]));
  let round = 0;
  const frames: Frame[] = [{ round: 0, hp, targets: [], line: '전투 시작' }];
  for (const ev of events) {
    if (ev.type === 'round') round = ev.round;
    if (ev.type === 'action') {
      hp = { ...hp };
      const parts = ev.effects.map((f) => {
        const t = nameOf(f.target);
        if (f.kind === 'damage') {
          hp[f.target] = f.hpAfter;
          const el = f.elementMultiplier > 1 ? ' 효과적!' : f.elementMultiplier < 1 ? ' 약함' : '';
          return `${t} -${f.amount}${el}${f.downed ? ' 쓰러짐' : ''}`;
        }
        if (f.kind === 'heal') {
          hp[f.target] = f.hpAfter;
          return f.amount > 0 ? `${t} +${f.amount}` : '';
        }
        return f.status === 'taunt' ? `${t} 도발` : `${t} ${f.stat === 'atk' ? '공격' : '방어'}↑`;
      });
      frames.push({
        round,
        hp,
        actor: ev.actor,
        targets: ev.effects.map((f) => f.target),
        line: `${nameOf(ev.actor)} 「${skillName(ev.skillId)}」 ${parts.filter(Boolean).join(', ')}`,
      });
    }
    if (ev.type === 'end') {
      frames.push({ round, hp, targets: [], line: `${outcomeName[ev.outcome]} (${ev.rounds}라운드)` });
    }
  }
  return { units, frames, comp: start.compositionMultiplier.ally };
}

export function BattleReplay({ ctx, expeditionId, back }: { ctx: Ctx; expeditionId: string; back: Route }) {
  const report = ctx.game.state.reports.find((r) => r.expeditionId === expeditionId);
  const { units, frames, comp } = useMemo(() => buildFrames(report?.events ?? []), [report]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const speeds = tables.ui.replay.speeds;
  const [speed, setSpeed] = useState(speeds[0]);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing || index >= last) return;
    const t = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), tables.ui.replay.stepMs / speed);
    return () => window.clearTimeout(t);
  }, [playing, index, last, speed]);

  if (!report || frames.length === 0) {
    return (
      <AppShell title="전투 재생" onBack={() => ctx.go(back)}>
        <p className="muted">전투 기록이 없습니다(오래된 보고는 결과만 남습니다).</p>
      </AppShell>
    );
  }

  const frame = frames[index];
  const done = index >= last;
  const side = (s: 'ally' | 'enemy', row: 'front' | 'back') => units.filter((u) => u.side === s && u.row === row);

  const UnitCard = ({ u }: { u: CombatantSnapshot }) => {
    const hp = frame.hp[u.key];
    const cls = [
      'unit',
      u.side,
      hp <= 0 ? 'downed' : '',
      frame.actor === u.key ? 'acting' : '',
      frame.targets.includes(u.key) && frame.actor !== u.key ? 'targeted' : '',
    ].join(' ');
    return (
      <div className={cls}>
        <div className="unit-name">{u.name}</div>
        <div className="unit-tags">
          <ElementTag id={u.element} />
          <span className="tiny">{roleName(u.role)}</span>
        </div>
        <Bar value={hp} max={u.maxHp} />
        <div className="tiny muted">
          {hp}/{u.maxHp}
        </div>
      </div>
    );
  };

  const Line = ({ s, row }: { s: 'ally' | 'enemy'; row: 'front' | 'back' }) => {
    const list = side(s, row);
    if (!list.length) return null;
    return (
      <div className="battle-row">
        <span className="battle-row-label">{rowName[row]}</span>
        <div className="battle-row-units">
          {list.map((u) => (
            <UnitCard key={u.key} u={u} />
          ))}
        </div>
      </div>
    );
  };

  const log = frames.slice(1, index + 1).reverse();

  return (
    <AppShell
      title={report.rift.name}
      subtitle={`${frame.round ? `${frame.round}라운드` : '시작'} · 구성 ${pct(comp - 1)}`}
      onBack={() => ctx.go(back)}
      footer={
        <div className="replay-controls">
          <button className="btn" onClick={() => (done ? (setIndex(0), setPlaying(true)) : setPlaying(!playing))}>
            {done ? '다시' : playing ? '일시정지' : '재생'}
          </button>
          <button className="btn" onClick={() => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])}>
            ×{speed}
          </button>
          <button className="btn primary" onClick={() => (done ? ctx.go(back) : setIndex(last))}>
            {done ? '닫기' : '결과로'}
          </button>
        </div>
      }
    >
      <div className="battlefield">
        <Line s="enemy" row="back" />
        <Line s="enemy" row="front" />
        <div className="battle-divider" />
        <Line s="ally" row="front" />
        <Line s="ally" row="back" />
      </div>
      <div className={`battle-now ${done ? `outcome-${report.outcome}` : ''}`} aria-live="polite">
        {frame.line}
      </div>
      <ol className="battle-log">
        {log.map((f, i) => (
          <li key={index - i}>
            <span className="muted tiny">R{f.round}</span> {f.line}
          </li>
        ))}
      </ol>
    </AppShell>
  );
}
