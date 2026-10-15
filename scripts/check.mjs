/**
 * Fast local gate run (`pnpm check`): typecheck, lint, format check, tests related to the change.
 *
 * Why: the full suite with coverage takes many minutes on Windows and several agents or
 *   terminals running it at once starved each other into timeouts. Locally a builder needs
 *   a verdict on its own change in seconds, so this runs the cheap whole-repo gates with
 *   incremental caches (`tsc -b`, eslint and prettier `--cache`) and only the tests that
 *   import a file changed against the base (`vitest --changed`), with no coverage. A
 *   machine-wide lock lets one gate run at a time, a second run waits instead of
 *   competing. The full suite with coverage floors runs in CI after push to main (d-0119).
 *   Tools are launched through `node` on their own JS entries (no `.cmd`, no shell): Node
 *   refuses to spawn `.cmd` files without a shell on Windows (CVE-2024-27980).
 *
 * Exports: none (script). Usage: `pnpm check [--no-tests] [--all] [--base=<ref>] [--dry]`.
 *   `--no-tests` stops after the format check; `--all` runs every test (still no coverage);
 *   `--base=<ref>` compares against that ref instead of the merge-base with `origin/main`
 *   (falls back to `HEAD` when `origin/main` does not exist); `--dry` prints the commands
 *   and exits without running or locking. Prints one line per step with its duration and a
 *   final `CHECK PASS` or `CHECK FAIL <step>`; the exit code matches.
 * Depends on: node:child_process, node:fs, node:module, node:os, node:path, typescript,
 *   eslint, prettier and vitest (their bin files). IO: spawns the tools, writes a lockfile
 *   under the OS temp dir and caches under node_modules/.cache.
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const binEntry = (pkg, name = pkg) => {
  const manifest = require.resolve(`${pkg}/package.json`);
  const bin = require(manifest).bin;

  return join(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
};

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const runTests = !args.includes('--no-tests');
const all = args.includes('--all');
const baseFlag = args.find((a) => a.startsWith('--base='));
const unknown = args.filter(
  (a) => !['--dry', '--no-tests', '--all'].includes(a) && !a.startsWith('--base='),
);

if (unknown.length > 0) {
  console.error(`check: unknown argument(s) ${unknown.join(' ')}`);
  process.exit(2);
}

const git = (...gitArgs) => spawnSync('git', gitArgs, { encoding: 'utf8', shell: false });

/** Base commit for `--changed`: explicit flag, else merge-base with origin/main, else HEAD. */
const resolveBase = () => {
  if (baseFlag) {
    return baseFlag.slice('--base='.length);
  }

  const mergeBase = git('merge-base', 'HEAD', 'origin/main');

  return mergeBase.status === 0 ? mergeBase.stdout.trim() : 'HEAD';
};

const node = process.execPath;
const steps = [
  { name: 'typecheck', argv: [binEntry('typescript', 'tsc'), '-b'] },
  {
    name: 'lint',
    argv: [
      binEntry('eslint'),
      '.',
      '--cache',
      '--cache-location',
      'node_modules/.cache/eslint/',
    ],
  },
  {
    name: 'format',
    argv: [
      binEntry('prettier'),
      '--check',
      '--cache',
      '--cache-location',
      'node_modules/.cache/prettier/.prettier-cache',
      '.',
    ],
  },
];

if (runTests) {
  steps.push({
    name: all ? 'tests (all)' : 'tests (changed)',
    tests: true,
    argv: [
      binEntry('vitest'),
      'run',
      '--passWithNoTests',
      ...(all ? [] : ['--changed', resolveBase()]),
    ],
  });
}

const show = (argv) =>
  `${JSON.stringify(node)} ${argv.map((a) => JSON.stringify(a)).join(' ')}`;

if (dry) {
  for (const step of steps) {
    console.log(`${step.name}: ${show(step.argv)}`);
  }

  process.exit(0);
}

const lockPath = join(tmpdir(), 'forge-gates.lock');

const alive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Takes the machine-wide gate lock; a lock whose pid is dead is taken over. */
const acquireLock = async () => {
  let announced = 0;

  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);

      return;
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
        throw error;
      }
    }

    let holder = Number.NaN;
    try {
      holder = Number.parseInt(readFileSync(lockPath, 'utf8'), 10);
    } catch {
      // Released between our open and read: try again.
      continue;
    }

    if (!Number.isInteger(holder) || !alive(holder)) {
      rmSync(lockPath, { force: true });
      continue;
    }

    if (announced !== holder) {
      console.log(`check: waiting for gate run pid ${holder}`);
      announced = holder;
    }

    await sleep(3000);
  }
};

const releaseLock = () => {
  try {
    if (readFileSync(lockPath, 'utf8') === String(process.pid)) {
      rmSync(lockPath, { force: true });
    }
  } catch {
    // Already gone.
  }
};

let child = null;
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    child?.kill();
    releaseLock();
    process.exit(130);
  });
}

/** Runs one step, streaming its output; resolves with exit code and whether it ran no tests. */
const run = (step) =>
  new Promise((resolve) => {
    let noTests = false;
    child = spawn(node, step.argv, {
      shell: false,
      stdio: ['inherit', step.tests ? 'pipe' : 'inherit', 'inherit'],
    });

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      noTests ||= /No test files found/i.test(text);
    });

    child.on('error', () => resolve({ code: 1, noTests }));
    child.on('close', (code) => resolve({ code: code ?? 1, noTests }));
  });

await acquireLock();

for (const step of steps) {
  const started = performance.now();
  const { code, noTests } = await run(step);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const note = noTests ? ' (no tests related to the change)' : '';

  console.log(
    `check: ${step.name} ${code === 0 ? 'ok' : 'FAILED'} in ${seconds}s${note}`,
  );

  if (code !== 0) {
    console.log(`CHECK FAIL ${step.name}`);
    process.exit(code);
  }
}

console.log('CHECK PASS');
