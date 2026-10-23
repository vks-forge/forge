/**
 * Worktree preparer cache against a real process: a tiny fake package manager, run twice.
 *
 * Why: the unit tests script every command, so none can say that a second worktree really gets
 *   its install folder copied back by the real runner, real files and a real toolchain probe
 *   while the install command does not run. This uses a node script (node is always there, since
 *   Forge itself runs on it, and no language is assumed, d-0176) that writes a `fake_modules`
 *   folder and counts its own runs in a file outside the worktrees; the count staying at one after
 *   the second prepare is the proof that the command was skipped.
 *
 * Pins: first prepare runs the script and stores its folder; second worktree with the same
 *   lockfile is restored (script count stays 1, folder present, step marked restored); a changed
 *   lockfile runs it again (count 2); the script saw the Forge-owned cache variable.
 * Depends on: adapters/worktree-preparer, adapters/command-runner, node:fs, node:os, node:path.
 *   Spawns node (heavy project).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupStep } from '@forge/core';
import type { WorktreePrep } from '@forge/core';
import { afterAll, describe, expect, it } from 'vitest';
import { runShellCommand } from '#/adapters/command-runner.js';
import { createWorktreePreparer } from '#/adapters/worktree-preparer.js';

const root = mkdtempSync(join(tmpdir(), 'forge-heavy-cache-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const counter = join(root, 'runs.txt');
const cacheDir = join(root, 'cache');
const script = join(root, 'fake-pm.mjs');
writeFileSync(
  script,
  [
    "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
    `appendFileSync(${JSON.stringify(counter)}, 'run|' + (process.env.FAKE_PM_CACHE ?? 'none') + '\\n');`,
    "mkdirSync('fake_modules/pkg', { recursive: true });",
    "writeFileSync('fake_modules/pkg/index.js', 'module.exports = 1');",
  ].join('\n'),
);

const install = SetupStep.parse({
  name: 'Install fake packages',
  command: `node "${script}"`,
  inputs: ['fake.lock'],
  cache_env: { FAKE_PM_CACHE: 'fake/pm' },
  cache_outputs: ['fake_modules'],
  toolchain: 'node --version',
});

function tree(name: string, lock: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'fake.lock'), lock);

  return dir;
}

function preparer(stores: Promise<void>[]) {
  let record: WorktreePrep | null = null;

  return createWorktreePreparer({
    worktrees: {
      rootOf: (p) => p,
      untracked: async () => [],
      readPrep: async () => record,
      writePrep: async (_p, prep) => {
        record = prep;
      },
      changedFiles: async () => [],
    },
    env: { PATH: process.env['PATH'], Path: process.env['Path'] },
    runCommand: runShellCommand,
    cacheDir,
    trackStore: (p) => stores.push(p),
  });
}

const runs = (): number => readFileSync(counter, 'utf8').match(/^run\|/gm)?.length ?? 0;
const plan = { steps: [install], source: 'settings' as const };
const BASE = { baseSha: 'b'.repeat(40) };

describe('fake package manager through the real runner', () => {
  it('runs once, restores the second worktree without running, reruns on a new lockfile', async () => {
    const stores: Promise<void>[] = [];
    const a = tree('a', 'lock-1');
    const first = await preparer(stores).prepare(a, plan, BASE);
    await Promise.all(stores);

    expect(first.ok).toBe(true);
    expect(runs()).toBe(1);
    expect(readFileSync(counter, 'utf8')).toContain(
      join(cacheDir, 'downloads', 'fake', 'pm'),
    );

    const b = tree('b', 'lock-1');
    const second = await preparer([]).prepare(b, plan, BASE);

    expect(runs()).toBe(1);
    expect(readFileSync(join(b, 'fake_modules', 'pkg', 'index.js'), 'utf8')).toBe(
      'module.exports = 1',
    );

    expect(second.ok && second.prep.steps[0]?.restored).toBe(true);

    const c = tree('c', 'lock-2');
    await preparer([]).prepare(c, plan, BASE);

    expect(runs()).toBe(2);
  });
});
