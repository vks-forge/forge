/**
 * Pins: the git-CLI worktree manager satisfies the WorktreeManager contract on real repos.
 *
 * Why: the engine's isolation (one tree per ticket, honest changed-file lists, Forge-
 *   authored commits) rests on real git behaving as the port promises, including on
 *   Windows paths with spaces. Each case runs on a throwaway repo in the OS temp dir.
 *
 * Depends on: contract/worktree.contract, src/index, node:child_process, node:fs.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { TicketId } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitWorktreeManager } from '#/index.js';
import { describeWorktreeContract } from '#tests/contract/worktree.contract.js';
import type { WorktreeHarness } from '#tests/contract/worktree.contract.js';

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run('git', args, { cwd, windowsHide: true })).stdout.trim();

const roots: string[] = [];
const tid = (n: number): TicketId => TicketId.parse(`FRG-${n}`);

async function makeRepo(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'forge git ')));
  roots.push(dir);
  await git(dir, 'init', '-b', 'main');
  await git(dir, 'config', 'user.name', 'Tester');
  await git(dir, 'config', 'user.email', 'tester@example.com');
  await git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, 'README.md'), 'hello\n');
  await writeFile(join(dir, '.gitignore'), '*.log\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-m', 'init');
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describeWorktreeContract('git cli', async (): Promise<WorktreeHarness> => {
  const repoRoot = await makeRepo();
  return {
    manager: createGitWorktreeManager({ repoRoot }),
    repoRoot,
    exists: async (p) => existsSync(p),
    branchExists: async (b) => (await git(repoRoot, 'branch', '--list', b)).length > 0,
    write: async (wt, rel, content) => {
      const full = join(wt, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    },
    authorOf: (wt, sha) => git(wt, 'log', '-1', '--format=%an', sha),
    close: async () => undefined,
  };
});

describe('git cli worktree manager specifics', () => {
  it('keeps .worktrees out of the main checkout status via info/exclude', async () => {
    const repoRoot = await makeRepo();
    const manager = createGitWorktreeManager({ repoRoot });

    await manager.create(tid(1), 'feat/a', 'main');
    await manager.create(tid(2), 'feat/b', 'main');

    expect(await git(repoRoot, 'status', '--porcelain')).toBe('');
  }, 30_000); // real git is slow on Windows

  it('commits with a custom author and never runs repo hooks', async () => {
    const repoRoot = await makeRepo();
    await mkdir(join(repoRoot, '.git', 'hooks'), { recursive: true });
    await writeFile(join(repoRoot, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n');
    const manager = createGitWorktreeManager({
      repoRoot,
      author: { name: 'Bot', email: 'bot@example.com' },
    });
    const wt = await manager.create(tid(1), 'feat/a', 'main');
    await writeFile(join(wt.path, 'x.txt'), 'x');

    const sha = await manager.commitAll(wt.path, 'msg with "quotes" && $(rm -rf)');

    expect(sha).not.toBeNull();
    expect(await git(wt.path, 'log', '-1', '--format=%an <%ae>|%s')).toBe(
      'Bot <bot@example.com>|msg with "quotes" && $(rm -rf)',
    );
  }, 30_000); // real git is slow on Windows

  it('maps a git failure to a typed crash error', async () => {
    const repoRoot = await makeRepo();
    const manager = createGitWorktreeManager({ repoRoot });

    await expect(manager.head(join(repoRoot, 'does-not-exist'))).rejects.toMatchObject({
      errorFamily: 'crash',
    });
  }, 30_000); // real git is slow on Windows

  it('fails with a typed error when the base ref does not exist', async () => {
    const repoRoot = await makeRepo();
    const manager = createGitWorktreeManager({ repoRoot });

    await expect(manager.create(tid(1), 'feat/a', 'nope')).rejects.toMatchObject({
      errorFamily: 'crash',
    });
  }, 30_000); // real git is slow on Windows
});
