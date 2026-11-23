/**
 * 기기 설정(지시서 017): 전투 재생 속도·소리·중요 행동 확인. 세이브 파일에 넣지 않는다.
 * 저장소는 인터페이스로 분리했다. 기본 구현은 브라우저 localStorage이고, 읽기·쓰기가 막히면 메모리로만 유지한다.
 * "중요 행동 확인"을 꺼도 덮어쓰기 확인은 항상 남는다(AGENTS.md 1단계 확정 규칙).
 */
import { tables } from '../data';

export interface DeviceSettings {
  replaySpeed: number;
  sound: boolean;
  confirmImportant: boolean;
}

export interface SettingsStore {
  load(): DeviceSettings;
  save(value: DeviceSettings): void;
}

const KEY = 'arche.deviceSettings';

export function defaultSettings(): DeviceSettings {
  const { replaySpeed, sound, confirmImportant } = tables.ui.deviceSettings;
  return { replaySpeed, sound, confirmImportant };
}

/** 저장된 값이 깨졌거나 모르는 값이면 기본값으로 채운다 */
export function normalizeSettings(raw: unknown): DeviceSettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<DeviceSettings>;
  return {
    replaySpeed: tables.ui.replay.speeds.includes(r.replaySpeed as number) ? (r.replaySpeed as number) : d.replaySpeed,
    sound: typeof r.sound === 'boolean' ? r.sound : d.sound,
    confirmImportant: typeof r.confirmImportant === 'boolean' ? r.confirmImportant : d.confirmImportant,
  };
}

export function memorySettingsStore(initial?: DeviceSettings): SettingsStore {
  let v = initial ?? defaultSettings();
  return { load: () => v, save: (x) => void (v = x) };
}

export function localSettingsStore(): SettingsStore {
  const mem = memorySettingsStore();
  return {
    load() {
      try {
        const s = window.localStorage.getItem(KEY);
        return s ? normalizeSettings(JSON.parse(s)) : mem.load();
      } catch {
        return mem.load();
      }
    },
    save(value) {
      mem.save(value);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        /* 저장이 막혀도 이번 실행 동안은 메모리 값을 쓴다 */
      }
    },
  };
}

let store: SettingsStore = typeof window === 'undefined' ? memorySettingsStore() : localSettingsStore();
const listeners = new Set<() => void>();

export const deviceSettings = {
  get: (): DeviceSettings => store.load(),
  set(patch: Partial<DeviceSettings>) {
    store.save(normalizeSettings({ ...store.load(), ...patch }));
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => void listeners.delete(f);
  },
  /** 테스트·픽스처용 */
  useStore(next: SettingsStore) {
    store = next;
  },
};
