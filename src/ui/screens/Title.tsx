import { useEffect, useState } from 'react';
import type { GameState } from '../../engine/game';
import type { SlotSummary } from '../../storage/saveService';
import { AppShell } from '../AppShell';
import { cityName, formatDateTime } from '../format';
import { saves } from '../saves';

interface TitleProps {
  onNew: () => void;
  onLoad: (slotId: string, state: GameState) => void;
  onOpenSaves: () => void;
}

/** 슬롯의 가장 최근 저장(수동·자동 중) */
export function latestFile(slot: SlotSummary) {
  return [slot.manual, slot.autos[0]].filter((f) => f !== undefined).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export function Title({ onNew, onLoad, onOpenSaves }: TitleProps) {
  const [recent, setRecent] = useState<SlotSummary | null | undefined>(undefined);

  useEffect(() => {
    saves.listSlots().then((slots) => setRecent(slots[0] ?? null), () => setRecent(null));
  }, []);

  const latest = recent ? latestFile(recent) : undefined;

  return (
    <AppShell title="Arche" subtitle="용병 길드 운영">
      <div className="title-hero">
        <p className="title-year">2032년, 제로데이로부터 5년</p>
        <p className="muted">리프트가 열린 도시에서, 인가를 막 받은 작은 길드를 이끈다.</p>
      </div>
      <div className="stack">
        {latest && recent && (
          <button className="card-button" onClick={() => onLoad(recent.slotId, latest.state)}>
            <span className="card-title">이어하기</span>
            <span className="card-desc">
              {latest.summary.guildName} · {cityName(latest.summary.baseCityId)} · {latest.summary.day}일차 ·{' '}
              {formatDateTime(latest.savedAt)}
            </span>
          </button>
        )}
        <button className="card-button" onClick={onNew}>
          <span className="card-title">새 게임</span>
          <span className="card-desc">주인공과 길드, 시작 도시를 정한다.</span>
        </button>
        <button className="card-button" onClick={onOpenSaves}>
          <span className="card-title">불러오기</span>
          <span className="card-desc">세이브 슬롯과 파일에서 불러온다.</span>
        </button>
      </div>
    </AppShell>
  );
}
