/**
 * 전투 재생(시안 Battle, 지시서 017). 구역 순서: header · roundBar · field · skillBanner · log · controls.
 * 재생 로직(속도·건너뛰기·한 턴씩·일시정지)은 그대로 두고 모양만 시안으로 바꿨다.
 * 시안에 없는 전체 로그는 로그 카드를 누르면 바텀 시트로 본다. 끝나면 일시정지 자리가 '다시'가 된다.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { tables } from '../../data';
import type { CombatantSnapshot, CombatEvent } from '../../engine/combat';
import { deviceSettings } from '../../app/settings';
import { isUiFixture } from '../../app/saves';
import { BATTLE_FIELD, monsterSvg } from '../art/fallback';
import { Art, Portrait, Sheet } from '../components';
import { elementName, outcomeName, skillName, statsLabel } from '../format';
import type { Ctx, Route } from '../nav';

interface Hit {
  target: string;
  kind: 'damage' | 'heal' | 'status';
  amount: number;
  evaded?: boolean;
  crit?: boolean;
  text: string;
}
interface Frame {
  round: number;
  hp: Record<string, number>;
  actor?: string;
  skillId?: string;
  targets: string[];
  hits: Hit[];
  /** 상성: 1 유리, -1 불리, 0 보통(첫 피해 기준) */
  adv: number;
  line: string;
}

export function numberDuplicateNames(units: CombatantSnapshot[]): CombatantSnapshot[] {
  const total = new Map<string, number>();
  for (const u of units) total.set(`${u.side}:${u.name}`, (total.get(`${u.side}:${u.name}`) ?? 0) + 1);
  const seen = new Map<string, number>();
  return units.map((u) => {
    const k = `${u.side}:${u.name}`;
    if ((total.get(k) ?? 0) < 2) return u;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { ...u, name: `${u.name} ${n}` };
  });
}

/** 전투 로그를 재생용 프레임 목록으로 바꾼다. 프레임 하나가 행동 하나다. */
export function buildFrames(events: CombatEvent[]): { units: CombatantSnapshot[]; frames: Frame[]; comp: number } {
  const start = events.find((e) => e.type === 'start');
  if (start?.type !== 'start') return { units: [], frames: [], comp: 1 };
  const units = numberDuplicateNames(start.combatants);
  const nameOf = (k: string) => units.find((u) => u.key === k)?.name ?? k;
  let hp = Object.fromEntries(units.map((u) => [u.key, u.hp]));
  let round = 0;
  const frames: Frame[] = [{ round: 0, hp, targets: [], hits: [], adv: 0, line: '전투 시작' }];
  for (const ev of events) {
    if (ev.type === 'round') round = ev.round;
    if (ev.type === 'action') {
      hp = { ...hp };
      let adv = 0;
      const hits: Hit[] = ev.effects.map((f) => {
        const t = nameOf(f.target);
        if (f.kind === 'damage') {
          hp[f.target] = f.hpAfter;
          if (!adv) adv = f.elementMultiplier > 1 ? 1 : f.elementMultiplier < 1 ? -1 : 0;
          if (f.evaded) return { target: f.target, kind: 'damage', amount: 0, evaded: true, text: `${t} 회피` };
          return { target: f.target, kind: 'damage', amount: f.amount, crit: f.crit, text: `${t}에게 ${f.amount} 피해${f.crit ? '(치명타)' : ''}${f.downed ? ', 쓰러짐' : ''}` };
        }
        if (f.kind === 'heal') {
          hp[f.target] = f.hpAfter;
          return { target: f.target, kind: 'heal', amount: f.amount, text: f.amount > 0 ? `${t} ${f.amount} 회복` : '' };
        }
        return { target: f.target, kind: 'status', amount: 0, text: f.status === 'taunt' ? `${t} 도발` : `${t} ${statsLabel(f.stats)} 상승` };
      });
      frames.push({
        round,
        hp,
        actor: ev.actor,
        skillId: ev.skillId,
        targets: ev.effects.map((f) => f.target),
        hits,
        adv,
        line: `${nameOf(ev.actor)}의 ${skillName(ev.skillId)}, ${hits.map((h) => h.text).filter(Boolean).join(', ')}`,
      });
    }
    if (ev.type === 'end') frames.push({ round, hp, targets: [], hits: [], adv: 0, line: `${outcomeName[ev.outcome]} (${ev.rounds}라운드)` });
  }
  return { units, frames, comp: start.compositionMultiplier.ally };
}

