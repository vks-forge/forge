/**
 * Playwright configuration for the control room's browser smoke.
 *
 * Why: component tests run in jsdom, which has no layout, so it cannot catch a sidebar that
 *   overflows at 375 px or a menu that renders behind the page. The smoke builds the app with
 *   fixture data forced (`VITE_FORGE_API=mock`, a dev/test flag) so it needs no Forge server,
 *   serves the production bundle with `vite preview`, and drives it in a real browser at phone
 *   and desktop widths. It is not part of `pnpm test`; run it with
 *   `pnpm --filter @forge/web e2e`. Output goes under `dist/` so it is never committed.
 *
 * Exports: default export (Playwright config).
 * Depends on: @playwright/test.
 */

import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'dist/e2e',
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    env: { VITE_FORGE_API: 'mock' },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
