/**
 * Pins: the git-CLI worktree manager satisfies the WorktreeManager contract on real repos.
 *
 * Why: the engine's isolation (one tree per ticket, honest changed-file lists, Forge-
 *   authored commits) rests on real git behaving as the port promises, including on
 *   Windows paths with spaces. Each case runs on a throwaway repo in the OS temp dir.
 *
 * Depends on: contract/{worktree,merge-in}.contract, src/index, node:child_process, node:fs.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { TicketId } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitWorktreeManager } from '#/index.js';
import { describeMergeInContract } from '#tests/contract/merge-in.contract.js';
import type { MergeInHarness } from '#tests/contract/merge-in.contract.js';
import { describeWorktreeContract } from '#tests/contract/worktree.contract.js';
import { removeTree, trackTemp } from '#tests/helpers/temp.js';

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run('git', args, { cwd, windowsHide: true })).stdout.trim();

const roots: string[] = [];
const tid = (n: number): TicketId => TicketId.parse(`FRG-${n}`);

/** A manager whose worktrees live in their own temp folder, as in the data home. */
async function makeManager(
  repoRoot: string,
  extra: { author?: { name: string; email: string } } = {},
) {
  const worktreeRoot = trackTemp(await mkdtemp(join(tmpdir(), 'forge wt ')));
  roots.push(worktreeRoot);

  return {
    worktreeRoot,
    manager: createGitWorktreeManager({ repoRoot, worktreeRoot, ...extra }),
  };
}

async function makeRepo(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'forge git ')));
  roots.push(trackTemp(dir));
  await git(dir, 'init', '-b', 'main');
  await git(dir, 'config', 'user.name', 'Tester');
  await git(dir, 'config', 'user.email', 'tester@example.com');
  await git(dir, 'config', 'commit.gpgsign', 'false');
  // Contents are compared byte for byte; a machine-wide autocrlf must not rewrite them.
  await git(dir, 'config', 'core.autocrlf', 'false');
  await writeFile(join(dir, 'README.md'), 'hello\n');
  await writeFile(join(dir, '.gitignore'), '*.log\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-m', 'init');

  return dir;
}

afterEach(async () => {
  // Tolerant removal: antivirus or a lingering git child holds handles on Windows under
  // load (EBUSY); a directory that cannot go yet is retried at the end of the file.
  await Promise.all(roots.splice(0).map(removeTree));
});

