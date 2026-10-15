/**
 * Memory git runner tests — the user's own git setup never runs inside the Forge daemon.
 *
 * Why: the Director writes project memory from a long-lived daemon on the owner's
 *   machine, where global git config may name hooks, a filesystem monitor or a template
 *   directory. Each of those is a program the daemon would execute on every `add` and
 *   `commit` with the daemon's privileges. These tests configure all three through a
 *   global config in the parent environment and prove none of them runs.
 *
 * Pins: global core.hooksPath, core.fsmonitor and init.templateDir are ignored when
 *   memory is created and written; the control case shows the same setup does fire for
 *   plain git, so the test is not vacuous.
 * Depends on: adapters/git-project-memory, vitest, git and sh on PATH.
 *   IO: temp folder, process.env (restored after each test).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';

let base: string;
let savedGlobal: string | undefined;
const slash = (p: string): string => p.replaceAll('\\', '/');
const marker = (name: string): string => join(base, `${name}.marker`);

async function script(path: string, markerName: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/bin/sh\necho ran > "${slash(marker(markerName))}"\n`);
  await chmod(path, 0o755);
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'forge-git-env-'));
  await script(join(base, 'hooks', 'post-commit'), 'hook');
  await script(join(base, 'template', 'hooks', 'post-commit'), 'template');
  const globalConfig = join(base, 'gitconfig');
  await writeFile(
    globalConfig,
    [
      '[core]',
      `\thooksPath = ${slash(join(base, 'hooks'))}`,
      `\tfsmonitor = touch ${slash(marker('fsmonitor'))} #`,
      '[init]',
      `\ttemplateDir = ${slash(join(base, 'template'))}`,
      '',
    ].join('\n'),
  );

  savedGlobal = process.env['GIT_CONFIG_GLOBAL'];
  process.env['GIT_CONFIG_GLOBAL'] = globalConfig;
});

afterEach(async () => {
  if (savedGlobal === undefined) {
    delete process.env['GIT_CONFIG_GLOBAL'];
  } else {
    process.env['GIT_CONFIG_GLOBAL'] = savedGlobal;
  }

  await rm(base, { recursive: true, force: true });
});

describe('memory git environment', () => {
  it('control: the configured hook and fsmonitor do fire for plain git', async () => {
    const dir = join(base, 'control');
    await mkdir(dir);
    const run = (...args: string[]): void => {
      execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    };

    run('init', '-q', '-b', 'main');
    await writeFile(join(dir, 'a.txt'), 'a');
    run('add', '-A');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');

    expect(existsSync(marker('hook'))).toBe(true);
    expect(existsSync(marker('fsmonitor'))).toBe(true);
  });

  it('never runs global hooks, fsmonitor or template hooks while creating and writing memory', async () => {
    const root = join(base, 'memory');
    const memory = createProjectMemory({ rootDir: root, now: () => new Date() });
    const source = { type: 'chat', ref: 'owner' } as const;

    await memory.writer.propose('shop', { statement: 'Use pnpm', source });
    await memory.writer.decide('shop', { statement: 'Ship on Fridays', source });

    expect(existsSync(marker('hook'))).toBe(false);
    expect(existsSync(marker('fsmonitor'))).toBe(false);
    expect(existsSync(marker('template'))).toBe(false);
    expect(existsSync(join(root, 'shop', '.git', 'hooks', 'post-commit'))).toBe(false);
  });
});
