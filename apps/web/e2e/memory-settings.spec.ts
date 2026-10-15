/**
 * Pins: in a real browser the Memory and Project settings screens render against a real Forge
 * server, a setting can be edited and saved as the next version, and neither screen scrolls
 * sideways, at 375 px (phone) and 1280 px (desktop).
 *
 * Why: a drawer that overflows a phone, a sticky save bar that covers the last field, or a
 *   five-column check row that forces sideways scrolling only exist with real layout. The
 *   data is a seeded server: a project with no memory records (no API creates a proposal, the
 *   Director writes them, so answering one is pinned by the component tests) and a project
 *   whose settings can be saved (each size saves on its own project, so each is version 2).
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

    test('memory: a project with no records shows every tab and its empty state', async ({
      page,
    }) => {
      await page.goto('/p/sample-service/memory');

      await expect(page.getByRole('heading', { name: 'Memory', level: 1 })).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Memory' })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/memory-${size.name}.png` });

      await page.getByRole('tab', { name: /Rejected/ }).click();
      await expect(page.getByText(/Approaches you reject appear here/)).toBeVisible();
      await page.getByRole('tab', { name: /Outcomes/ }).click();
      await expect(page.getByText(/Outcomes of finished tickets/)).toBeVisible();
      await expectNoSidewaysScroll(page);
    });

    test('settings: inherited vs overridden, edit, save a new version', async ({
      page,
    }) => {
      // One project per size: a saved override would flip the switch for the next run.
      await page.goto(
        `/p/${size.name === 'phone' ? 'sample-service' : 'sample-web'}/settings`,
      );

      await expect(
        page.getByRole('heading', { name: 'Project settings', level: 1 }),
      ).toBeVisible();

      await expect(
        page.getByRole('switch', { name: 'Override Fallback harnesses' }),
      ).not.toBeChecked();

      await expectNoSidewaysScroll(page);
      await page.screenshot({
        path: `dist/e2e/settings-${size.name}.png`,
        fullPage: true,
      });

      await page.getByRole('switch', { name: 'Override Remote name' }).click();
      await page.getByRole('textbox', { name: 'Remote name' }).fill('origin');
      await page.getByLabel('Reason for this change').fill('push to origin');
      await page.getByRole('button', { name: 'Save as v2' }).click();

      await expect(page.getByText(/Saved as version 2/)).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  });
}
