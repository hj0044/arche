import { defineConfig } from '@playwright/test';

// ui:check(지시서 017 A-4): 개발 서버를 띄우고 픽스처로 화면마다 계약을 검사한다.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  use: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    reducedMotion: 'reduce',
    trace: 'off',
  },
  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    url: 'http://localhost:5175/',
    reuseExistingServer: true,
    cwd: '../..',
    timeout: 60_000,
  },
});
