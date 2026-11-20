import { useState } from 'react';
import { tables, travelDays } from '../../data';
import { scoutingRow, visibleRift, type FacilitiesState, type ValueRange, type VisibleReward } from '../../engine/facilities';
import type { Rift } from '../../engine/rift';
import { AppShell } from '../AppShell';
import { ElementTag, OmenBadge, Segmented } from '../components';
import { gradeName, materialName, monsterName, num, omenText, tierName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

/** 범위 표시: 같은 두 값이면 한 값 */
const rng = (r: ValueRange, unit = '') => (r[0] === r[1] ? `${num(r[0])}${unit}` : `${num(r[0])}~${num(r[1])}${unit}`);

export function RiftCard({
  rift,
  day,
  baseCityId,
  facilities,
  onClick,
  compact = false,
}: {
  rift: Rift;
  day: number;
  baseCityId: string;
  facilities: FacilitiesState;
  onClick?: () => void;
  /** 편성 화면 상단용: 탭 동작 없이 요약만 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 화면은 탐지소로 "보이는 정보"만 쓴다(실제 값은 숨김).
  const v = visibleRift(tables, facilities, rift);
  const travel = travelDays(tables, baseCityId, rift.cityId);
  // 마감까지 남은 일수(범위). 보이는 최대값으로도 늦으면 확실히 늦은 것이다.
  const left: ValueRange | null = v.deadline ? [Math.max(0, v.deadline[0] - day), Math.max(0, v.deadline[1] - day)] : null;
  const tooLate = left !== null && travel > left[1];
  const total = rift.durationDays + travel * 2;
  const fmt = (r: VisibleReward) =>
    [`제로 ${rng(r.zero)}`, `아르케 ${rng(r.arche)}`, ...Object.entries(r.materials).map(([id, n]) => `${materialName(id)} ${rng(n)}`)].join(' · ');
  const deadline = !left ? '마감 없음' : left[1] === 0 ? '오늘 마감' : left[0] === left[1] ? `마감 D-${left[0]}` : `마감 D-${left[0]}~${left[1]}`;
  const urgent = left !== null && left[0] <= tables.ui.deadlineWarnDays;

  const head = (
    <>
      <span className="rift-head">
        <span className="tag tier">{tierName(rift.tier)}</span>
        <span className="card-title">{rift.name}</span>
        {v.omen && <OmenBadge />}
        {rift.stable && <span className="pill ok">안정화</span>}
      </span>
      <span className="rift-key">
        <span className="strong">Lv{rng(v.level)}</span>
        <span className={urgent ? 'bad strong' : ''}>
          {urgent ? '⚠ ' : ''}
          {deadline}
        </span>
        <span>
          소요 {total}일{travel ? `(이동 ${travel * 2})` : ''}
        </span>
      </span>
      {v.omen && <span className="omen-text small">{omenText(v.omen.textId)}</span>}
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
        {open ? '세부 접기 ▴' : `세부 · 승리 시 제로 ${rng(v.victoryReward.zero)} ▾`}
      </button>
      {open && (
        <div className="rift-details">
          <div className="rift-meta">
            <span>{gradeName(rift.enemies[0].grade)}</span>
            {v.elements ? v.elements.map((el) => <ElementTag key={el} id={el} />) : <span className="muted small">속성 ?</span>}
          </div>
          <div className="muted small">
            {v.monsterCounts
              ? Object.entries(v.monsterCounts).map(([id, n]) => `${monsterName(id)}×${n}`).join(' · ')
              : `${v.monsterIds.map(monsterName).join(' · ')} · ${rng(v.count, '마리')}`}
          </div>
          <div className="small">
            승리 시 {fmt(v.victoryReward)}
            {tables.riftTiers.find((t) => t.id === rift.tier)?.stabilizes && !rift.stable && ' · 항로 안정화'}
          </div>
          {(v.retreatReward.zero[1] > 0 || v.retreatReward.arche[1] > 0) && <div className="muted tiny">철수 시 {fmt(v.retreatReward)}</div>}
          {rift.stable && <div className="muted tiny">안정화 통로: 보상 ×{tables.progression.stablePassageRewardRatio} 반영</div>}
          {v.omenHidden && <div className="muted tiny">징조 표식은 탐지소 레벨이 높아야 보입니다.</div>}
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
    .sort((a, b) => (visibleRift(tables, s.facilities, a).deadline?.[0] ?? Infinity) - (visibleRift(tables, s.facilities, b).deadline?.[0] ?? Infinity));
  const blurred = scoutingRow(tables, s.facilities);
  const showHint = !(blurred.revealElements && blurred.exactEnemies && blurred.exactDeadline && blurred.exactReward && blurred.revealOmen);

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
      {showHint && (
        <p className="hint">
          🔭 범위로 보이는 정보는 탐지소 레벨을 올리면 더 자세히 보입니다(현재 Lv{s.facilities.levels.scout ?? 0}).
        </p>
      )}
      {rifts.length === 0 && <p className="muted">열린 리프트가 없습니다. 하루를 넘기면 새로 열릴 수 있습니다.</p>}
      <ul className="list">
        {rifts.map((r) => (
          <li key={r.id}>
            <RiftCard rift={r} day={s.day} baseCityId={s.baseCityId} facilities={s.facilities} onClick={() => ctx.go({ name: 'party', riftId: r.id })} />
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
