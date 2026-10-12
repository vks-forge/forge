/**
 * Vitest configuration for the whole workspace.
 *
 * Why: one root config runs every package suite from each package's `__tests__/` folder (code.md
 *   rule 8, d-0040) and enforces the coverage floor on core and db (70% lines).
 *
 * Exports: default export (vitest config).
 * Depends on: vitest. No IO.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['packages/*/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'packages/db/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/index.ts'],
      thresholds: {
        'packages/core/src/**': { lines: 70 },
        'packages/db/src/**': { lines: 70 },
      },
    },
  },
});