/** 한 줄 로그: 피해 숫자만 굵고 색을 준다(시안) */
function LogLine({ f, nameOf, latest }: { f: Frame; nameOf: (k: string) => string; latest: boolean }) {
  if (!f.actor) return <span className={latest ? '' : 'dim'}>{f.line}</span>;
  const parts: ReactNode[] = [];
  f.hits.forEach((h, i) => {
    if (!h.text) return;
    if (parts.length) parts.push(', ');
    if (h.kind === 'damage' && !h.evaded) {
      const t = nameOf(h.target);
      parts.push(
        <span key={i}>
          {t}에게 <b className="dmg">{h.amount}</b> 피해{h.crit ? '(치명타)' : ''}
        </span>,
      );
    } else parts.push(<span key={i}>{h.text}</span>);
  });
  return (
    <span className={latest ? '' : 'dim'}>
      {nameOf(f.actor)}의 {skillName(f.skillId!)}, {parts}
    </span>
  );
}

const useSettings = () => useSyncExternalStore(deviceSettings.subscribe, deviceSettings.get);

export function BattleReplay({ ctx, expeditionId, back }: { ctx: Ctx; expeditionId: string; back: Route }) {
  const report = ctx.game.state.reports.find((r) => r.expeditionId === expeditionId);
  const { units, frames } = useMemo(() => buildFrames(report?.events ?? []), [report]);
  const last = frames.length - 1;
  // 개발용 픽스처는 시안처럼 3라운드의 피해 장면에서 멈춰 둔다(스크린샷이 흔들리지 않게)
  const frozen = isUiFixture();
  const [index, setIndex] = useState(() => (frozen ? Math.max(0, frames.findIndex((f) => f.round >= 3 && f.hits.some((h) => h.kind === 'damage' && !h.evaded))) : 0));
  const [playing, setPlaying] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const speeds = tables.ui.replay.speeds;
  const speed = useSettings().replaySpeed;

  useEffect(() => {
    if (frozen || !playing || index >= last) return;
    const t = window.setTimeout(() => setIndex((i) => Math.min(last, i + 1)), tables.ui.replay.stepMs / speed);
    return () => window.clearTimeout(t);
  }, [frozen, playing, index, last, speed]);

  if (!report || frames.length === 0) {
    return (
      <div className="scr">
        <main className="scr-body shell-body">
          <div className="pg top-16" data-role="page">
            <span data-ui="Battle.header" className="t15 b">
              {report?.rift.name ?? '전투 재생'}
            </span>
            <p className="t14 dim">전투 기록이 없습니다(오래된 보고는 결과만 남습니다).</p>
          </div>
        </main>
        <div className="foot">
          <button className="btn-big" style={{ height: 48, fontSize: 15 }} onClick={() => ctx.go(back)}>
            결과 보기
          </button>
        </div>
      </div>
    );
  }

  const frame = frames[index];
  const done = index >= last;
  const nameOf = (k: string) => units.find((u) => u.key === k)?.name ?? k;
  const enemyElements = [...new Set(units.filter((u) => u.side === 'enemy').map((u) => u.element))];
  const recent = frames.slice(1, index + 1).slice(-3);
  const rowOf = (side: 'ally' | 'enemy', row: 'front' | 'back') => units.filter((u) => u.side === side && u.row === row);
  // 앞 열이 가운데 선 가까이: 위에서부터 적 뒤 → 적 앞 | 아군 앞 → 아군 뒤
  const enemyRows = [rowOf('enemy', 'back'), rowOf('enemy', 'front')].filter((r) => r.length);
  const allyRows = [rowOf('ally', 'front'), rowOf('ally', 'back')].filter((r) => r.length);

  const Unit = ({ u }: { u: CombatantSnapshot }) => {
    const hp = frame.hp[u.key];
    const hit = frame.hits.find((h) => h.target === u.key && h.kind !== 'status');
    const acting = frame.actor === u.key;
    return (
      <div className={`bt-unit ${hp <= 0 ? 'down' : ''}`} data-side={u.side}>
        <div className={`bt-face ${acting ? 'acting' : ''}`}>
          {u.side === 'enemy' ? <Art kind="monster" id={u.unitId} fallback={monsterSvg(u.unitId)} fill /> : <Portrait id={u.unitId} element={u.element} role={u.role} fill />}
          <span className="bt-lv">{u.level}</span>
        </div>
        {hit && (
          <span className={`bt-num ${hit.kind === 'heal' ? 'heal' : ''}`}>{hit.evaded ? '회피' : hit.kind === 'heal' ? `+${hit.amount}` : `-${hit.amount}`}</span>
        )}
        <div className="bt-hp">
          <i style={{ width: `${Math.max(0, Math.min(1, hp / u.maxHp)) * 100}%` }} />
        </div>
        <div className="bt-name">{u.name}</div>
      </div>
    );
  };
  const Row = ({ list, side }: { list: CombatantSnapshot[]; side: 'ally' | 'enemy' }) => {
    // 시안 간격(적 46, 아군 16)을 쓰되 한 줄에 다 들어가도록 줄인다
    const want = side === 'enemy' ? 46 : 16;
    const gap = list.length > 1 ? Math.max(4, Math.min(want, Math.floor((390 - 32 - 68 * list.length) / (list.length - 1)))) : 0;
    return (
      <div className="bt-row" style={{ gap }}>
        {list.map((u) => (
          <Unit key={u.key} u={u} />
        ))}
      </div>
    );
  };

  return (
    <div className="scr">
      <main className="scr-body shell-body">
        <div className="bt-top" data-role="page">
          <div className="col" style={{ minWidth: 0 }}>
            <span className="bt-title ellipsis" data-ui="Battle.header">
              {report.rift.name}
            </span>
            <span className="sub" data-ui="Battle.roundBar">
              라운드 <b style={{ color: 'var(--c-text)' }}>{frame.round}</b> / {tables.combat.maxRounds} · 적 {enemyElements.map(elementName).join('·')}
            </span>
          </div>
          <div className="row" style={{ gap: 6, flex: 'none' }}>
            <button
              className="bt-hit"
              data-touch
              aria-label={`재생 속도 ${speed}배`}
              onClick={() => deviceSettings.set({ replaySpeed: speeds[(speeds.indexOf(speed) + 1) % speeds.length] })}
            >
              <span className="bt-btn gold">{speed}x</span>
            </button>
            <button className="bt-hit" data-touch disabled={done} onClick={() => setIndex(last)}>
              <span className="bt-btn">건너뛰기</span>
            </button>
          </div>
        </div>
        <div className="bt-field" data-ui="Battle.field">
          <Art kind="banner" id="battlefield" fallback={BATTLE_FIELD} fill />
          <div className="bt-side top">
            {enemyRows.map((r, i) => (
              <Row key={i} list={r} side="enemy" />
            ))}
          </div>
          <div className="bt-banner" data-ui="Battle.skillBanner" aria-live="polite" style={{ visibility: frame.actor || done ? 'visible' : 'hidden' }}>
            {frame.actor ? (
              <>
                <span className="bt-banner-name">
                  {nameOf(frame.actor)} · {skillName(frame.skillId!)}
                </span>
                {frame.adv !== 0 && <span className={`bt-adv ${frame.adv > 0 ? 'good' : 'bad'}`}>{frame.adv > 0 ? '상성 유리' : '상성 불리'}</span>}
              </>
            ) : (
              <span className="bt-banner-name">{frame.line}</span>
            )}
          </div>
          <div className="bt-side bottom">
            {allyRows.map((r, i) => (
              <Row key={i} list={r} side="ally" />
            ))}
          </div>
        </div>
        <div className="pg" style={{ paddingTop: 10, paddingBottom: 0 }} data-role="page">
          <button className="bt-log" data-ui="Battle.log" aria-label="전체 로그 보기" onClick={() => setLogOpen(true)}>
            {recent.length ? recent.map((f, i) => <LogLine key={index - recent.length + i} f={f} nameOf={nameOf} latest={i === recent.length - 1} />) : <span className="dim">전투 시작</span>}
          </button>
        </div>
        <div className="grow" />
      </main>
      <div className="foot" style={{ paddingTop: 0, paddingBottom: 14 }} data-ui="Battle.controls">
        <button
          className="btn-act"
          style={{ width: '33%', flex: 'none', fontSize: 15, fontWeight: 500 }}
          onClick={() => (done ? (setIndex(0), setPlaying(true)) : setPlaying(!playing))}
        >
          {done ? '다시' : playing ? '일시정지' : '재생'}
        </button>
        <button className="btn-act" style={{ width: '33%', flex: 'none', fontSize: 15, fontWeight: 500 }} disabled={done} onClick={() => (setPlaying(false), setIndex(Math.min(last, index + 1)))}>
          한 턴씩
        </button>
        <button className="btn-big" style={{ height: 48, fontSize: 15 }} onClick={() => ctx.go(back)}>
          결과 보기
        </button>
      </div>
      {logOpen && (
        <Sheet title={`전체 로그 · ${outcomeName[report.outcome]}`} onClose={() => setLogOpen(false)}>
          <ol className="bt-full-log">
            {frames.slice(1, index + 1).map((f, i) => (
              <li key={i}>
                <span className="dim">{f.round}R</span> {f.line}
              </li>
            ))}
          </ol>
          <button className="btn-act" onClick={() => setLogOpen(false)}>
            닫기
          </button>
        </Sheet>
      )}
    </div>
  );
}
