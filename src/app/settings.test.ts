import { describe, expect, it } from 'vitest';
import { defaultSettings, memorySettingsStore, normalizeSettings, deviceSettings } from './settings';

describe('기기 설정', () => {
  it('깨진 값은 기본값으로 채운다', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings());
    expect(normalizeSettings({ replaySpeed: 7, sound: 'x', confirmImportant: false })).toEqual({ ...defaultSettings(), confirmImportant: false });
  });
  it('저장소 인터페이스로 읽고 쓴다', () => {
    deviceSettings.useStore(memorySettingsStore());
    deviceSettings.set({ replaySpeed: 3 });
    expect(deviceSettings.get().replaySpeed).toBe(3);
    deviceSettings.set({ replaySpeed: 9 });
    expect(deviceSettings.get().replaySpeed).toBe(defaultSettings().replaySpeed);
  });
});
