/**
 * Git-CLI implementation of the WorktreeManager port.
 *
 * Why: every Worker run gets its own git worktree on its own branch so tickets run in
 *   parallel and the main checkout (and Forge's runtime data) stays outside the Worker's
 *   cwd (d-0059). The Director also needs the truth about what a run changed and a
 *   Forge-authored commit for the PR. This adapter does it with the plain `git` binary:
 *   args arrays only, no shell, repo hooks disabled for commits made in a Worker-controlled
 *   tree, and `create` safe to call again after a crash. Paths it returns are absolute with
 *   forward slashes (`C:/repo/.worktrees/FRG-1`), which Node and git both accept on Windows.
 *
 * Exports: createGitWorktreeManager().
 * Depends on: node:fs, node:os, node:path, @forge/core, adapters/git-cli/{run-git,exclude},
 *   domain/{name-status,porcelain,ref-check}. IO: runs git, stats paths.
 */

import { existsSync } from 'node:fs';
import { devNull } from 'node:os';
import { resolve } from 'node:path';
import { CrashError, InvalidInputError } from '@forge/core';
import type { Worktree, WorktreeDiffFile, WorktreeManager } from '@forge/core';
import { ensureWorktreesExcluded } from '#/adapters/git-cli/exclude.js';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { parseNameStatus } from '#/domain/name-status.js';
import { normalizePath, parseWorktreeList, samePath } from '#/domain/porcelain.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import type { GitWorktreeManagerOptions } from '#/types/git-worktree.types.js';

const DEFAULT_AUTHOR = { name: 'Forge', email: 'forge@localhost' } as const;

const names = (out: string): string[] => out.split('\0').filter((n) => n.length > 0);

/** Creates a WorktreeManager that shells out to the `git` binary (no shell string, ever). */
export function createGitWorktreeManager(
  opts: GitWorktreeManagerOptions,
): WorktreeManager {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const author = opts.author ?? DEFAULT_AUTHOR;
  const repoRoot = normalizePath(resolve(opts.repoRoot));

  const list = async () =>
    parseWorktreeList(await git.run(repoRoot, ['worktree', 'list', '--porcelain']));

  const mergeBase = async (baseRef: string, branch: string) =>
    (await git.run(repoRoot, ['merge-base', baseRef, branch])).trim();

  return {
    async create(ticketId, branch, baseRef): Promise<Worktree> {
      assertSafeRefArg('baseRef', baseRef);
      assertSafeRefArg('branch', branch);
      const fmt = await git.try(repoRoot, ['check-ref-format', '--branch', branch]);
      if (fmt.code !== 0) {
        throw new InvalidInputError(`invalid branch name: ${branch}`);
      }

      await ensureWorktreesExcluded(git, repoRoot);
      const path = normalizePath(resolve(repoRoot, '.worktrees', ticketId));
      const trees = await list();

      const here = trees.find((t) => samePath(t.path, path));
      if (here) {
        if (here.branch !== branch) {
          const on = here.branch ?? 'a detached head';
          throw new InvalidInputError(
            `${path} is already a worktree on ${on}, not ${branch}`,
          );
        }

        return { path, baseSha: await mergeBase(baseRef, branch) };
      }

      if (trees.some((t) => t.branch === branch)) {
        throw new InvalidInputError(
          `branch ${branch} is already checked out in another worktree`,
        );
      }

      if (existsSync(path)) {
        throw new InvalidInputError(`${path} exists but is not a git worktree`);
      }

      const ref = ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`];
      if ((await git.try(repoRoot, ref)).code === 0) {
        // Branch kept from an earlier removed worktree: re-attach it instead of failing on -b.
        await git.run(repoRoot, ['worktree', 'add', path, branch]);

        return { path, baseSha: await mergeBase(baseRef, branch) };
      }

      const rev = ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`];
      const baseSha = (await git.run(repoRoot, rev)).trim();
      await git.run(repoRoot, ['worktree', 'add', '-b', branch, path, baseRef]);

      return { path, baseSha };
    },

    async remove(path) {
      const target = normalizePath(path);
      const r = await git.try(repoRoot, ['worktree', 'remove', '--force', target]);
      // Already-gone is fine; a directory that survives a failed remove is a real error.
      if (r.code !== 0 && existsSync(target)) {
        await git.run(repoRoot, ['worktree', 'remove', '--force', target]);
      }

      await git.run(repoRoot, ['worktree', 'prune']);
    },

    async changedFiles(path, baseSha) {
      assertSafeRefArg('baseSha', baseSha);
      const [tracked, untracked] = await Promise.all([
        git.run(path, ['diff', '--name-only', '--no-renames', '-z', baseSha, '--']),
        git.run(path, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);

      return [...new Set([...names(tracked), ...names(untracked)])].sort();
    },

    async diff(path, baseSha) {
      assertSafeRefArg('baseSha', baseSha);
      // Tracked changes (committed, staged and unstaged) against the base, renames detected.
      const [status, tracked, untrackedOut] = await Promise.all([
        git.run(path, ['diff', '--name-status', '-M', '-z', baseSha, '--']),
        git.run(path, ['diff', '--no-color', '--no-ext-diff', '-M', baseSha, '--']),
        git.run(path, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);

      const files: WorktreeDiffFile[] = parseNameStatus(status);
      const patches = [tracked];
      // Untracked files are in no index: show each as an added file without touching the tree.
      for (const name of names(untrackedOut).sort()) {
        files.push({ status: 'A', path: name });
        // --no-index exits 1 when the files differ, which is the expected case here.
        const r = await git.try(path, [
          'diff',
          '--no-index',
          '--no-color',
          '--no-ext-diff',
          '--',
          '/dev/null',
          name,
        ]);

        if (r.code > 1) {
          throw new CrashError(`git diff failed for ${name}: ${r.stderr.trim()}`);
        }

        patches.push(r.stdout);
      }

      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      return { files, patch: patches.join('') };
    },

    async commitAll(path, message) {
      await git.run(path, ['add', '-A']);
      const staged = await git.try(path, ['diff', '--cached', '--quiet']);
      if (staged.code === 0) {
        return null;
      }

      const identity = [
        ...['-c', `user.name=${author.name}`],
        ...['-c', `user.email=${author.email}`],
        ...['-c', 'commit.gpgsign=false'],
        // The tree is Worker-controlled: never run its hooks inside Forge's process.
        ...['-c', `core.hooksPath=${devNull}`],
      ];

      await git.run(path, [...identity, 'commit', '--no-verify', '-m', message], {
        env: {
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email,
        },
      });

      return (await git.run(path, ['rev-parse', 'HEAD'])).trim();
    },

    async head(path) {
      return (await git.run(path, ['rev-parse', 'HEAD'])).trim();
    },
  };
}
