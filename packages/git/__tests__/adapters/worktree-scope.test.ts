/**
 * Pins: a project scoped to a subfolder works in that folder and cannot leak out of it.
 *
 * Why: when a user registers a subfolder of a bigger repository (d-0124), git still needs
 *   worktrees of the whole repository, but the Worker's cwd, the checks and the gates must see
 *   only the subfolder, in one coordinate system: paths relative to it. A change outside it
 *   must appear as `../x` so G1 can refuse it. An empty repository (init only) must produce a
 *   plain, typed refusal instead of a crash.
 *
 * Pins: create() hands out `<worktree>/<subfolder>` and is idempotent; diff()/changedFiles()
 *   report in-scope paths relative to the subfolder (tracked, untracked, patch headers) and
 *   outside edits as `../x`; commitAll/head/remove accept the scoped path; a base with no
 *   commit is `InvalidInputError`; a missing subfolder on the base is refused.
 * Depends on: src/index, helpers/temp, node:child_process, node:fs. IO: git, temp folders.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createGitWorktreeManager } from '#/index.js';
import { makeCanonicalTempDir, trackTemp } from '#tests/helpers/temp.js';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const put = (dir: string, rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

function monorepo() {
  const repo = makeCanonicalTempDir('forge scope ');
  const trees = trackTemp(`${repo}-trees`);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'User');
  git(repo, 'config', 'user.email', 'user@example.com');
  git(repo, 'config', 'core.autocrlf', 'false');
  put(repo, 'pkg/web/src/a.ts', 'a\n');
  put(repo, 'other/b.ts', 'b\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'init');

  return {
    repo,
    trees,
    manager: createGitWorktreeManager({
      repoRoot: repo,
      worktreeRoot: trees,
      subfolder: 'pkg/web',
    }),
  };
}

const TICKET = 'T-1' as never;

describe('scoped worktree manager', () => {
  it('hands out the subfolder of the worktree and is idempotent', async () => {
    const { manager, trees } = monorepo();

    const first = await manager.create(TICKET, 'feat/t-1', 'main');
    const again = await manager.create(TICKET, 'feat/t-1', 'main');

    expect(first.path.endsWith('/T-1/pkg/web')).toBe(true);
    expect(existsSync(join(first.path, 'src', 'a.ts'))).toBe(true);
    expect(existsSync(join(trees, 'T-1', 'other', 'b.ts'))).toBe(true);
    expect(again).toEqual(first);
  });

  it('reports in-scope changes relative to the subfolder, tracked and untracked', async () => {
    const { manager } = monorepo();
    const wt = await manager.create(TICKET, 'feat/t-1', 'main');
    put(wt.path, 'src/a.ts', 'a changed\n');
    put(wt.path, 'src/new.ts', 'new\n');

    const diff = await manager.diff(wt.path, wt.baseSha);

    expect(diff.files).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'A', path: 'src/new.ts' },
    ]);

    expect(diff.patch).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(diff.patch).toContain('src/new.ts');
    expect(await manager.changedFiles(wt.path, wt.baseSha)).toEqual([
      'src/a.ts',
      'src/new.ts',
    ]);
  });

  it('shows an edit outside the subfolder as ../x, tracked or untracked, so the gate can refuse it', async () => {
    const { manager, trees } = monorepo();
    const wt = await manager.create(TICKET, 'feat/t-1', 'main');
    const root = join(trees, 'T-1');
    put(root, 'other/b.ts', 'b hacked\n');
    put(root, 'other/extra.ts', 'x\n');
    put(root, 'pkg/web/src/a.ts', 'ok\n');

    const diff = await manager.diff(wt.path, wt.baseSha);

    expect(diff.files.map((f) => f.path)).toEqual([
      '../../other/b.ts',
      '../../other/extra.ts',
      'src/a.ts',
    ]);

    expect(diff.patch).not.toContain('other/b.ts');
  });

  it('commits the whole worktree, reports its head and removes it from the scoped path', async () => {
    const { manager, trees } = monorepo();
    const wt = await manager.create(TICKET, 'feat/t-1', 'main');
    put(wt.path, 'src/new.ts', 'new\n');

    const sha = await manager.commitAll(wt.path, 'add new');

    expect(sha).toBe(await manager.head(wt.path));
    expect(git(join(trees, 'T-1'), 'log', '-1', '--format=%s')).toBe('add new');

    await manager.remove(wt.path);

    expect(existsSync(join(trees, 'T-1'))).toBe(false);
  });

  it('refuses a base branch with no commit, with a message the user can act on', async () => {
    const repo = makeCanonicalTempDir('forge empty ');
    git(repo, 'init', '-b', 'main');
    const manager = createGitWorktreeManager({
      repoRoot: repo,
      worktreeRoot: trackTemp(`${repo}-trees`),
    });

    const err = await manager.create(TICKET, 'feat/t-1', 'main').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidInputError);
    expect((err as Error).message).toMatch(/no commit yet.*first commit/);
  });

  it('refuses a subfolder that does not exist on the base branch', async () => {
    const { repo, trees } = monorepo();
    const manager = createGitWorktreeManager({
      repoRoot: repo,
      worktreeRoot: trees,
      subfolder: 'pkg/missing',
    });

    await expect(manager.create(TICKET, 'feat/t-1', 'main')).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });
});
