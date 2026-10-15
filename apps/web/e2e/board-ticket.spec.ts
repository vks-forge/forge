/**
 * Pins: in a real browser the Board shows its columns and cards, a card opens the Ticket page,
 * the live thread renders with the Worker's question in amber, answering it works, and
 * neither screen scrolls the page sideways, at 375 px (phone) and 1280 px (desktop).
 *
 * Why: column layout, the horizontal column scroller on phones and the thread's own scroll
 *   region only exist with real layout, and the SSE stream only with a real EventSource.
 *   The `/api` calls are answered by `stubForge()`, so no Forge server is needed.
 * Exports: none (Playwright spec).
 * Depends on: @playwright/test, e2e/helpers/stub-forge, the built app served by `vite preview`.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { stubForge } from './helpers/stub-forge.js';

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

    test('Board shows columns and cards, a card opens the live Ticket page', async ({
      page,
    }) => {
      await stubForge(page);
      await page.goto('/p/sample-service/board');

      await expect(page.getByRole('heading', { name: 'Board', level: 1 })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Needs you', level: 2 }),
      ).toBeVisible();

      await expect(page.getByRole('link', { name: /Fix off-by-one/ })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/board-${size.name}.png` });

      await page.getByRole('link', { name: /Fix off-by-one/ }).click();

      await expect(page).toHaveURL(/\/p\/sample-service\/tickets\/SVC-4$/);
      await expect(
        page.getByRole('heading', { name: /Fix off-by-one/, level: 1 }),
      ).toBeVisible();

      const log = page.getByRole('log', { name: 'Worker messages' });
      await expect(log.getByText('Reading the nightly report code.')).toBeVisible();
      await expect(
        page.getByText('Question: the Worker needs your answer'),
      ).toBeVisible();

      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/ticket-${size.name}.png` });

      await page.getByLabel('Your answer').fill('Use the account time zone');
      await page.getByRole('button', { name: 'Send answer' }).click();

      await expect(page.getByText(/Answer sent/)).toBeVisible();
    });
  });
}
