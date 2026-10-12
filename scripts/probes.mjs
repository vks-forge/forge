/**
 * Runs the Slice 2 preflight probes against the real harness (`pnpm probes`).
 *
 * Why: The probes spend subscription tokens, so they are skipped unless FORGE_PROBES=1. Operators need one portable command that opts in and propagates vitest's exit code, without adding a cross-platform env dependency.
 *
 * Exports: none (script).
 * Depends on: node:child_process, vitest (via pnpm exec). IO: spawns vitest.
 */

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    'packages/drivers/__tests__/probes',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORGE_PROBES: '1' },
  },
);

process.exit(result.status ?? 1);
