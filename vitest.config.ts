/**
 * Vitest configuration for the whole workspace.
 *
 * Why: every package's and app's tests must run from one `pnpm test` at the root with the
 *   same resolution as the build, so a green run means the whole workspace is green. It
 *   also enforces per-package line-coverage floors (70% for core and db, the state
 *   machine and storage the Director's correctness rests on; 80% for tools, mcp, hooks,
 *   drivers, engine, git, memory, secrets and apps/mcp and apps/cli, the policy and adapter code) so they cannot quietly lose test
 *   coverage. Live harness probes in packages/drivers/__tests__/probes skip themselves
 *   unless FORGE_PROBES=1, so they never count toward or against these floors.
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
        'packages/drivers/src/**/*.ts',
        'packages/engine/src/**/*.ts',
        'packages/gates/src/**/*.ts',
        'packages/git/src/**/*.ts',
        'packages/memory/src/**/*.ts',
        'packages/secrets/src/**/*.ts',
        'apps/mcp/src/**/*.ts',
        'apps/cli/src/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/index.ts', 'apps/*/src/main.ts'],
      thresholds: {
        'packages/core/src/**': { lines: 70 },
        'packages/db/src/**': { lines: 70 },
        'packages/tools/src/**': { lines: 80 },
        'packages/mcp/src/**': { lines: 80 },
        'packages/hooks/src/**': { lines: 80 },
        'packages/drivers/src/**': { lines: 80 },
        'packages/engine/src/**': { lines: 80 },
        'packages/gates/src/**': { lines: 80 },
        'packages/git/src/**': { lines: 80 },
        'packages/memory/src/**': { lines: 80 },
        'packages/secrets/src/**': { lines: 80 },
        'apps/mcp/src/**': { lines: 80 },
        'apps/cli/src/**': { lines: 80 },
      },
    },
  },
});
