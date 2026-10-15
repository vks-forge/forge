/**
 * Playwright configuration for the control room's browser smoke.
 *
 * Why: component tests run in jsdom, which has no layout, so it cannot catch a sidebar that
 *   overflows at 375 px or a menu that renders behind the page. The smoke drives the production
 *   bundle in a real browser at phone and desktop widths against a real Forge server on a
 *   temporary data home (d-0123): `e2e/global-setup.ts` starts and seeds the server, builds the
 *   app and serves it with `vite preview`, whose `/api` proxy adds the install token so the
 *   page never holds it. It is not part of `pnpm test`; run it with
 *   `pnpm --filter @forge/web e2e` after `pnpm build` (the server runs from `dist/`). Output
 *   goes under `dist/` so it is never committed. One worker, because every spec shares the
 *   one seeded server and a spec that saves a setting changes what the next one sees.
 *
 * Exports: default export (Playwright config).
 * Depends on: @playwright/test, e2e/global-setup.
 */

import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'dist/e2e',
  reporter: 'list',
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
});
