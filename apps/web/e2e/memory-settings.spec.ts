/**
 * Pins: in a real browser the Memory and Project settings screens render, can be used by
 * keyboard-reachable controls, and never scroll sideways, at 375 px (phone) and 1280 px
 * (desktop).
 *
 * Why: a drawer that overflows a phone, a sticky save bar that covers the last field, or a
 *   five-column check row that forces sideways scrolling only exist with real layout. Fixture
 *   data is forced by the Playwright config, so this proves the screens work without a Forge
 *   server: answer a proposal, edit and save a setting, open a record.
 * Exports: none (Playwright spec).
 * Depends on: @playwright/test, the built app served by `vite preview`.
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

    test('memory: filter, open a record, approve a proposal', async ({ page }) => {
      await page.goto('/p/sample-service/memory');

      await expect(page.getByRole('heading', { name: 'Memory', level: 1 })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Proposals/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/memory-${size.name}.png` });

      await page.getByRole('button', { name: /Open x-0001/ }).click();
      await expect(page.getByRole('dialog')).toContainText('Vitest');
      await expectNoSidewaysScroll(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();

      await page.getByRole('button', { name: 'Approve x-0001' }).click();
      await page.getByRole('button', { name: 'Approve proposal' }).click();
      await expect(page.getByText(/x-0001 approved/)).toBeVisible();

      await page.getByRole('tab', { name: /Outcomes/ }).click();
      await expect(page.getByRole('list', { name: 'Outcomes' })).toBeVisible();
      await expectNoSidewaysScroll(page);
    });

    test('settings: inherited vs overridden, edit, save a new version', async ({
      page,
    }) => {
      await page.goto('/p/sample-service/settings');

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
      await page.getByRole('button', { name: 'Save as v4' }).click();

      await expect(page.getByText(/Saved as version 4/)).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  });
}
