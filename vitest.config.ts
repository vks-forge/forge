/**
 * Vitest configuration for the whole workspace.
 *
 * Why: one root config runs every package suite from each package's `__tests__/` folder (code.md
 *   rule 8, d-0040) and enforces the coverage floor on core (70% lines).
 *
 * Exports: default export (vitest config).
 * Depends on: vitest. No IO.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/index.ts'],
      thresholds: { lines: 70 },
    },
  },
});
