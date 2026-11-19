import type { SaveFile, SaveKind } from './saveFile';

/** 저장소에 들어가는 한 건. key는 저장소 안에서 유일하다. */
export interface SaveRecord {
  key: string;
  slotId: string;
  kind: SaveKind;
  /** 자동 저장 순환에서 오래된 것을 고르는 순번 */
  seq: number;
  file: SaveFile;
}

/**
 * 세이브 저장소 인터페이스. 1단계는 브라우저 IndexedDB 구현을 쓰고,
 * 나중에 서버 저장 구현으로 바꿔 끼운다. 슬롯 규칙(순환, 덮어쓰기 확인)은 SaveService가 맡는다.
 */
export interface SaveRepository {
  get(key: string): Promise<SaveRecord | undefined>;
  put(record: SaveRecord): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<SaveRecord[]>;
}

/** 메모리 구현. 테스트와 저장소를 쓸 수 없는 환경의 대체용. */
export class MemorySaveRepository implements SaveRepository {
  private records = new Map<string, SaveRecord>();
  async get(key: string) {
    const r = this.records.get(key);
    return r && structuredClone(r);
  }
  async put(record: SaveRecord) {
    this.records.set(record.key, structuredClone(record));
  }
  async delete(key: string) {
    this.records.delete(key);
  }
  async list() {
    return [...this.records.values()].map((r) => structuredClone(r));
  }
}
