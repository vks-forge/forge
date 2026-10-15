/**
 * Pins: in a real browser the four Forge settings screens render, a harness page loads its
 * sections, a settings field can be edited to reveal the save form, and none of them scrolls
 * sideways, at 375 px (phone) and 1280 px (desktop).
 *
 * Why: forms with long labels, a two-column section layout and dialogs are exactly what
 *   overflows or hides behind other layers on a phone, and jsdom has no layout to show it.
 *   Fixture data is forced by the Playwright config, so no Forge server is needed.
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
  test.describe(`settings ${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('harness list and detail', async ({ page }) => {
      await page.goto('/settings/harnesses');

      await expect(
        page.getByRole('heading', { name: 'Harnesses', level: 1 }),
      ).toBeVisible();

      await page.getByRole('link', { name: /claude/ }).click();

      await expect(page.getByRole('heading', { name: 'claude', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Test harness' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve shell' })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({
        path: `dist/e2e/harness-${size.name}.png`,
        fullPage: true,
      });

      await page.getByRole('button', { name: 'Approve shell' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toBeHidden();
    });

    test('github connections', async ({ page }) => {
      await page.goto('/settings/github');

      await expect(page.getByRole('list', { name: 'GitHub connections' })).toBeVisible();
      await page.getByRole('button', { name: 'Add connection' }).click();
      await expect(page.getByLabel('Private key (.pem)')).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/github-${size.name}.png`, fullPage: true });
    });

    test('limits: editing reveals the save form', async ({ page }) => {
      await page.goto('/settings/limits');

      const field = page.getByLabel('Per project');
      await field.fill('2');

      await expect(page.getByRole('form', { name: 'Save settings' })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `dist/e2e/limits-${size.name}.png`, fullPage: true });
    });

    test('general', async ({ page }) => {
      await page.goto('/settings/general');

      await expect(page.getByRole('heading', { name: 'Data folder' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Settings history' })).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  });
}
