/**
 * Pins: in a real browser the four Forge settings screens render, an empty harness list offers setup, a settings field can be edited to reveal the save form, and none of them scrolls
 * sideways, at 375 px (phone) and 1280 px (desktop).
 *
 * Why: forms with long labels, a two-column section layout and dialogs are exactly what
 *   overflows or hides behind other layers on a phone, and jsdom has no layout to show it.
 *   The data is a real Forge server on a temporary data home.
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
  test.describe(`settings ${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('harness list and setup link', async ({ page }) => {
      await page.goto('/settings/harnesses');

      await expect(
        page.getByRole('heading', { name: 'Harnesses', level: 1 }),
      ).toBeVisible();

      // A fresh server has no harness registered: the list says so and offers the setup link.
      await expect(page.getByText('No harness is set up yet')).toBeVisible();
      await expectNoSidewaysScroll(page);
      await page.screenshot({
        path: `dist/e2e/harness-${size.name}.png`,
        fullPage: true,
      });

      await page.getByRole('link', { name: 'Set up Claude Code' }).click();

      // The setup page of the default harness opens its sign-in form before anything is saved.
      await expect(page.getByRole('heading', { name: 'claude', level: 1 })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Sign-in', level: 2 }),
      ).toBeVisible();

      await expectNoSidewaysScroll(page);
    });

    test('github connections', async ({ page }) => {
      await page.goto('/settings/github');

      await expect(page.getByText('No GitHub connection yet')).toBeVisible();
      await page.getByRole('button', { name: 'Add connection' }).first().click();
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
      await expect(page.getByText('No version has been saved yet.')).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  });
}
