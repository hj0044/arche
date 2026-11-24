/**
 * 설정(시안 Settings, 지시서 017). 톱니로 들어온다. 구역 순서: header · currentSlot · slots · transfer · game · danger · about.
 * 슬롯 규칙(자동 저장 슬롯별 최근 3개 순환, 수동 슬롯 개수 제한 없음, 덮어쓰기 확인)은 그대로다.
 * 다른 슬롯 목록·파일 내보내기/가져오기·슬롯 삭제는 '다른 슬롯 · 내보내기' 바텀 시트로 옮겼다.
 * 기기 설정(재생 속도·소리·중요 행동 확인)은 세이브가 아니라 src/app/settings에 저장한다.
 * "중요 행동 확인"을 꺼도 덮어쓰기와 삭제 확인은 끌 수 없다. 끄면 불러오기·새 게임 확인만 생략한다.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { tables } from '../../data';
import type { GameState } from '../../engine/game';
import { deviceSettings } from '../../app/settings';
import { downloadText, newSlotId, parseSave, SAVE_VERSION, saves, serializeSave, storageUsageRatio, type SaveFile, type SlotSummary } from '../../app/saves';
import { BackRow, Seg, Sheet, Toggle } from '../components';
import { cityName, formatDateTime } from '../format';
import type { Ctx, Route } from '../nav';

type Pending = { title: string; message: ReactNode; label: string; danger?: boolean; run: () => Promise<void> | void };

const fileName = (f: SaveFile) => `arche-${f.summary.guildName}-${f.summary.day}일차.json`;

/** 저장 시각을 '방금', 'N분 전' 같은 말로 */
export function relativeTime(iso: string, now = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return formatDateTime(iso);
}

