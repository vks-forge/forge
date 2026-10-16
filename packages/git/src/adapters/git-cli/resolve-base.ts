/**
 * Resolves the commit a new ticket branch is cut from, or says plainly why there is none.
 *
 * Why: a Worker's worktree starts from the project's base branch. When that branch cannot be
 *   resolved the ticket must park for a human, not crash, and the human needs the real reason:
 *   a folder Forge initialised without a first commit (d-0124) has no commit at all, while a
 *   repository with history may simply not have a branch of that name (a typo, or a base
 *   branch renamed upstream). Each case names its own fix, so the Needs-you item is
 *   actionable instead of misleading.
 *
 * Exports: resolveBaseCommit().
 * Depends on: @forge/core (InvalidInputError), types/git-worktree. IO: runs git.
 */

import { InvalidInputError } from '@forge/core';
import type { GitRunner } from '#/types/git-worktree.types.js';

const verify = (ref: string) => ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`];

/** The commit sha `baseRef` points at; throws InvalidInputError (invalid_input) when there is none. */
export async function resolveBaseCommit(
  git: GitRunner,
  repoRoot: string,
  baseRef: string,
): Promise<string> {
  const base = await git.try(repoRoot, verify(baseRef));
  if (base.code === 0) {
    return base.stdout.trim();
  }

  const head = await git.try(repoRoot, verify('HEAD'));
  if (head.code !== 0) {
    // An init-only repository has no commit to cut a branch from: a human must make one.
    throw new InvalidInputError(
      `base branch ${baseRef} has no commit yet; make a first commit in ${repoRoot}, then release this ticket`,
    );
  }

  throw new InvalidInputError(
    `base branch ${baseRef} does not exist in ${repoRoot}; create it or change the project's base branch, then release this ticket`,
  );
}
