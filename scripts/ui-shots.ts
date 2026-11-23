// 시안과 앱 화면을 같은 조건으로 찍고 나란히 비교한다(지시서 017 A-3).
// 사용: npm run ui:shots [-- 화면이름 ...]
// ① 시안 HTML → docs/design/ui/shots/ref/<화면>.png (이미 올려 둔 것과 같은지 report에 기록)
// ② 앱(개발 서버, ?fixture=ui&screen=…) → shots/app/<화면>.png
// ③ ref | app 나란히 → shots/compare/<화면>.png, 불일치 픽셀 비율 → shots/report.json (pixelmatch threshold 0.2)
// 390×844, deviceScaleFactor 2, 글꼴 로드 대기, 애니메이션 끔(prefers-reduced-motion).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SCREENS, appUrl } from '../tests/ui/screens';

const ROOT = resolve(import.meta.dirname, '..');
const UI = resolve(ROOT, 'docs/design/ui');
const SHOTS = resolve(UI, 'shots');
const PORT = 5174;
const only = process.argv.slice(2);

async function waitForServer(url: string, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* 아직 안 뜸 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`개발 서버가 뜨지 않았다: ${url}`);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

const png = (path: string) => PNG.sync.read(readFileSync(path));

/** 두 PNG의 불일치 비율(크기가 다르면 작은 쪽 기준으로 자름) */
function diffRatio(a: PNG, b: PNG): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const crop = (p: PNG) => {
    if (p.width === w && p.height === h) return p.data;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) p.data.copy(out, y * w * 4, y * p.width * 4, y * p.width * 4 + w * 4);
    return out;
  };
  const n = pixelmatch(crop(a), crop(b), undefined, w, h, { threshold: 0.2 });
  return Math.round((n / (w * h)) * 10000) / 10000;
}

/** ref | app 나란히(사이 16px) */
function sideBySide(a: PNG, b: PNG): PNG {
  const gap = 16;
  const out = new PNG({ width: a.width + gap + b.width, height: Math.max(a.height, b.height) });
  out.data.fill(255);
  PNG.bitblt(a, out, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, out, 0, 0, b.width, b.height, a.width + gap, 0);
  return out;
}

async function main() {
  for (const d of ['ref', 'app', 'compare']) mkdirSync(resolve(SHOTS, d), { recursive: true });
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', hasTouch: true });
    const page = await ctx.newPage();
    const report: Record<string, unknown> = {};
    for (const sc of SCREENS.filter((x) => !only.length || only.includes(x.name))) {
      // ① 시안
      const refPath = resolve(SHOTS, 'ref', `${sc.name}.png`);
      const committed = existsSync(refPath) ? png(refPath) : null;
      await page.goto(`file://${resolve(UI, `${sc.name}.html`)}`);
      await settle(page);
      const refBuf = await page.screenshot();
      const fresh = PNG.sync.read(refBuf);
      const refMatch = committed ? diffRatio(committed, fresh) : null;
      if (!committed) writeFileSync(refPath, refBuf);
      // ② 앱
      await page.goto(appUrl(PORT, sc));
      await page.waitForSelector('[data-ui]', { timeout: 15000 }).catch(() => {});
      await settle(page);
      const appPath = resolve(SHOTS, 'app', `${sc.name}.png`);
      const appBuf = await page.screenshot();
      writeFileSync(appPath, appBuf);
      // ③ 비교
      const ref = committed ?? fresh;
      const app = PNG.sync.read(appBuf);
      writeFileSync(resolve(SHOTS, 'compare', `${sc.name}.png`), PNG.sync.write(sideBySide(ref, app)));
      report[sc.name] = { mismatchRatio: diffRatio(ref, app), refRetakeMismatch: refMatch };
      console.log(`${sc.name}: 불일치 ${(report[sc.name] as { mismatchRatio: number }).mismatchRatio}${refMatch !== null ? ` (시안 다시 찍기 차이 ${refMatch})` : ''}`);
    }
    const reportPath = resolve(SHOTS, 'report.json');
    const prev = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
    writeFileSync(reportPath, JSON.stringify({ ...prev, ...report }, null, 2) + '\n');
    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