async function makeHarness(): Promise<MergeInHarness> {
  const repoRoot = await makeRepo();
  const { manager, worktreeRoot } = await makeManager(repoRoot);

  return {
    manager,
    repoRoot,
    worktreeRoot,
    exists: async (p) => existsSync(p),
    branchExists: async (b) => (await git(repoRoot, 'branch', '--list', b)).length > 0,
    write: async (wt, rel, content) => {
      const full = join(wt, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    },
    writeReadOnly: async (wt, rel, content) => {
      const full = join(wt, rel);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, { mode: 0o444 });
    },
    remove: (wt, rel) => rm(join(wt, rel)),
    rename: (wt, from, to) => rename(join(wt, from), join(wt, to)),
    authorOf: (wt, sha) => git(wt, 'log', '-1', '--format=%an', sha),
    close: async () => undefined,
    async baseCommit(file, content) {
      if (content === null) {
        await rm(join(repoRoot, file));
      } else {
        await mkdir(dirname(join(repoRoot, file)), { recursive: true });
        await writeFile(join(repoRoot, file), content);
      }

      await git(repoRoot, 'add', '-A');
      await git(repoRoot, 'commit', '-m', `upstream: ${file}`);

      return git(repoRoot, 'rev-parse', 'HEAD');
    },
    read: async (wt, rel) => {
      try {
        return await readFile(join(wt, rel), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

describeWorktreeContract('git cli', makeHarness);
describeMergeInContract('git cli', makeHarness);

// 30s: real git spawns several processes per call and is slow on Windows under suite load.
describe('git cli worktree manager specifics', { timeout: 30_000 }, () => {
  it('keeps worktrees outside the checkout, so its status stays clean with no ignore rule', async () => {
    const repoRoot = await makeRepo();
    const { manager, worktreeRoot } = await makeManager(repoRoot);

    await manager.create(tid(1), 'feat/a', 'main');
    await manager.create(tid(2), 'feat/b', 'main');

    expect(await git(repoRoot, 'status', '--porcelain')).toBe('');
    expect(existsSync(join(worktreeRoot, 'FRG-1'))).toBe(true);
    expect(existsSync(join(repoRoot, '.worktrees'))).toBe(false);
  }, 30_000); // real git is slow on Windows

  it('commits with a custom author and never runs repo hooks', async () => {
    const repoRoot = await makeRepo();
    await mkdir(join(repoRoot, '.git', 'hooks'), { recursive: true });
    await writeFile(join(repoRoot, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n');
    const { manager } = await makeManager(repoRoot, {
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
    const { manager } = await makeManager(repoRoot);

    await expect(manager.head(join(repoRoot, 'does-not-exist'))).rejects.toMatchObject({
      errorFamily: 'crash',
    });
  }, 30_000); // real git is slow on Windows

  it('mergeIn refuses to start over uncommitted changes and leaves the tree as it was', async () => {
    const repoRoot = await makeRepo();
    const { manager } = await makeManager(repoRoot);
    const wt = await manager.create(tid(1), 'feat/a', 'main');
    await writeFile(join(repoRoot, 'README.md'), 'base edit\n');
    await git(repoRoot, 'commit', '-am', 'base edit');
    await writeFile(join(wt.path, 'README.md'), 'uncommitted\n');

    const tip = await git(repoRoot, 'rev-parse', 'HEAD');

    await expect(manager.mergeIn(wt.path, tip, 'merge main')).rejects.toMatchObject({
      errorFamily: 'crash',
    });

    expect(await readFile(join(wt.path, 'README.md'), 'utf8')).toBe('uncommitted\n');
    expect(await manager.contains(wt.path, tip)).toBe(false);
  }, 30_000); // real git is slow on Windows

  it('mergeIn leaves a conflicted tree that a Worker can finish: committed markers, no merge in progress', async () => {
    const repoRoot = await makeRepo();
    const { manager } = await makeManager(repoRoot);
    const wt = await manager.create(tid(1), 'feat/a', 'main');
    await writeFile(join(wt.path, 'README.md'), 'ticket\n');
    await manager.commitAll(wt.path, 'ticket');
    await writeFile(join(repoRoot, 'README.md'), 'base\n');
    await git(repoRoot, 'commit', '-am', 'base edit');

    const r = await manager.mergeIn(
      wt.path,
      await git(repoRoot, 'rev-parse', 'HEAD'),
      'merge main',
    );

    expect(r.kind).toBe('conflict');
    expect(existsSync(join(wt.path, '.git'))).toBe(true);
    expect(await git(wt.path, 'status', '--porcelain')).toBe('');
    expect(await git(wt.path, 'rev-list', '--parents', '-n1', 'HEAD')).toMatch(
      /^\w{40} \w{40} \w{40}$/,
    );

    expect(await git(wt.path, 'grep', '-c', '<<<<<<<', 'HEAD', '--', 'README.md')).toBe(
      'HEAD:README.md:1',
    );
  }, 30_000); // real git is slow on Windows

  it('fails with a typed error when the base ref does not exist', async () => {
    const repoRoot = await makeRepo();
    const { manager } = await makeManager(repoRoot);

    await expect(manager.create(tid(1), 'feat/a', 'nope')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
      message: expect.stringMatching(/does not exist/),
    });
  }, 30_000); // real git is slow on Windows

  it('shows hunks of a -diff attributed file and unquoted non-ASCII names in the patch', async () => {
    const repoRoot = await makeRepo();
    const { manager } = await makeManager(repoRoot);
    const wt = await manager.create(tid(1), 'feat/a', 'main');
    await writeFile(join(wt.path, '.gitattributes'), '*.test.ts -diff\n');
    await writeFile(join(wt.path, 'a.test.ts'), "it.skip('x', () => {})\n");
    await writeFile(join(wt.path, 'é.test.ts'), "it.only('y', () => {})\n");
    await git(wt.path, 'add', '-A');
    await git(wt.path, 'commit', '-m', 'w', '--no-verify');
    await writeFile(join(wt.path, 'u.test.ts'), "it.skip('z', () => {})\n");

    const { patch } = await manager.diff(wt.path, wt.baseSha);

    expect(patch).toContain("+it.skip('x', () => {})");
    expect(patch).toContain("+it.only('y', () => {})");
    expect(patch).toContain("+it.skip('z', () => {})");
    expect(patch).toContain('diff --git a/é.test.ts b/é.test.ts');
  });
});
