/**
 * Worktree preparer against a real package manager: `npm ci` offline, then a skip, then a rerun.
 *
 * Why: the unit tests script every command, so none of them can say that the detected step really
 *   installs, that the prep key really keeps a second ticket from installing again, or that a
 *   changed lockfile really reinstalls. This runs the one thing that has to be true on a real
 *   machine: a fixture project with a `file:` dependency (no network needed) is installed by the
 *   detected `npm ci`, the install folder is recorded as an output to keep out of the diff, a second
 *   prepare of the same tree runs no command, and editing the lockfile runs the install again.
 *   Skipped cleanly where npm is not on PATH (the preparer itself assumes no tool, d-0176).
 *
 * Pins: detected `npm ci` installs a local dependency; `node_modules` is recorded as an output; a
 *   second prepare is a skip (no command spawned); a lockfile edit reruns the install.
 * Depends on: adapters/worktree-preparer, adapters/command-runner, node:child_process, node:fs,
 *   node:os, node:path. Spawns npm (heavy project).
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorktreePrep } from '@forge/core';
import { afterAll, describe, expect, it } from 'vitest';
import { runShellCommand } from '#/adapters/command-runner.js';
import { createWorktreePreparer } from '#/adapters/worktree-preparer.js';
import type { CommandRequest } from '#/types/g1-deps.types.js';

const hasNpm = ((): boolean => {
  try {
    return spawnSync('npm --version', { shell: true, windowsHide: true }).status === 0;
  } catch {
    return false;
  }
})();

const root = mkdtempSync(join(tmpdir(), 'forge-heavy-prep-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture(): string {
  const project = join(root, 'tree');
  mkdirSync(join(project, 'local-dep'), { recursive: true });
  writeFileSync(
    join(project, 'local-dep', 'package.json'),
    JSON.stringify({ name: 'local-dep', version: '1.0.0' }),
  );

  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'fx',
      version: '1.0.0',
      dependencies: { 'local-dep': 'file:./local-dep' },
    }),
  );

  const made = spawnSync('npm install --package-lock-only --offline --ignore-scripts', {
    cwd: project,
    shell: true,
    windowsHide: true,
    env: { ...process.env, npm_config_cache: join(root, 'cache') },
  });

  if (made.status !== 0) {
    throw new Error(`could not write the fixture lockfile: ${String(made.stderr)}`);
  }

  return project;
}

describe.skipIf(!hasNpm)('prepare with a real npm', () => {
  it('installs a local dependency, skips the second time and reinstalls after a lockfile edit', async () => {
    const project = fixture();
    let record: WorktreePrep | null = null;
    const spawned: string[] = [];
    const prep = createWorktreePreparer({
      worktrees: {
        rootOf: () => project,
        // A fresh install folder is the only new top-level path.
        untracked: async () =>
          existsSync(join(project, 'node_modules')) ? ['node_modules'] : [],
        readPrep: async () => record,
        writePrep: async (_path, next) => {
          record = next;
        },
        changedFiles: async () => [],
      },
      env: { ...process.env, npm_config_cache: join(root, 'cache') },
      runCommand: (req: CommandRequest) => {
        spawned.push(req.command);

        return runShellCommand(req);
      },
    });

    const detected = await prep.plan(project, {});
    expect(detected.steps.map((s) => s.command)).toEqual(['npm ci --no-audit --no-fund']);

    // Offline, so the test needs no network and never reaches a registry.
    const offline = {
      ...detected,
      steps: detected.steps.map((s) => ({ ...s, env: { npm_config_offline: 'true' } })),
    };

    const first = await prep.prepare(project, offline, { baseSha: 'b'.repeat(40) });
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
    expect(existsSync(join(project, 'node_modules', 'local-dep', 'package.json'))).toBe(
      true,
    );

    expect(record).toMatchObject({ status: 'ready', outputs: ['node_modules'] });
    expect(spawned).toHaveLength(1);

    const second = await prep.prepare(project, offline, { baseSha: 'b'.repeat(40) });
    expect(second).toMatchObject({ ok: true });
    expect(spawned).toHaveLength(1);

    // Same content, different bytes: the key reads the file, so it must reinstall.
    const lock = join(project, 'package-lock.json');
    writeFileSync(lock, `${readFileSync(lock, 'utf8').trimEnd()}\n\n`);
    const third = await prep.prepare(project, offline, { baseSha: 'b'.repeat(40) });

    expect(third, JSON.stringify(third)).toMatchObject({ ok: true });
    expect(spawned).toHaveLength(2);
  }, 240_000);
});
