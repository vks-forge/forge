/**
 * Runs the Slice 2 preflight probes against the real harness (`pnpm probes`).
 *
 * Why: The probes spend subscription tokens, so they are skipped unless FORGE_PROBES=1. Operators need one portable command that opts in and propagates vitest's exit code, without adding a cross-platform env dependency. Live probes run the compiled hook client (`bin/hook.js` loads `dist/`), so a probe run on a cleaned tree fails in confusing ways (the hook never reaches the server); the script therefore runs an incremental `tsc -b` first unless `--no-build` is given. It launches vitest through `node` on its own JS entry (no `pnpm.cmd`, no shell), because Node refuses to spawn `.cmd` files without a shell on Windows (CVE-2024-27980) and a shell would re-parse the forwarded arguments.
 *
 * Exports: none (script). Usage: `pnpm probes [vitest args]`; `--dry` prints the commands and exits without spawning (and without spending anything); `--no-build` skips the `tsc -b` step.
 * Depends on: node:child_process, node:module, node:path, typescript and vitest (their bin files). IO: spawns tsc and vitest.
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

const tscEntry = require.resolve('typescript/bin/tsc');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const build = !args.includes('--no-build');
const vitestArgs = [
  vitestEntry,
  'run',
  '__tests__/probes',
  ...args.filter((a) => a !== '--dry' && a !== '--no-build'),
];

const tscArgs = [tscEntry, '-b'];
const show = (argv) =>
  `${JSON.stringify(process.execPath)} ${argv.map((a) => JSON.stringify(a)).join(' ')}`;

if (dry) {
  if (build) {
    console.log(show(tscArgs));
  }

  console.log(`FORGE_PROBES=1 ${show(vitestArgs)}`);
  process.exit(0);
}

if (build) {
  const built = spawnSync(process.execPath, tscArgs, { stdio: 'inherit', shell: false });
  if (built.status !== 0) {
    console.error('probes: build failed (tsc -b); fix it or pass --no-build');
    process.exit(built.status ?? 1);
  }
}

const result = spawnSync(process.execPath, vitestArgs, {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FORGE_PROBES: '1' },
});

process.exit(result.status ?? 1);
