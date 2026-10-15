/**
 * Pins: in a real browser, against a real Forge server, the Board shows its columns and the
 * ticket filed through chat intake, the card opens the Ticket page, and neither screen scrolls
 * the page sideways, at 375 px (phone) and 1280 px (desktop).
 *
 * Why: column layout and the horizontal column scroller on phones only exist with real layout.
 *   The data is whatever the seeded server holds (`helpers/real-forge.ts` files one chat
 *   request per project). With no Claude Code configured no Worker ever runs, so the live
 *   thread, a Worker's question and answering it cannot be produced here; those are pinned by
 *   the component tests, and this smoke asserts the Ticket page without a run instead.
 * Exports: none (Playwright spec).
 * Depends on: @playwright/test, e2e/helpers/real-forge, the real server behind `vite preview`.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SEED } from './helpers/real-forge.js';

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

    test('Board shows the seeded ticket, a card opens the Ticket page', async ({
      page,
    }) => {
      // The Director's triage rewrites the title slightly, so match its stable start.
      const title = new RegExp(SEED.ticketTitleStart);
      await page.goto('/p/sample-service/board');

      await expect(page.getByRole('heading', { name: 'Board', level: 1 })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Needs you', level: 2 }),
      ).toBeVisible();

      await expect(page.getByRole('link', { name: title })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/board-${size.name}.png` });

      await page.getByRole('link', { name: title }).click();

      await expect(page).toHaveURL(/\/p\/sample-service\/tickets\/SVC-1$/);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expect(page.getByRole('log', { name: 'Worker messages' })).toHaveCount(0);
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/ticket-${size.name}.png` });
    });
  });
}
