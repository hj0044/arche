// UI 계약 검사(지시서 017 A-4). docs/design/ui/contract.json과 대조한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS, appUrl } from './screens';

const PORT = 5175;
const contract = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../docs/design/ui/contract.json'), 'utf8'));
const M = contract.metrics;

async function open(page: Page, screen: string) {
  const sc = SCREENS.find((s) => s.screen === screen)!;
  await page.goto(appUrl(PORT, sc));
  await page.waitForSelector('[data-ui]', { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
}

for (const sc of SCREENS) {
  const spec = contract.screens[sc.name];
  test.describe(sc.name, () => {
    test.beforeEach(async ({ page }) => open(page, sc.screen));

    test('구역 계약: 순서와 이름', async ({ page }) => {
      // 제안 화면(탑·보스·영입)은 콘텐츠의 서브 탭이고 계약에 구역이 없다
      test.skip(spec.sections.length === 0, '계약에 구역이 없는 제안 화면');
      const found: string[] = await page.$$eval('[data-ui]', (els) => els.map((e) => e.getAttribute('data-ui')!));
      const prefix = `${sc.name}.`;
      const mine = found.filter((x) => x.startsWith(prefix)).map((x) => x.slice(prefix.length));
      const others = found.filter((x) => !x.startsWith(prefix));
      expect(others, '다른 화면의 data-ui').toEqual([]);
      const ids: string[] = spec.sections.map((s: { id: string }) => s.id);
      const unknown = mine.filter((x) => !ids.includes(x));
      expect(unknown, '계약에 없는 구역').toEqual([]);
      const required = spec.sections.filter((s: { optionalChildren?: boolean }) => !s.optionalChildren).map((s: { id: string }) => s.id);
      for (const id of required) expect(mine, `구역 ${id}`).toContain(id);
      // 순서: 계약 순서대로 나와야 한다
      const order = mine.map((x) => ids.indexOf(x));
      expect(order, '구역 순서').toEqual([...order].sort((a, b) => a - b));
    });

    test('수치 계약: 터치 44px, 글자 11px', async ({ page }) => {
      const small = await page.$$eval('button, a, input, [role=button], [data-touch]', (els, min) =>
        els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const st = getComputedStyle(e);
            if (st.visibility === 'hidden' || st.display === 'none' || r.width === 0) return false;
            // data-touch 안쪽의 시각 요소는 바깥이 터치 영역이다
            if (e.closest('[data-touch]') && !e.hasAttribute('data-touch')) return false;
            return r.width < min - 0.5 || r.height < min - 0.5;
          })
          .map((e) => `${e.tagName}.${e.className} "${(e.textContent ?? '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`), M.minTouchPx);
      expect(small, '44px보다 작은 터치 대상').toEqual([]);
      const tiny = await page.$$eval('body *', (els, min) =>
        els
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && getComputedStyle(e).display !== 'none')
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < min - 0.01)
          .map((e) => `${e.tagName} "${e.textContent!.trim().slice(0, 20)}" ${getComputedStyle(e).fontSize}`), M.minFontPx);
      expect(tiny, '11px보다 작은 글자').toEqual([]);
    });

    test('셸: 로고 줄·탭바·여백·카드 모서리', async ({ page }) => {
      const tabBar = page.locator('[data-role=tab-bar]');
      if (spec.tabBar === false) {
        await expect(tabBar).toHaveCount(0);
      } else if (spec.tabBar) {
        await expect(tabBar).toHaveCount(1);
        expect(Math.round((await tabBar.boundingBox())!.height)).toBe(M.tabBarHeightPx);
        const names = (await tabBar.locator('[data-role=tab-name]').allInnerTexts()).map((x) => x.trim());
        expect(names).toEqual(M.tabs);
        await expect(tabBar.locator('[aria-current=page] [data-role=tab-name]')).toHaveText(spec.tabOn);
      }
      const logo = page.locator('[data-role=logo-row]');
      if (await logo.count()) expect(Math.round((await logo.first().boundingBox())!.height)).toBe(M.logoRowHeightPx);
      const pad = await page.$$eval('[data-role=page]', (els) => els.map((e) => [parseFloat(getComputedStyle(e).paddingLeft), parseFloat(getComputedStyle(e).paddingRight)]));
      for (const [l, r] of pad) {
        expect(l).toBeGreaterThanOrEqual(M.pagePaddingXpx[0]);
        expect(l).toBeLessThanOrEqual(M.pagePaddingXpx[1]);
        expect(r).toBeGreaterThanOrEqual(M.pagePaddingXpx[0]);
        expect(r).toBeLessThanOrEqual(M.pagePaddingXpx[1]);
      }
      const radii = await page.$$eval('[data-role=card]', (els) => els.map((e) => getComputedStyle(e).borderTopLeftRadius));
      for (const r of radii) expect(r).toBe(`${M.cardRadiusPx}px`);
    });

    test('위험도 라벨: 5구간 이름과 5칸 막대', async ({ page }) => {
      const pills = await page.$$eval('[data-role=risk-pill]', (els) =>
        els.map((e) => ({ text: (e.textContent ?? '').trim(), bars: e.querySelectorAll('[data-role=risk-bars] > *').length })),
      );
      for (const p of pills) {
        expect(M.riskBands.some((b: string) => p.text.includes(b)), p.text).toBe(true);
        expect(p.bars).toBe(5);
      }
    });
  });
}

