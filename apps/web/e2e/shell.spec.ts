/**
 * Pins: in a real browser the shell renders, `/` opens a project, the project switcher changes
 * the project in place, and the page never scrolls sideways, at 375 px (phone) and 1280 px
 * (desktop).
 *
 * Why: layout bugs (overflowing sidebar, a menu hidden behind the page, horizontal scroll at
 *   320 to 768 px) only exist with real layout. The data is a real Forge server on a
 *   temporary data home.
 * Exports: none (Playwright spec).
 * Depends on: @playwright/test, the real server behind `vite preview`.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SIZES = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('renders the shell and switches project', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/p\/sample-service$/);
      await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
      await expectNoSidewaysScroll(page);

      if (size.width < 768) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
      }

      await expect(page.getByRole('link', { name: 'Board', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Board', exact: true }).click();
      await expect(page).toHaveURL(/\/p\/sample-service\/board$/);

      if (size.width < 768) {
        await page.getByRole('button', { name: 'Open navigation' }).click();
      }

      await page.getByRole('button', { name: 'Switch project' }).click();
      await page.getByRole('menuitemradio', { name: /sample-web/ }).click();

      await expect(page).toHaveURL(/\/p\/sample-web\/board$/);
      await expect(page.getByRole('heading', { name: 'Board', level: 1 })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/shell-${size.name}.png` });
    });
  });
}

test('Ctrl+K opens the project switcher on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/p/sample-service');

  await page.keyboard.press('Control+k');

  await expect(page.getByRole('menu')).toBeVisible();
});
