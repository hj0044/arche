import { useState } from 'react';
import { tables, travelDays } from '../../data';
import { riftEnemyElements } from '../../engine/autoParty';
import { riftReward } from '../../engine/game';
import type { Rift, RiftReward } from '../../engine/rift';
import { AppShell } from '../AppShell';
import { ElementTag, OmenBadge, Segmented } from '../components';
import { gradeName, materialName, monsterName, num, omenText, tierName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

export function RiftCard({
  rift,
  day,
  baseCityId,
  onClick,
  compact = false,
}: {
  rift: Rift;
  day: number;
  baseCityId: string;
  onClick?: () => void;
  /** 편성 화면 상단용: 탭 동작 없이 요약만 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const travel = travelDays(tables, baseCityId, rift.cityId);
  const left = rift.deadlineDay === null ? null : rift.deadlineDay - day;
  const tooLate = left !== null && travel > left;
  const levels = rift.enemies.map((e) => e.level);
  const counts = new Map<string, number>();
  for (const e of rift.enemies) counts.set(e.monsterId, (counts.get(e.monsterId) ?? 0) + 1);
  const total = rift.durationDays + travel * 2;
  // 리프트에 나오는 몬스터들의 속성(몬스터 데이터에서 가져온다)
  const enemyElements = riftEnemyElements(tables, rift);
  const win = riftReward(tables, rift, 'victory');
  const retreat = riftReward(tables, rift, 'retreat');
  const fmt = (r: RiftReward) =>
    [`제로 ${num(r.zero)}`, `아르케 ${num(r.arche)}`, ...Object.entries(r.materials).map(([id, n]) => `${materialName(id)} ${n}`)].join(' · ');
  const lv = `Lv${Math.min(...levels)}${Math.max(...levels) !== Math.min(...levels) ? `~${Math.max(...levels)}` : ''}`;
  const deadline = rift.stable ? '마감 없음' : left === 0 ? '오늘 마감' : `마감 D-${left}`;
  const urgent = !rift.stable && left !== null && left <= tables.ui.deadlineWarnDays;

  const head = (
    <>
      <span className="rift-head">
        <span className="tag tier">{tierName(rift.tier)}</span>
        <span className="card-title">{rift.name}</span>
        {rift.omen && <OmenBadge />}
        {rift.stable && <span className="pill ok">안정화</span>}
      </span>
      <span className="rift-key">
        <span className="strong">{lv}</span>
        <span className={urgent ? 'bad strong' : ''}>
          {urgent ? '⚠ ' : ''}
          {deadline}
        </span>
        <span>
          소요 {total}일{travel ? `(이동 ${travel * 2})` : ''}
        </span>
      </span>
      {rift.omen && <span className="omen-text small">{omenText(rift.omen.textId)}</span>}
      {tooLate && <span className="error small">이동하는 동안 마감이 지나 보낼 수 없습니다.</span>}
    </>
  );

  return (
    <div className={`card rift tier-${rift.tier} ${compact ? 'compact' : ''}`}>
      {onClick ? (
        <button className="rift-main" onClick={onClick} disabled={tooLate}>
          {head}
        </button>
      ) : (
        <div className="rift-main">{head}</div>
      )}
      <button className="rift-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '세부 접기 ▴' : `세부 · 승리 시 제로 ${num(win.zero)} ▾`}
      </button>
      {open && (
        <div className="rift-details">
          <div className="rift-meta">
            <span>{gradeName(rift.enemies[0].grade)}</span>
            {enemyElements.map((el) => (
              <ElementTag key={el} id={el} />
            ))}
          </div>
          <div className="muted small">{[...counts].map(([id, n]) => `${monsterName(id)}×${n}`).join(' · ')}</div>
          <div className="small">
            승리 시 {fmt(win)}
            {tables.riftTiers.find((t) => t.id === rift.tier)?.stabilizes && !rift.stable && ' · 항로 안정화'}
          </div>
          {(retreat.zero > 0 || retreat.arche > 0) && <div className="muted tiny">철수 시 {fmt(retreat)}</div>}
          {rift.stable && <div className="muted tiny">안정화 통로: 보상 ×{tables.progression.stablePassageRewardRatio} 반영</div>}
        </div>
      )}
    </div>
  );
}

export function RiftList({ ctx, cityId }: { ctx: Ctx; cityId?: string }) {
  const s = ctx.game.state;
  const [city, setCity] = useState(cityId ?? s.baseCityId);
  const rifts = s.rifts
    .filter((r) => r.cityId === city)
    .sort((a, b) => (a.deadlineDay ?? Infinity) - (b.deadlineDay ?? Infinity));

  return (
    <AppShell title="리프트" subtitle={`${s.day}일차 · 탭하면 파티를 편성합니다`} footer={<MainTabs ctx={ctx} current="rifts" />}>
      <Segmented
        value={city}
        onChange={setCity}
        options={tables.cities.map((c) => ({
          value: c.id,
          label: `${c.name}${c.id === s.baseCityId ? '(거점)' : ''} ${s.rifts.filter((r) => r.cityId === c.id).length}`,
        }))}
      />
      {rifts.length === 0 && <p className="muted">열린 리프트가 없습니다. 하루를 넘기면 새로 열릴 수 있습니다.</p>}
      <ul className="list">
        {rifts.map((r) => (
          <li key={r.id}>
            <RiftCard rift={r} day={s.day} baseCityId={s.baseCityId} onClick={() => ctx.go({ name: 'party', riftId: r.id })} />
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
