/**
 * Runs the Slice 2 preflight probes against the real harness (`pnpm probes`).
 *
 * Why: The probes spend subscription tokens, so they are skipped unless FORGE_PROBES=1. Operators need one portable command that opts in and propagates vitest's exit code, without adding a cross-platform env dependency. It launches vitest through `node` on its own JS entry (no `pnpm.cmd`, no shell), because Node refuses to spawn `.cmd` files without a shell on Windows (CVE-2024-27980) and a shell would re-parse the forwarded arguments.
 *
 * Exports: none (script). Usage: `pnpm probes [vitest args]`; `--dry` prints the command and exits without spawning (and without spending anything).
 * Depends on: node:child_process, node:module, node:path, vitest (its bin file). IO: spawns vitest.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const vitestPackage = require.resolve('vitest/package.json');
const bin = require(vitestPackage).bin;
const vitestEntry = join(
  dirname(vitestPackage),
  typeof bin === 'string' ? bin : bin.vitest,
);

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const vitestArgs = [
  vitestEntry,
  'run',
  'packages/drivers/__tests__/probes',
  ...args.filter((a) => a !== '--dry'),
];

if (dry) {
  console.log(
    `FORGE_PROBES=1 ${JSON.stringify(process.execPath)} ${vitestArgs.map((a) => JSON.stringify(a)).join(' ')}`,
  );
  process.exit(0);
}

const result = spawnSync(process.execPath, vitestArgs, {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FORGE_PROBES: '1' },
});

process.exit(result.status ?? 1);
