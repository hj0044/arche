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

// 계약에는 있지만 아직 지시서가 구현하지 않은 구역. 해당 지시서에서 구현하면 이 목록에서 지운다.
const PENDING: Record<string, string[]> = {};
// 흐름 순서 밖에 있는 구역: 바텀 시트(열어야 보임)와 스크롤 영역(목록 구역들을 감싼다). 별도 테스트로 확인한다
const OUT_OF_FLOW: Record<string, string[]> = { Recruit: ['sheet', 'scroll'] };
// 서브 탭 화면에서 같이 보이는 부모 화면 구역
const PARENT_SECTIONS = ['header', 'subtabs'];

for (const sc of SCREENS) {
  const cname = sc.contractOf ?? sc.name;
  const spec = contract.screens[cname];
  test.describe(sc.name, () => {
    test.beforeEach(async ({ page }) => open(page, sc.screen));

    test('구역 계약: 순서와 이름', async ({ page }) => {
      // 제안 화면(탑·보스·영입)은 콘텐츠의 서브 탭이고 계약에 구역이 없다
      test.skip(spec.sections.length === 0, '계약에 구역이 없는 제안 화면');
      // 구역 이름은 '화면.구역'(대문자 시작). 소문자로 시작하는 data-ui(예: recruit.level)는 요소 표시라 구역이 아니다
      const found: string[] = (await page.$$eval('[data-ui]', (els) => els.map((e) => e.getAttribute('data-ui')!))).filter((x) => /^[A-Z]/.test(x));
      const prefix = `${cname}.`;
      const outOfFlow = OUT_OF_FLOW[cname] ?? [];
      const allMine = found.filter((x) => x.startsWith(prefix)).map((x) => x.slice(prefix.length));
      const mine = allMine.filter((x) => !outOfFlow.includes(x));
      const parentIds = sc.parent ? PARENT_SECTIONS.map((id) => `${sc.parent}.${id}`) : [];
      const others = found.filter((x) => !x.startsWith(prefix) && !parentIds.includes(x));
      expect(others, '다른 화면의 data-ui').toEqual([]);
      const ids: string[] = spec.sections.map((s: { id: string }) => s.id);
      const unknown = allMine.filter((x) => !ids.includes(x));
      expect(unknown, '계약에 없는 구역').toEqual([]);
      const pending = PENDING[cname] ?? [];
      const required = spec.sections
        .filter((s: { optionalChildren?: boolean }) => !s.optionalChildren)
        .map((s: { id: string }) => s.id)
        .filter((id: string) => !pending.includes(id) && !outOfFlow.includes(id));
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

// 020: 계약자 상세 스킬 구역(기본 공격 1 + 액티브 3, 쿨다운 칩, 설명 안의 상태 아이콘), 스크롤 영역
test('계약자 상세 스킬 구역', async ({ page }) => {
  await open(page, 'merc');
  const rows = page.locator('[data-ui="MercDetail.skills"] .skill-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.first().locator('.kind')).toHaveText('기본');
  await expect(rows.first().locator('.cd')).toHaveText('쿨 없음');
  for (let i = 1; i < 4; i++) {
    await expect(rows.nth(i).locator('.kind')).toHaveText('액티브');
    await expect(rows.nth(i).locator('.cd')).toHaveText(/^쿨 \d+$/);
  }
  // 픽스처 첫 계약자(강태산: 방패 강타)의 설명에 기절 아이콘
  await expect(page.locator('[data-ui="MercDetail.skills"] [data-status=stun]')).toHaveCount(1);
  // 헤더·하단 버튼은 고정, 가운데만 스크롤
  const sc = await page.$eval('[data-ui="merc.scroll"] .md-scroll-in', (e) => ({ h: e.clientHeight, sh: e.scrollHeight, ov: getComputedStyle(e).overflowY }));
  expect(sc.ov).toBe('auto');
  expect(sc.sh).toBeGreaterThan(sc.h);
});

// 020: 전투 상태 아이콘(초상당 최대 4개 + N), 누르면 설명 시트, 도움말 열기
test('전투 상태 아이콘과 설명 시트', async ({ page }) => {
  await open(page, 'replay');
  const groups = page.locator('[data-ui="battle.status"]');
  expect(await groups.count()).toBeGreaterThan(0);
  const counts = await groups.evaluateAll((els) => els.map((e) => e.querySelectorAll('[data-status]').length));
  for (const n of counts) expect(n).toBeLessThanOrEqual(4);
  const size = await groups.first().locator('[data-status]').first().boundingBox();
  expect(Math.round(size!.width)).toBe(16);
  await groups.first().click();
  const sheet = page.locator('[data-ui="help.sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('라운드 남음');
  await sheet.getByRole('button', { name: '도움말 열기' }).click();
  await expect(page.locator('[data-ui="Help.topics"]')).toBeVisible();
  await expect(page.locator('.help-sec-head[aria-expanded=true]')).toContainText('상태 효과');
});

// 020: 도움말 — 항목은 help.json, 펼친 항목은 하나, 상태 효과 5행, 검색은 부분 일치, 설정에서 진입
test('도움말 화면', async ({ page }) => {
  await open(page, 'saves');
  await page.locator('[data-ui="Settings.help"] button').click();
  await expect(page.locator('[data-ui="help.section"]')).toHaveCount(6);
  await expect(page.locator('.help-sec-head[aria-expanded=true]')).toHaveCount(0);
  await page.locator('.help-sec-head').first().click();
  await expect(page.locator('.help-body [data-status]')).toHaveCount(5);
  await page.locator('.help-sec-head').nth(2).click();
  await expect(page.locator('.help-sec-head[aria-expanded=true]')).toHaveCount(1);
  await expect(page.locator('.help-sec-head[aria-expanded=true]')).toContainText('역할');
  await expect(page.locator('.help-body .help-item')).toHaveCount(8);
  await page.getByRole('searchbox', { name: '용어 검색' }).fill('도발');
  const titles = await page.locator('.help-sec-head .t').allInnerTexts();
  expect(titles).toContain('전열과 후열');
  expect(titles).not.toContain('위험도');
});

// 021: 계약자 상세 성장률 구역(6칸, 별 5단계, '+N.NN% / 레벨'), 별은 growthStarStep으로 계산
test('계약자 상세 성장률 구역', async ({ page }) => {
  await open(page, 'merc');
  const cells = page.locator('[data-ui="MercDetail.growth"] .growth-cell');
  await expect(cells).toHaveCount(6);
  const stats = await cells.evaluateAll((els) => els.map((e) => e.getAttribute('data-stat')));
  expect(stats).toEqual(['hp', 'spd', 'pAtk', 'eAtk', 'pDef', 'eDef']);
  for (let i = 0; i < 6; i++) {
    await expect(cells.nth(i).locator('.val')).toHaveText(/^\+\d+\.\d{2}% \/ 레벨$/);
    const on = (await cells.nth(i).locator('.stars .on').innerText()).length;
    const off = (await cells.nth(i).locator('.stars .off').innerText()).length;
    expect(on + off).toBe(5);
    expect(on).toBeGreaterThanOrEqual(1);
  }
  // 위치: 보조 스탯 줄과 스킬 사이
  const order = await page.$$eval('[data-ui^="MercDetail."]', (els) => els.map((e) => e.getAttribute('data-ui')));
  expect(order.indexOf('MercDetail.growth')).toBe(order.indexOf('MercDetail.subStats') + 1);
  expect(order.indexOf('MercDetail.skills')).toBe(order.indexOf('MercDetail.growth') + 1);
});

// 021: 성장 속도(빠름·보통·느림, 경험치 배율)는 화면 어디에도 없다. 상세는 프로필 시트까지 연다
test('성장 속도가 화면에 남지 않는다', async ({ page }) => {
  const banned = /성장 속도|필요 경험치 ×|빠름|느림/;
  for (const sc of SCREENS) {
    await open(page, sc.screen);
    expect(await page.locator('body').innerText(), sc.name).not.toMatch(banned);
  }
  await open(page, 'merc');
  await page.locator('[data-ui="MercDetail.identity"]').click();
  expect(await page.locator('body').innerText()).not.toMatch(banned);
  await open(page, 'mercs');
  await page.getByRole('button', { name: /필터/ }).first().click();
  expect(await page.locator('body').innerText()).not.toMatch(banned);
});

// 022: 하루 결과 외곽 임무 카드, 설정 자동 배치 토글, 주인공·개방자 문구 없음(새 게임 화면 포함)
test('외곽 임무 카드와 자동 배치 토글', async ({ page }) => {
  await open(page, 'dayResult');
  const card = page.locator('[data-ui="Result.outer"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('외곽 임무');
  await expect(card).toContainText(/자동 배치 \d+명/);
  await open(page, 'saves');
  const row = page.locator('[data-ui="settings.autoOuter"]');
  await expect(row).toContainText('자동 배치');
  const sw = row.getByRole('switch');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
});

test('주인공·개방자 문구가 화면에 없다(새 게임 포함)', async ({ page }) => {
  const banned = /주인공|개방자 모드|길드 마스터 모드|주인공 유형/;
  for (const sc of SCREENS) {
    await open(page, sc.screen);
    expect(await page.locator('body').innerText(), sc.name).not.toMatch(banned);
  }
  await open(page, 'saves');
  await page.locator('[data-ui="Settings.danger"]').click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: '새 게임' });
  if (await confirm.count()) await confirm.click();
  await expect(page.getByLabel('마스터 이름')).toBeVisible();
  await expect(page.getByLabel('길드 이름')).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(banned);
  expect(text).not.toMatch(/속성|역할/);
});

// 024: 파티 편성 — 레벨/한계 배지, 탭 해제, 길게 눌러 끌기(마우스로 흉내), 키보드
test('파티 배지: N/M 형식, 슬롯에서 넘치지 않음', async ({ page }) => {
  await open(page, 'party');
  const badges = await page.$$eval('[data-ui="party.level"]', (els) =>
    els.map((e) => {
      const box = e.getBoundingClientRect();
      const host = (e.closest('[data-role=slot]') ?? e.closest('.mcard'))!.getBoundingClientRect();
      return { text: e.textContent ?? '', fits: e.scrollWidth <= e.clientWidth + 0.5 && box.right <= host.right + 0.5, oneLine: box.height < 20, slot: !!e.closest('[data-role=slot]'), size: getComputedStyle(e).fontSize, weight: getComputedStyle(e).fontWeight };
    }),
  );
  expect(badges.filter((b) => b.slot).length).toBeGreaterThan(0);
  expect(badges.filter((b) => !b.slot).length).toBeGreaterThan(0);
  for (const b of badges) {
    expect(b.text).toMatch(/^\d+\/\d+$/);
    expect(b.fits, b.text).toBe(true);
    expect(b.oneLine, b.text).toBe(true);
    if (b.slot) expect([b.size, b.weight]).toEqual(['12px', '700']);
  }
  // 성장 한계 두 자리 + 레벨 두 자리도 슬롯 폭에 들어간다
  const wide = await page.$eval('[data-role=slot] [data-ui="party.level"]', (e) => {
    const keep = e.innerHTML;
    e.innerHTML = '70<span>/70</span>';
    const ok = e.getBoundingClientRect().width <= e.closest('[data-role=slot]')!.getBoundingClientRect().width && e.getBoundingClientRect().height < 20;
    e.innerHTML = keep;
    return ok;
  });
  expect(wide).toBe(true);
});

/** 마우스로 길게 눌러 끌기 */
async function longPressDrag(page: Page, from: string, to: string, release = true) {
  const a = (await page.locator(from).first().boundingBox())!;
  const b = (await page.locator(to).first().boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  if (release) await page.mouse.up();
}

test('파티 끌기: 사본·강조는 끌기 중에만, 놓으면 이동·교체·해제', async ({ page }) => {
  await open(page, 'party');
  const front = page.locator('[data-ui="Party.front"] [data-drop^="filled:"]');
  const back = page.locator('[data-ui="Party.back"] [data-drop^="filled:"]');
  const nFront = await front.count();
  const nBack = await back.count();
  expect(nBack).toBeGreaterThan(0);
  await expect(page.locator('[data-ui="party.ghost"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="party.dropTarget"]')).toHaveCount(0);
  // 후열 첫 칸을 전열 빈 칸으로(놓기 전 상태 확인)
  await longPressDrag(page, '[data-ui="Party.back"] [data-drop^="filled:"]', '[data-ui="Party.front"] [data-drop="empty:front"]', false);
  await expect(page.locator('[data-ui="party.ghost"]')).toHaveCount(1);
  expect(await page.locator('[data-ui="party.dropTarget"]').count()).toBeGreaterThan(0);
  await expect(page.getByText('놓을 칸을 고르세요 · 대기 목록에 놓으면 해제')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-ui="party.ghost"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="party.dropTarget"]')).toHaveCount(0);
  await expect(front).toHaveCount(nFront + 1);
  await expect(back).toHaveCount(nBack - 1);
  // 다른 열 교체: 전열 첫 칸을 후열 첫 칸 위로 → 인원 수는 그대로
  if (nBack - 1 > 0) {
    const f0 = await front.first().getAttribute('data-drop');
    const b0 = await back.first().getAttribute('data-drop');
    await longPressDrag(page, `[data-drop="${f0}"]`, `[data-drop="${b0}"]`);
    await expect(page.locator(`[data-ui="Party.back"] [data-drop="${f0}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-ui="Party.front"] [data-drop="${b0}"]`)).toHaveCount(1);
  }
  // 대기 목록에 놓으면 해제
  const total = (await front.count()) + (await back.count());
  await longPressDrag(page, '[data-ui="Party.front"] [data-drop^="filled:"]', '[data-ui="Party.candidates"] .mcard');
  await expect(page.locator('[data-ui="Party.front"] [data-drop^="filled:"], [data-ui="Party.back"] [data-drop^="filled:"]')).toHaveCount(total - 1);
});

test('파티: 편성된 칸을 누르면 바로 해제(시트 없음), 짧은 탭은 끌기가 아님', async ({ page }) => {
  await open(page, 'party');
  const filled = page.locator('[data-ui="Party.front"] [data-drop^="filled:"], [data-ui="Party.back"] [data-drop^="filled:"]');
  const n = await filled.count();
  await filled.first().click();
  await expect(filled).toHaveCount(n - 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui="party.ghost"]')).toHaveCount(0);
  // 대기 목록의 '편성됨' 카드도 누르면 해제
  const picked = page.locator('[data-ui="Party.candidates"] .picked-wrap .mcard');
  const k = await picked.count();
  if (k) {
    await picked.first().click();
    await expect(filled).toHaveCount(n - 2);
  }
});

test('파티: 키보드로 같은 일을 할 수 있다(방향키로 칸 고르기, Enter로 놓기)', async ({ page }) => {
  await open(page, 'party');
  const back = page.locator('[data-ui="Party.back"] [data-drop^="filled:"]');
  const nBack = await back.count();
  const id = await back.first().getAttribute('data-drop');
  await back.first().focus();
  // 첫 칸(전열 첫 계약자)부터 → 전열 빈 칸까지 이동
  const order = await page.$$eval('[data-ui="Party.front"] [data-drop^="filled:"]', (els) => els.length);
  for (let i = 0; i <= order; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-ui="party.dropTarget"]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-ui="Party.front"] [data-drop="${id}"]`)).toHaveCount(1);
  await expect(back).toHaveCount(nBack - 1);
});

// 023: 영입 화면 — 요약·필터·정렬, 구역별 카드, 배지(017c), 잠김은 ??? · 도시만, 상세 시트, 고정 머리와 목록 스크롤, 터치 44px
test('영입 화면 구역과 카드', async ({ page }) => {
  await open(page, 'recruit');
  for (const id of ['recruit.summary', 'recruit.filter', 'recruit.sort']) await expect(page.locator(`[data-ui="${id}"]`), id).toHaveCount(1);
  for (const k of ['ready', 'progress', 'locked']) expect(await page.locator(`[data-ui="recruit.card.${k}"]`).count(), k).toBeGreaterThan(0);
  // 터치 44px: 필터 버튼, 정렬, 영입 버튼, 잠김 카드
  for (const sel of ['[data-ui="recruit.filter"]', '[data-ui="recruit.sort"]', '[data-ui="recruit.card.ready"] .rc-on', '[data-ui="recruit.card.locked"]']) {
    const b = (await page.locator(sel).first().boundingBox())!;
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  const prog = (await page.locator('[data-ui="recruit.card.progress"]').first().boundingBox())!;
  expect(Math.round(prog.height)).toBe(68);
  // 배지: 영입 가능·진행 중에는 숫자/숫자, 잠김에는 없음(017c)
  for (const k of ['ready', 'progress']) {
    const badges = await page.$$eval(`[data-ui="recruit.card.${k}"]`, (els) => els.map((e) => [...e.querySelectorAll('[data-ui="recruit.level"]')].map((b) => b.textContent ?? '')));
    for (const b of badges) {
      expect(b.length).toBe(1);
      expect(b[0]).toMatch(/^\d+\/\d+$/);
    }
  }
  const locked = await page.$$eval('[data-ui="recruit.card.locked"]', (els) => els.map((e) => ({ badge: e.querySelectorAll('[data-ui="recruit.level"]').length, text: (e.textContent ?? '').trim() })));
  for (const l of locked) {
    expect(l.badge).toBe(0);
    expect(l.text.startsWith('???')).toBe(true);
  }
  // 잠김 카드는 시트를 열지 않는다
  await page.locator('[data-ui="recruit.card.locked"]').first().click();
  await expect(page.locator('[data-ui="recruit.sheet"]')).toHaveCount(0);
  // 머리는 고정, 목록만 스크롤
  const sc = await page.$eval('[data-ui="Recruit.scroll"]', (e) => ({ ov: getComputedStyle(e).overflowY, h: e.clientHeight, sh: e.scrollHeight }));
  expect(sc.ov).toBe('auto');
  expect(sc.sh).toBeGreaterThan(sc.h);
  const before = (await page.locator('[data-ui="Recruit.summary"]').boundingBox())!.y;
  await page.$eval('[data-ui="Recruit.scroll"]', (e) => (e.scrollTop = 400));
  expect((await page.locator('[data-ui="Recruit.summary"]').boundingBox())!.y).toBe(before);
});

test('영입 상세 시트와 필터 시트', async ({ page }) => {
  await open(page, 'recruit');
  await page.locator('[data-ui="recruit.card.progress"]').first().click();
  const sheet = page.locator('[data-ui="recruit.sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('영입 조건');
  await expect(sheet).toContainText(/성장률 ★/);
  const buy = sheet.getByRole('button', { name: /제로/ });
  await expect(buy).toBeDisabled(); // 진행 중 = 조건 미달
  await expect(buy).toContainText('조건 미달');
  expect(Math.round((await buy.boundingBox())!.height)).toBe(52);
  await sheet.getByRole('button', { name: '상세 보기' }).click();
  await expect(page.locator('[data-ui="MercDetail.identity"]')).toBeVisible();
  // 필터 시트: 역할·속성·도시·출신 세력, 적용하면 칩 숫자가 줄고 잠김은 도시로만 걸린다
  await open(page, 'recruit');
  const allChip = await page.locator('[data-ui="Recruit.chips"] .chip').first().innerText();
  await page.locator('[data-ui="recruit.filter"]').click();
  for (const g of ['역할', '속성', '도시', '출신 세력']) await expect(page.getByRole('group', { name: g })).toBeVisible();
  await page.getByRole('group', { name: '역할' }).getByRole('button', { name: '수호자' }).click();
  await page.getByRole('button', { name: /명 보기$/ }).click();
  expect(await page.locator('[data-ui="Recruit.chips"] .chip').first().innerText()).not.toBe(allChip);
  await expect(page.locator('[data-ui="recruit.card.locked"]')).toHaveCount(0);
  // 탭을 바꿔도 필터 유지
  await page.getByRole('tab', { name: '리프트' }).click();
  await page.getByRole('tab', { name: '영입' }).click();
  await expect(page.locator('[data-ui="recruit.filter"]')).toHaveAttribute('aria-pressed', 'true');
});

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

// 027: 계약자 기록 — 상세 하단 '기록'으로 진입, 시즌/통산 토글, 항목 8칸, 해당 없음 칸, 본문만 스크롤, 금지어 없음
test('027 기록: 상세에서 진입하고 시즌·통산을 바꾼다', async ({ page }) => {
  await open(page, 'merc');
  await page.locator('[data-ui="merc.records"]').click();
  await expect(page.locator('[data-ui="Records.header"]')).toContainText('기록');
  await expect(page.locator('.rec-metric')).toHaveCount(8);
  // 기록이 없는 계약자(첫 길드원은 픽스처에서 출전하지 않음)
  await expect(page.locator('[data-ui="records.scoreValue"]')).toHaveText('—');
  await expect(page.locator('[data-ui="Records.recent"]')).toContainText('아직 공략 기록이 없습니다');
  await page.locator('[data-ui="Records.actions"] button').click();
  await expect(page.locator('[data-ui="MercDetail.actions"]')).toBeVisible();
});

test('027 기록: 기록 있는 계약자 — 점수·최근 공략·해당 없음·고정 헤더와 하단 버튼', async ({ page }) => {
  await open(page, 'records');
  await expect(page.locator('[data-ui="records.scoreValue"]')).toHaveText(/^\d+$/);
  await expect(page.locator('.rec-row')).toHaveCount(4);
  await expect(page.locator('.rec-metric[data-na]').first()).toContainText('이 역할은 해당 없음');
  const seasonTxt = await page.locator('[data-ui="Records.counts"]').innerText();
  await page.locator('[data-ui="Records.range"] button', { hasText: '통산' }).click();
  await expect(page.locator('[data-ui="Records.range"] button[aria-selected=true]')).toHaveText('통산');
  expect(await page.locator('[data-ui="Records.counts"]').innerText()).toBe(seasonTxt); // 1시즌 안이라 같다
  // 본문만 스크롤: 헤더와 하단 버튼은 스크롤 영역 밖
  const fixed = await page.evaluate(() => {
    const sc = document.querySelector('[data-ui="records.scroll"]')!;
    return !sc.contains(document.querySelector('[data-ui="Records.header"]')) && !sc.contains(document.querySelector('[data-ui="Records.actions"]')) && getComputedStyle(sc).overflowY === 'auto';
  });
  expect(fixed).toBe(true);
  const text = await page.locator('body').innerText();
  for (const w of ['죽음', '전사', '사망']) expect(text).not.toContain(w);
});

// 027: 상세 하단에 '기록'이 더해져도 레벨업 버튼의 긴 문구가 넘치지 않는다
test('027 상세 하단 버튼: 기록·훈련·레벨업 긴 문구가 한 줄에 들어간다', async ({ page }) => {
  await open(page, 'merc');
  const res = await page.evaluate(() => {
    const btn = document.querySelector('[data-ui="MercDetail.actions"] .btn-big') as HTMLElement;
    const out: string[] = [];
    for (const t of ['레벨업 (경험치 1,399/1,400)', '파견 중에는 레벨업할 수 없음', '레벨업 (아르케 12,345)', '성장 한계에 도달']) {
      btn.textContent = t;
      const range = document.createRange();
      range.selectNodeContents(btn);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      if (lines > 1 || btn.scrollWidth > btn.clientWidth + 0.5 || btn.getBoundingClientRect().height > 48.5) out.push(`${t} ${btn.scrollWidth}/${btn.clientWidth} h${btn.getBoundingClientRect().height}`);
    }
    return out;
  });
  expect(res).toEqual([]);
});
