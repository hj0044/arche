import { saveLimits, savePolicy, tables as defaultTables } from '../data';
import type { SemanticTables } from './saveSemantics';
import type { GameState } from '../engine/game';
import type { SaveRecord, SaveRepository } from './repository';
import { createSaveFile, isLoadable, parseSave, serializeSave, type SaveFile } from './saveFile';


export interface SlotSummary {
  slotId: string;
  manual?: SaveFile;
  /** 최신순 */
  autos: SaveFile[];
  /** 가장 최근에 저장된 시각 */
  lastSavedAt: string;
}

export type ManualSaveResult =
  | { status: 'saved' }
  /** 이미 저장이 있다. 확인을 받은 뒤 overwrite: true로 다시 부른다. */
  | { status: 'needsConfirm'; existing: SaveFile };

const manualKey = (slotId: string) => `${slotId}/manual`;
const autoKey = (slotId: string, index: number) => `${slotId}/auto/${index}`;

export function newSlotId(now: Date = new Date()): string {
  return `slot-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * 슬롯 규칙: 수동 저장은 슬롯마다 하나(덮어쓰기 확인), 자동 저장은 슬롯마다 최근 N개 순환(N은 save-policy.json).
 * 슬롯 수는 제한 없다.
 */
export class SaveService {
  constructor(
    private readonly repo: SaveRepository,
    readonly policy: { autoSavesPerSlot: number } = savePolicy,
    /** 의미 검증(값 범위·참조)에 쓰는 데이터 표 */
    readonly semantic: SemanticTables = { ...defaultTables, limits: saveLimits },
  ) {}

  /** 형식·버전·의미 검사를 모두 통과하는 세이브인가(목록 표시용) */
  isLoadable(file: SaveFile): boolean {
    return isLoadable(file, this.semantic);
  }

  async saveManual(slotId: string, state: GameState, opts: { overwrite?: boolean; now?: Date } = {}): Promise<ManualSaveResult> {
    const existing = await this.repo.get(manualKey(slotId));
    if (existing && !opts.overwrite) return { status: 'needsConfirm', existing: existing.file };
    await this.repo.put({ key: manualKey(slotId), slotId, kind: 'manual', seq: 0, file: createSaveFile(state, 'manual', opts.now) });
    return { status: 'saved' };
  }

  /** 순환 자리 중 비었거나 가장 오래된 자리에 쓴다. */
  async saveAuto(slotId: string, state: GameState, now?: Date): Promise<void> {
    const autos = (await this.repo.list()).filter((r) => r.slotId === slotId && r.kind === 'auto');
    const seq = autos.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    let index = autos.length;
    if (autos.length >= this.policy.autoSavesPerSlot) {
      const oldest = autos.reduce((a, b) => (a.seq <= b.seq ? a : b));
      index = Number(oldest.key.split('/').at(-1));
    }
    await this.repo.put({ key: autoKey(slotId, index), slotId, kind: 'auto', seq, file: createSaveFile(state, 'auto', now) });
  }

  async listSlots(): Promise<SlotSummary[]> {
    const bySlot = new Map<string, SaveRecord[]>();
    for (const r of await this.repo.list()) bySlot.set(r.slotId, [...(bySlot.get(r.slotId) ?? []), r]);
    return [...bySlot.entries()]
      .map(([slotId, records]) => {
        const autos = records.filter((r) => r.kind === 'auto').sort((a, b) => b.seq - a.seq).map((r) => r.file);
        const manual = records.find((r) => r.kind === 'manual')?.file;
        const lastSavedAt = records.map((r) => r.file.savedAt).sort().at(-1)!;
        return { slotId, manual, autos, lastSavedAt };
      })
      .sort((a, b) => b.lastSavedAt.localeCompare(a.lastSavedAt));
  }

  async loadManual(slotId: string): Promise<GameState | undefined> {
    const r = await this.repo.get(manualKey(slotId));
    return r && parseSave(r.file, this.semantic).state;
  }

  /** index 0이 가장 최근 자동 저장 */
  async loadAuto(slotId: string, index = 0): Promise<GameState | undefined> {
    const slot = (await this.listSlots()).find((s) => s.slotId === slotId);
    const file = slot?.autos[index];
    return file && parseSave(file, this.semantic).state;
  }

  async deleteSlot(slotId: string): Promise<void> {
    for (const r of await this.repo.list()) if (r.slotId === slotId) await this.repo.delete(r.key);
  }

  /** 파일 내보내기용 JSON 문자열 */
  exportState(state: GameState, now?: Date): string {
    return serializeSave(createSaveFile(state, 'manual', now));
  }

  /** 파일에서 불러와 새 슬롯의 수동 저장으로 넣는다. 새 슬롯 id를 돌려준다. */
  async importFile(text: string, slotId: string = newSlotId()): Promise<{ slotId: string; state: GameState }> {
    // 슬롯에 기록하기 전에 형식과 의미를 모두 검사한다.
    const file = parseSave(text, this.semantic);
    await this.repo.put({ key: manualKey(slotId), slotId, kind: 'manual', seq: 0, file: { ...file, kind: 'manual' } });
    return { slotId, state: file.state };
  }
}