export function Settings({ ctx, back, onLoad, onNewGame }: { ctx: Ctx; back?: Route; onLoad: (slotId: string, state: GameState) => void; onNewGame: () => void }) {
  const game = ctx.game;
  const settings = useSyncExternalStore(deviceSettings.subscribe, deviceSettings.get);
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sheet, setSheet] = useState<null | 'transfer' | 'about'>(null);
  const [usage, setUsage] = useState<number | undefined>();
  const [importError, setImportError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => saves.listSlots().then(setSlots, (e) => ctx.toast(`목록을 읽지 못했습니다: ${e.message}`));
  useEffect(() => {
    refresh();
    storageUsageRatio().then(setUsage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mine = slots.find((x) => x.slotId === game.slotId);
  const files = mine ? [...mine.autos, ...(mine.manual ? [mine.manual] : [])] : [];
  const last = files.slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
  const describe = (f: SaveFile) => `${f.summary.guildName} · ${cityName(f.summary.baseCityId)} · ${f.summary.day}일차`;
  const confirmOrRun = (p: Pending) => (settings.confirmImportant ? setPending(p) : p.run());

  const saveHere = async (slotId: string, overwrite = false) => {
    const res = await saves.saveManual(slotId, game.state, { overwrite });
    if (res.status === 'needsConfirm') {
      // 덮어쓰기 확인은 설정과 상관없이 항상 묻는다(1단계 확정 규칙)
      setPending({
        title: '덮어쓰기',
        message: (
          <p className="t14" style={{ margin: 0 }}>
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
    ctx.toast('저장했습니다.');
    refresh();
  };

  const load = (slotId: string, file: SaveFile) =>
    confirmOrRun({
      title: '불러오기',
      message: (
        <p className="t14" style={{ margin: 0 }}>
          {describe(file)}을(를) 불러옵니다. 지금 진행 중인 내용 중 저장하지 않은 부분은 사라집니다.
        </p>
      ),
      label: '불러오기',
      run: () => {
        // 목록의 파일도 불러오기 직전에 형식·의미 검사를 다시 거친다
        try {
          onLoad(slotId, parseSave(file, saves.semantic).state);
        } catch (e) {
          ctx.toast(`불러오기 실패: ${(e as Error).message}`);
        }
      },
    });

  const importFile = async (file: File) => {
    setImportError('');
    try {
      const { slotId, state } = await saves.importFile(await file.text(), newSlotId());
      ctx.toast('파일을 새 슬롯으로 불러왔습니다.');
      await refresh();
      onLoad(slotId, state);
    } catch (e) {
      // 검증에 실패하면 슬롯을 만들지 않고, 필드 경로가 든 오류를 남긴다
      setImportError(`파일을 불러오지 못했습니다. ${(e as Error).message}`);
    }
  };

  const remove = (slot: SlotSummary) =>
    setPending({
      title: '슬롯 삭제',
      message: (
        <p className="t14" style={{ margin: 0 }}>
          이 슬롯의 수동 저장과 자동 저장이 모두 지워집니다. 되돌릴 수 없습니다.
        </p>
      ),
      label: '삭제',
      danger: true,
      run: async () => {
        await saves.deleteSlot(slot.slotId);
        refresh();
      },
    });

  const LoadBtn = ({ slotId, f }: { slotId: string; f: SaveFile }) =>
    saves.isLoadable(f) ? (
      <button className="set-hit" data-touch onClick={() => load(slotId, f)}>
        <span className="set-btn">불러오기</span>
      </button>
    ) : (
      <span className="sub">지원하지 않는 세이브</span>
    );

  const nearFull = usage !== undefined && usage >= tables.ui.storageWarnRatio;

  return (
    <div className="scr">
      <main className="scr-body shell-body">
        <div className="pg top-16 px20" style={{ gap: 10 }} data-role="page">
          <div data-ui="Settings.header">
            <BackRow title="설정" onBack={() => ctx.go(back ?? { name: 'home' })} />
          </div>
          <div className="card set-current" data-role="card" data-ui="Settings.currentSlot">
            <div className="row between">
              <div className="col" style={{ minWidth: 0 }}>
                <span className="t13 dim">현재 슬롯</span>
                <span className="ellipsis" style={{ fontSize: 16, fontWeight: 700 }}>
                  {game.state.guildName} · {game.state.day}일차
                </span>
              </div>
              <button className="set-hit" data-touch onClick={() => saveHere(game.slotId)}>
                <span className="set-btn gold">지금 저장</span>
              </button>
            </div>
            <span className="sub">{last ? `마지막 저장 ${last.summary.day}일차${last.kind === 'auto' ? ' 시작 시 (자동)' : ' (수동)'}` : '아직 저장하지 않았습니다'}</span>
          </div>
        </div>
        <div className="pg px20 set-group" data-role="page" data-ui="Settings.slots">
          <span className="set-title">저장 · 불러오기</span>
          {mine?.autos.map((f, i) => (
            <div key={`a${i}`} className="set-row">
              <div className="set-label">
                <span>자동 저장 {i + 1}</span>
                <span className="sub">
                  {f.summary.day}일차 · {relativeTime(f.savedAt)}
                </span>
              </div>
              {i === 0 && <span className="sub">최신</span>}
              <LoadBtn slotId={game.slotId} f={f} />
            </div>
          ))}
          {mine?.manual && (
            <div className="set-row">
              <div className="set-label">
                <span>수동 저장</span>
                <span className="sub">
                  {mine.manual.summary.day}일차 · {relativeTime(mine.manual.savedAt)}
                </span>
              </div>
              <LoadBtn slotId={game.slotId} f={mine.manual} />
            </div>
          )}
          {!files.length && (
            <div className="set-row">
              <span className="sub">이 슬롯에 저장된 파일이 없습니다. 하루를 넘길 때마다 자동 저장됩니다(최근 {saves.policy.autoSavesPerSlot}개).</span>
            </div>
          )}
          <div className="set-row" data-ui="Settings.transfer">
            <div className="set-label">
              <span>다른 슬롯 · 내보내기</span>
              <span className="sub" style={nearFull ? { color: 'var(--c-warn)' } : undefined}>
                {nearFull ? `저장 공간 ${Math.round(usage! * 100)}% 사용 · 오래된 슬롯을 내보내고 지우세요` : '슬롯 목록, 파일로 내보내기·가져오기'}
              </span>
            </div>
            <button className="set-hit" data-touch onClick={() => setSheet('transfer')}>
              <span className="set-btn">열기</span>
            </button>
          </div>
        </div>
        <div className="pg px20 set-group" data-role="page" data-ui="Settings.game">
          <span className="set-title">게임</span>
          <div className="set-row">
            <div className="set-label">
              <span>전투 재생 속도</span>
              <span className="sub">자동 전투 로그</span>
            </div>
            <Seg
              label="전투 재생 속도"
              value={settings.replaySpeed}
              options={tables.ui.replay.speeds.map((x) => ({ value: x, label: `${x}x` }))}
              onChange={(v) => deviceSettings.set({ replaySpeed: v })}
            />
          </div>
          <div className="set-row">
            <div className="set-label">
              <span>소리</span>
              <span className="sub">효과음 · 배경음</span>
            </div>
            <Toggle label="소리" checked={settings.sound} onChange={(v) => deviceSettings.set({ sound: v })} />
          </div>
          <div className="set-row">
            <div className="set-label">
              <span>중요 행동 확인</span>
              <span className="sub">철수, 덮어쓰기 등</span>
            </div>
            <Toggle label="중요 행동 확인" checked={settings.confirmImportant} onChange={(v) => deviceSettings.set({ confirmImportant: v })} />
          </div>
          {/* 지시서 022: 세이브에 저장하는 게임 설정(기기 설정이 아님) */}
          <div className="set-row" data-ui="settings.autoOuter">
            <div className="set-label">
              <span>자동 배치</span>
              <span className="sub">쉬는 계약자를 외곽 임무에 보냄</span>
            </div>
            <Toggle
              label="자동 배치"
              checked={game.state.settings.autoOuter}
              onChange={(v) => ctx.setState({ ...game.state, settings: { ...game.state.settings, autoOuter: v } })}
            />
          </div>
          <div className="set-row" data-ui="Settings.help">
            <div className="set-label">
              <span>도움말</span>
              <span className="sub">상태 효과, 속성, 역할 설명</span>
            </div>
            <button className="set-hit" data-touch onClick={() => ctx.go({ name: 'help', back: { name: 'saves', back } })}>
              <span className="set-btn">열기</span>
            </button>
          </div>
        </div>
        <div className="grow" />
      </main>
      <div className="foot px20" style={{ paddingTop: 0, paddingBottom: 16 }}>
        <button
          className="btn-act"
          style={{ width: '50%', flex: 'none', fontSize: 15, fontWeight: 500 }}
          data-ui="Settings.danger"
          onClick={() =>
            confirmOrRun({
              title: '새 게임',
              message: (
                <p className="t14" style={{ margin: 0 }}>
                  새 게임을 시작합니다. 지금 진행 중인 내용 중 저장하지 않은 부분은 사라집니다(이 슬롯의 저장은 남습니다).
                </p>
              ),
              label: '새 게임',
              danger: true,
              run: onNewGame,
            })
          }
        >
          새 게임
        </button>
        <button className="btn-act" style={{ width: '50%', flex: 'none', fontSize: 15, fontWeight: 500 }} data-ui="Settings.about" onClick={() => setSheet('about')}>
          정보 · 버전 v{SAVE_VERSION}
        </button>
      </div>

      {sheet === 'transfer' && (
        <Sheet title="다른 슬롯 · 내보내기" onClose={() => setSheet(null)}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-act grow" style={{ fontSize: 14 }} onClick={() => saveHere(newSlotId())}>
              새 슬롯에 저장
            </button>
            <button className="btn-act grow" style={{ fontSize: 14 }} onClick={() => downloadText(`arche-${game.state.guildName}-${game.state.day}일차.json`, saves.exportState(game.state))}>
              파일로 내보내기
            </button>
          </div>
          <button className="btn-act" style={{ fontSize: 14 }} onClick={() => fileInput.current?.click()}>
            파일에서 불러오기
          </button>
          {importError && (
            <p className="t13" style={{ margin: 0, color: 'var(--c-bad)' }} role="alert">
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
          <div className="col set-slots">
            {slots.length === 0 && <p className="sub">저장된 슬롯이 없습니다.</p>}
            {slots.map((slot) => {
              const head = slot.manual ?? slot.autos[0];
              return (
                <div key={slot.slotId} className="col" style={{ gap: 2 }}>
                  <div className="row between">
                    <span className="t14 m ellipsis">
                      {head.summary.guildName}
                      {slot.slotId === game.slotId && <span style={{ color: 'var(--c-ok)' }}> · 진행 중</span>}
                    </span>
                    <button className="set-hit" data-touch onClick={() => remove(slot)}>
                      <span className="set-btn" style={{ color: 'var(--c-bad)' }}>
                        삭제
                      </span>
                    </button>
                  </div>
                  {[...(slot.manual ? [slot.manual] : []), ...slot.autos].map((f, i) => (
                    <div key={`${f.kind}-${i}`} className="set-row">
                      <div className="set-label">
                        <span style={{ fontSize: 14 }}>
                          {f.kind === 'manual' ? '수동' : '자동'} · {f.summary.day}일차
                        </span>
                        <span className="sub">{formatDateTime(f.savedAt)}</span>
                      </div>
                      <button className="set-hit" data-touch aria-label="파일로 내보내기" onClick={() => downloadText(fileName(f), serializeSave(f))}>
                        <span className="set-btn">내보내기</span>
                      </button>
                      <LoadBtn slotId={slot.slotId} f={f} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <button className="btn-act" onClick={() => setSheet(null)}>
            닫기
          </button>
        </Sheet>
      )}

      {sheet === 'about' && (
        <Sheet title="정보" onClose={() => setSheet(null)}>
          <dl className="kv-list">
            <dt>게임</dt>
            <dd>Arche</dd>
            <dt>저장 형식 버전</dt>
            <dd>v{SAVE_VERSION}</dd>
            <dt>자동 저장</dt>
            <dd>슬롯별 최근 {saves.policy.autoSavesPerSlot}개 순환</dd>
            {usage !== undefined && (
              <>
                <dt>저장 공간</dt>
                <dd>{Math.round(usage * 100)}% 사용</dd>
              </>
            )}
          </dl>
          <button className="btn-act" onClick={() => setSheet(null)}>
            닫기
          </button>
        </Sheet>
      )}

      {pending && (
        <Sheet title={pending.title} onClose={() => setPending(null)}>
          {pending.message}
          <button
            className={`btn-act ${pending.danger ? 'danger' : 'primary'}`}
            onClick={async () => {
              const p = pending;
              setPending(null);
              await p.run();
            }}
          >
            {pending.label}
          </button>
          <button className="btn-act" onClick={() => setPending(null)}>
            취소
          </button>
        </Sheet>
      )}
    </div>
  );
}
