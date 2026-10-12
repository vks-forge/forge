/**
 * Vitest configuration for the whole workspace.
 *
 * Why: every package's tests must run from one `pnpm test` at the root with the same
 *   resolution as the build, so a green run means the whole workspace is green. It also
 *   enforces a coverage floor (70% lines) on core and db, the packages holding the state
 *   machine and storage the Director's correctness rests on, so they cannot quietly lose
 *   test coverage.
 *
 * Exports: default export (vitest config).
 * Depends on: vitest. No IO.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['packages/*/__tests__/**/*.test.ts', 'apps/*/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'packages/db/src/**/*.ts',
        'packages/tools/src/**/*.ts',
        'packages/hooks/src/**/*.ts',
        'packages/mcp/src/**/*.ts',
        'apps/mcp/src/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/index.ts', 'apps/*/src/main.ts'],
      thresholds: {
        'packages/core/src/**': { lines: 70 },
        'packages/db/src/**': { lines: 70 },
        'packages/tools/src/**': { lines: 80 },
        'packages/mcp/src/**': { lines: 80 },
        'packages/hooks/src/**': { lines: 80 },
        'apps/mcp/src/**': { lines: 80 },
      },
    },
  },
});
