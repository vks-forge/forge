/**
 * GitHost for a project with no remote: verified work merges into the project's own repository.
 *
 * Why: a project does not need GitHub (d-0124). Its Workers still work on ticket branches in
 *   worktrees of the user's repository, the gates still judge the branch, and the same
 *   `merge()` door still lands the result, but there is nobody to push to and no pull request
 *   service. Branches already live in the repository (worktrees share it), so `push` has
 *   nothing to do; pull requests are records inside the repository's git folder and the
 *   squash merge is the one the bare-repo host computes (merge-tree, commit-tree). What
 *   differs is the last step, because the base branch usually sits checked out in the user's
 *   folder. Forge never forces and never resets that tree: if the base is checked out and
 *   tracked files have uncommitted changes, the merge stops with a `dirty_tree` error (the
 *   ticket parks in "Needs you" asking the user to commit or stash); if the tree is clean
 *   the new commit is fast-forwarded into it with `git merge --ff-only` (git itself refuses
 *   to overwrite untracked files); if the base is not checked out anywhere only the branch
 *   ref is moved, compare-and-swap, with no temporary worktree.
 *
 * Exports: createLocalRepoGitHost().
 * Depends on: node:os, node:path, @forge/core, adapters/git-cli/run-git, adapters/local-bare/git-host,
 *   domain/porcelain, shared/host-errors. IO: runs git in the user's repository.
 */

import { devNull } from 'node:os';
import { resolve } from 'node:path';
import type { GitHost } from '@forge/core';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { createLocalBareGitHost } from '#/adapters/local-bare/git-host.js';
import { parseWorktreeList } from '#/domain/porcelain.js';
import { GitHostError } from '#/shared/host-errors.js';
import type { LocalRepoGitHostOptions } from '#/types/git-host.types.js';

const STDERR_TAIL = 400;

/** Creates a GitHost that merges into the repository at `opts.repoRoot`. */
export function createLocalRepoGitHost(opts: LocalRepoGitHostOptions): GitHost {
  const git = opts.git ?? createGitRunner(opts.gitBinary ?? 'git');
  const repoRoot = resolve(opts.repoRoot);
  let inner: Promise<GitHost> | null = null;

  const build = async (): Promise<GitHost> => {
    const common = (await git.run(repoRoot, ['rev-parse', '--git-common-dir'])).trim();

    return createLocalBareGitHost({
      remotePath: resolve(repoRoot, common),
      baseBranch: opts.baseBranch,
      now: opts.now,
      git,
      ...(opts.author ? { author: opts.author } : {}),
      landing: {
        async land({ base, baseSha, newSha }) {
          const trees = parseWorktreeList(
            await git.run(repoRoot, ['worktree', 'list', '--porcelain']),
          );

          const holder = trees.find((t) => t.branch === base);
          if (!holder) {
            const moved = await git.try(repoRoot, [
              'update-ref',
              `refs/heads/${base}`,
              newSha,
              baseSha,
            ]);

            if (moved.code !== 0) {
              throw new GitHostError('merge_refused', `${base} moved during the merge`);
            }

            return;
          }

          const status = await git.run(holder.path, [
            'status',
            '--porcelain',
            '--untracked-files=no',
          ]);

          if (status.trim() !== '') {
            throw new GitHostError(
              'dirty_tree',
              `${base} is checked out in ${holder.path} and has uncommitted changes; commit or stash them, then release this ticket to retry the merge`,
            );
          }

          if (holder.head !== baseSha) {
            throw new GitHostError('merge_refused', `${base} moved during the merge`);
          }

          const merged = await git.try(holder.path, [
            '-c',
            `core.hooksPath=${devNull}`,
            'merge',
            '--ff-only',
            '--quiet',
            newSha,
          ]);

          if (merged.code !== 0) {
            throw new GitHostError(
              'merge_refused',
              `could not update ${base} in ${holder.path}: ${merged.stderr.trim().slice(-STDERR_TAIL)}`,
            );
          }
        },
      },
    });
  };

  const host = (): Promise<GitHost> => {
    inner ??= build().catch((error: unknown) => {
      inner = null;
      throw error;
    });

    return inner;
  };

  return {
    // Ticket branches already live in this repository: there is no remote to push to.
    push: async () => undefined,
    openPr: async (i) => (await host()).openPr(i),
    findPr: async (b) => (await host()).findPr(b),
    prStatus: async (n) => (await host()).prStatus(n),
    merge: async (n, m, sha) => (await host()).merge(n, m, sha),
    closePr: async (n) => (await host()).closePr(n),
    deleteBranch: async (b) => (await host()).deleteBranch(b),
  };
}
