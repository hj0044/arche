import { useState } from 'react';
import { tables, travelDays } from '../../data';
import type { Rift } from '../../engine/rift';
import { AppShell } from '../AppShell';
import { ElementTag, Segmented } from '../components';
import { gradeName, materialName, monsterName, num, tierName } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';

export function RiftCard({ rift, day, baseCityId, onClick }: { rift: Rift; day: number; baseCityId: string; onClick?: () => void }) {
  const travel = travelDays(tables, baseCityId, rift.cityId);
  const left = rift.deadlineDay === null ? null : rift.deadlineDay - day;
  const tooLate = left !== null && travel > left;
  const levels = rift.enemies.map((e) => e.level);
  const counts = new Map<string, number>();
  for (const e of rift.enemies) counts.set(e.monsterId, (counts.get(e.monsterId) ?? 0) + 1);
  const total = rift.durationDays + travel * 2;
  return (
    <button className={`card-button rift tier-${rift.tier}`} onClick={onClick} disabled={!onClick || tooLate}>
      <div className="rift-head">
        <span className="tag tier">{tierName(rift.tier)}</span>
        <span className="card-title">{rift.name}</span>
        {rift.stable ? (
          <span className="pill ok">안정화</span>
        ) : (
          <span className={`pill ${left !== null && left <= 1 ? 'bad' : ''}`}>{left === 0 ? '오늘 마감' : `마감 D-${left}`}</span>
        )}
      </div>
      <div className="rift-meta">
        <span>
          {gradeName(rift.enemies[0].grade)} · Lv{Math.min(...levels)}
          {Math.max(...levels) !== Math.min(...levels) ? `~${Math.max(...levels)}` : ''}
        </span>
        <ElementTag id="void" />
        <span>
          소요 {total}일{travel ? ` (이동 왕복 ${travel * 2}일)` : ''}
        </span>
      </div>
      <div className="rift-enemies muted small">
        {[...counts].map(([id, n]) => `${monsterName(id)}×${n}`).join(' · ')}
      </div>
      <div className="rift-reward small">
        보상: 제로 {num(rift.reward.zero)} · 아르케 {num(rift.reward.arche)}
        {Object.entries(rift.reward.materials)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ` · ${materialName(id)} ${n}`)}
        {rift.stable && ' (안정화 통로는 보상 절반)'}
        {tables.riftTiers.find((t) => t.id === rift.tier)?.stabilizes && !rift.stable && ' · 승리 시 항로 안정화'}
      </div>
      {tooLate && <div className="error small">이동하는 동안 마감이 지나 보낼 수 없습니다.</div>}
    </button>
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
