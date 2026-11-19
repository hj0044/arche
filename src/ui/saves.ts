import { IndexedDbSaveRepository } from '../storage/indexedDb';
import { MemorySaveRepository } from '../storage/repository';
import { SaveService } from '../storage/saveService';

/** 화면이 쓰는 세이브 서비스. IndexedDB가 없으면(사생활 모드 등) 메모리로 대체한다. */
export const saves = new SaveService(
  typeof indexedDB !== 'undefined' ? new IndexedDbSaveRepository() : new MemorySaveRepository(),
);

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
