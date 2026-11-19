import type { SaveRecord, SaveRepository } from './repository';

const DB_NAME = 'arche';
const DB_VERSION = 1;
const STORE = 'saves';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 브라우저 IndexedDB 구현. localStorage보다 용량이 커서 슬롯 무제한에 맞다. */
export class IndexedDbSaveRepository implements SaveRepository {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly dbName = DB_NAME,
  ) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = this.factory.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string) {
    return promisify<SaveRecord | undefined>((await this.store('readonly')).get(key));
  }
  async put(record: SaveRecord) {
    await promisify((await this.store('readwrite')).put(record));
  }
  async delete(key: string) {
    await promisify((await this.store('readwrite')).delete(key));
  }
  async list() {
    return promisify<SaveRecord[]>((await this.store('readonly')).getAll());
  }
}
