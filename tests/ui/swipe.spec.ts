// 스와이프 이동(지시서 017 2항): 실제 터치 이벤트(CDP)로 탭 화면 사이를 오간다.
import { expect, test, type Page } from '@playwright/test';

const BASE = 'http://localhost:5175/?fixture=ui&screen=';

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const current = (page: Page) => page.locator('[data-role=tab-bar] [aria-current=page] [data-role=tab-name]').textContent();

async function open(page: Page, screen: string) {
  await page.goto(BASE + screen);
  await page.waitForSelector('[data-role=tab-bar]', { timeout: 15_000 });
}

test.describe('스와이프 이동', () => {
  test('왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭', async ({ page }) => {
    await open(page, 'home');
    await swipe(page, { x: 300, y: 400 }, { x: 150, y: 410 });
    await expect.poll(() => current(page)).toBe('콘텐츠');
    await swipe(page, { x: 300, y: 600 }, { x: 150, y: 600 });
    await expect.poll(() => current(page)).toBe('계약자');
    await swipe(page, { x: 100, y: 600 }, { x: 260, y: 600 });
    await expect.poll(() => current(page)).toBe('콘텐츠');
  });

  test('첫 탭에서 오른쪽, 끝 탭에서 왼쪽으로는 움직이지 않는다', async ({ page }) => {
    await open(page, 'home');
    await swipe(page, { x: 100, y: 400 }, { x: 300, y: 400 });
    await page.waitForTimeout(150);
    expect(await current(page)).toBe('홈');
    await open(page, 'base');
    await swipe(page, { x: 300, y: 400 }, { x: 100, y: 400 });
    await page.waitForTimeout(150);
    expect(await current(page)).toBe('거점');
  });

  test('짧거나 세로가 큰 제스처, 가장자리 20px, 칩 줄 위 제스처는 무시한다', async ({ page }) => {
    await open(page, 'rifts');
    // 50px: 60px 미만
    await swipe(page, { x: 250, y: 500 }, { x: 200, y: 500 });
    // 가로 100, 세로 80: 1.5배 미만
    await swipe(page, { x: 250, y: 400 }, { x: 150, y: 480 });
    // 왼쪽 가장자리 10px에서 시작
    await swipe(page, { x: 10, y: 500 }, { x: 200, y: 500 });
    // 가로 스크롤 칩 줄 위
    const chips = await page.locator('[data-noswipe]').first().boundingBox();
    await swipe(page, { x: chips!.x + 200, y: chips!.y + chips!.height / 2 }, { x: chips!.x + 40, y: chips!.y + chips!.height / 2 });
    await page.waitForTimeout(150);
    expect(await current(page)).toBe('콘텐츠');
  });

  test('탭바가 없는 화면에서는 스와이프하지 않는다', async ({ page }) => {
    await page.goto(BASE + 'merc');
    await page.waitForSelector('[data-ui]');
    await swipe(page, { x: 300, y: 500 }, { x: 100, y: 500 });
    await page.waitForTimeout(150);
    await expect(page.locator('[data-ui="MercDetail.identity"]')).toBeVisible();
  });
});
