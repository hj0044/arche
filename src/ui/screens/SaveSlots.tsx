import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tables } from '../../data';
import type { GameState } from '../../engine/game';
import { storageUsageRatio } from '../../storage/quota';
import { parseSave, serializeSave, type SaveFile } from '../../storage/saveFile';
import { newSlotId, type SlotSummary } from '../../storage/saveService';
import { AppShell } from '../AppShell';
import { ConfirmDialog, Panel } from '../components';
import { cityName, formatDateTime } from '../format';
import { MainTabs } from '../MainTabs';
import type { Ctx } from '../nav';
import { downloadText, saves } from '../saves';

interface SaveSlotsProps {
  /** 게임 중이 아니면 null(타이틀에서 불러오기) */
  ctx: Ctx | null;
  onLoad: (slotId: string, state: GameState) => void;
  onBack?: () => void;
  toast: (msg: string) => void;
}

type Pending = { title: string; message: ReactNode; label: string; danger?: boolean; run: () => Promise<void> | void };

const fileName = (f: SaveFile) => `arche-${f.summary.guildName}-${f.summary.day}일차.json`;

export function SaveSlots({ ctx, onLoad, onBack, toast }: SaveSlotsProps) {
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [usage, setUsage] = useState<number | undefined>();
  const [importError, setImportError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const game = ctx?.game;

  const refresh = () => saves.listSlots().then(setSlots, (e) => toast(`목록을 읽지 못했습니다: ${e.message}`));
  useEffect(() => {
    refresh();
    storageUsageRatio().then(setUsage);
  }, []);

  const describe = (f: SaveFile) => `${f.summary.guildName} · ${cityName(f.summary.baseCityId)} · ${f.summary.day}일차`;

  const saveHere = async (slotId: string, overwrite = false) => {
    if (!game) return;
    const res = await saves.saveManual(slotId, game.state, { overwrite });
    if (res.status === 'needsConfirm') {
      setPending({
        title: '덮어쓰기',
        message: (
          <p>
            이 슬롯의 수동 저장을 덮어씁니다.
            <br />
            기존: {describe(res.existing)} ({formatDateTime(res.existing.savedAt)})
            <br />
            새로: {game.state.guildName} · {game.state.day}일차
          </p>
        ),
        label: '덮어쓰기',
        danger: true,
        run: () => saveHere(slotId, true),
      });
      return;
    }
    toast('저장했습니다.');
    refresh();
  };

  const load = (slotId: string, file: SaveFile) => {
    // 목록의 파일도 불러오기 직전에 형식·의미 검사를 다시 거친다.
    const run = () => {
      try {
        onLoad(slotId, parseSave(file, saves.semantic).state);
      } catch (e) {
        toast(`불러오기 실패: ${(e as Error).message}`);
      }
    };
    if (!game) return run();
    setPending({
      title: '불러오기',
      message: <p>{describe(file)}을(를) 불러옵니다. 지금 진행 중인 내용 중 저장하지 않은 부분은 사라집니다.</p>,
      label: '불러오기',
      run,
    });
  };

  const importFile = async (file: File) => {
    setImportError('');
    try {
      const { slotId, state } = await saves.importFile(await file.text(), newSlotId());
      toast('파일을 새 슬롯으로 불러왔습니다.');
      await refresh();
      onLoad(slotId, state);
    } catch (e) {
      // 검증에 실패하면 슬롯을 만들지 않고, 필드 경로가 든 오류를 화면에 남긴다.
      setImportError(`파일을 불러오지 못했습니다. ${(e as Error).message}`);
    }
  };

  const remove = (slot: SlotSummary) =>
    setPending({
      title: '슬롯 삭제',
      message: <p>이 슬롯의 수동 저장과 자동 저장이 모두 지워집니다. 되돌릴 수 없습니다.</p>,
      label: '삭제',
      danger: true,
      run: async () => {
        await saves.deleteSlot(slot.slotId);
        refresh();
      },
    });

  return (
    <AppShell
      title={game ? '저장' : '불러오기'}
      subtitle={game ? `${game.state.guildName} · ${game.state.day}일차` : '세이브 슬롯'}
      onBack={onBack}
      footer={ctx ? <MainTabs ctx={ctx} current="saves" /> : undefined}
    >
      {usage !== undefined && usage >= tables.ui.storageWarnRatio && (
        <p className="error small">저장 공간이 거의 찼습니다({Math.round(usage * 100)}%). 오래된 슬롯을 파일로 내보내고 지우세요.</p>
      )}

      {game && (
        <Panel title="지금 진행">
          <div className="btn-grid">
            <button className="btn primary" onClick={() => saveHere(game.slotId)}>
              이 슬롯에 저장
            </button>
            <button className="btn" onClick={() => saveHere(newSlotId())}>
              새 슬롯에 저장
            </button>
            <button className="btn" onClick={() => downloadText(`arche-${game.state.guildName}-${game.state.day}일차.json`, saves.exportState(game.state))}>
              파일로 내보내기
            </button>
          </div>
          <p className="hint">하루를 넘길 때마다 이 슬롯에 자동 저장됩니다(최근 {saves.policy.autoSavesPerSlot}개).</p>
        </Panel>
      )}

      <button className="btn block" onClick={() => fileInput.current?.click()}>
        파일에서 불러오기
      </button>
      {importError && (
        <p className="error small" role="alert">
          {importError}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = '';
        }}
      />

      {slots.length === 0 && <p className="muted">저장된 슬롯이 없습니다.</p>}
      {slots.map((slot) => {
        const head = slot.manual ?? slot.autos[0];
        const current = game?.slotId === slot.slotId;
        return (
          <Panel
            key={slot.slotId}
            title={
              <>
                {head.summary.guildName} {current && <span className="pill small ok">진행 중</span>}
              </>
            }
            action={
              <button className="link danger" onClick={() => remove(slot)}>
                삭제
              </button>
            }
          >
            <ul className="rows">
              {[...(slot.manual ? [slot.manual] : []), ...slot.autos].map((f, i) => (
                <li key={`${f.kind}-${i}`} className="row-item">
                  <div>
                    <div className="strong small">
                      {f.kind === 'manual' ? '수동' : '자동'} · {f.summary.day}일차
                    </div>
                    <div className="muted tiny">{formatDateTime(f.savedAt)}</div>
                  </div>
                  <div className="row-actions">
                    <button className="btn small" onClick={() => downloadText(fileName(f), serializeSave(f))} aria-label="파일로 내보내기">
                      내보내기
                    </button>
                    {saves.isLoadable(f) ? (
                      <button className="btn small primary" onClick={() => load(slot.slotId, f)}>
                        불러오기
                      </button>
                    ) : (
                      <span className="pill">지원하지 않는 세이브</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.label}
          danger={pending.danger}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const p = pending;
            setPending(null);
            await p.run();
          }}
        />
      )}
    </AppShell>
  );
}