test('계약자 그리드 4열, 파티 슬롯 줄당 5', async ({ page }) => {
  await open(page, 'mercs');
  const cols = await page.$eval('[data-ui="Merc.grid"]', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(cols).toBe(M.mercGridColumns);
  await open(page, 'party');
  for (const row of ['front', 'back']) await expect(page.locator(`[data-ui="Party.${row}"] [data-role=slot]`)).toHaveCount(M.partySlotsPerRow);
  const pcols = await page.$eval('[data-ui="Party.candidates"] [data-role=grid]', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(pcols).toBe(M.mercGridColumns);
});

// 017b: 카드 이름(짧은 이름)이 말줄임으로 잘리지 않는다. 계약자 30명 전원을 카드 글꼴·폭으로 재고, 픽스처 화면의 실제 카드도 본다.
const roster: { id: string; name: string; shortName: string }[] = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../src/data/roster.json'), 'utf8'));
const clipped = (sel: string) => (els: Element[]) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => `${sel} ${e.textContent}`);

test('카드 이름이 말줄임(…)으로 잘리지 않는다(30명 전원, 픽스처 기준)', async ({ page }) => {
  await open(page, 'mercs');
  expect(await page.$$eval('.mcard-name', clipped('계약자 카드'))).toEqual([]);
  // 30명 전원: 실제 카드 이름 칸과 같은 글꼴·폭에 짧은 이름을 넣어 잰다
  const overflow = await page.$eval(
    '.mcard-name',
    (el, names) => {
      const box = el as HTMLElement;
      const keep = box.textContent;
      const bad: string[] = [];
      for (const n of names) {
        box.textContent = n;
        if (box.scrollWidth > box.clientWidth + 0.5) bad.push(n);
      }
      box.textContent = keep;
      return bad;
    },
    roster.map((r) => r.shortName),
  );
  expect(overflow).toEqual([]);
  await open(page, 'party');
  expect(await page.$$eval('[data-ui="Party.candidates"] .mcard-name', clipped('파티 후보'))).toEqual([]);
  expect(await page.$$eval('.slot-name', clipped('파티 슬롯'))).toEqual([]);
  const slotOverflow = await page.$eval(
    '.slot-name',
    (el, names) => {
      const box = el as HTMLElement;
      const bad: string[] = [];
      for (const n of names) {
        box.textContent = n;
        if (box.scrollWidth > box.clientWidth + 0.5) bad.push(n);
      }
      return bad;
    },
    roster.map((r) => r.shortName),
  );
  expect(slotOverflow).toEqual([]);
});
