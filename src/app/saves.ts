// 앱 층: 화면이 쓰는 세이브 기능을 한 곳에서 내보낸다(화면은 src/storage를 직접 임포트하지 않는다. 지시서 017).
import { IndexedDbSaveRepository } from '../storage/indexedDb';
import { MemorySaveRepository, type SaveRepository } from '../storage/repository';
import { SaveService } from '../storage/saveService';
export { storageUsageRatio } from '../storage/quota';
export { parseSave, serializeSave, SAVE_VERSION, type SaveFile } from '../storage/saveFile';
export { newSlotId, type SlotSummary } from '../storage/saveService';

/** 개발 서버에서 ?fixture=ui면 UI 픽스처를 메모리 저장소로 쓴다(프로덕션 빌드에서는 동작하지 않는다) */
export const UI_FIXTURE_SLOT = 'ui-fixture';
export const isUiFixture = (): boolean =>
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('fixture') === 'ui';

function makeRepository(): SaveRepository {
  if (isUiFixture() || typeof indexedDB === 'undefined') return new MemorySaveRepository();
  return new IndexedDbSaveRepository();
}

/** 화면이 쓰는 세이브 서비스. IndexedDB가 없으면(사생활 모드 등) 메모리로 대체한다. */
export const saves = new SaveService(makeRepository());

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
