/**
 * Fetch a remote's base branch into a private ref of the local repository.
 *
 * Why: a ticket branch can only be brought up to date with a base that exists locally. For
 *   hosts with a remote the base moves behind Forge's back (other people, other tickets), and
 *   nothing used to fetch it, so new worktrees started from a stale base and merges judged a
 *   stale tip. This fetches `refs/heads/<branch>` into `refs/forge/base/<branch>`, a ref no
 *   user branch or worktree shares, so the user's own `main` is never moved or checked against.
 *   The fetch is forced on that private ref only (it follows the remote even after a history
 *   rewrite there) and nothing is ever pushed. A token travels only in the child's env and is
 *   scrubbed from any error text.
 *
 * Exports: fetchBase().
 * Depends on: @forge/core (BaseTip), domain/{push-env,ref-check}, shared/host-errors,
 *   types/{git-host,git-worktree}. IO: runs git in the local repository.
 */

import type { BaseTip } from '@forge/core';
import { redactSecrets } from '#/domain/push-env.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import { GitHostError } from '#/shared/host-errors.js';
import type { FetchBaseInput } from '#/types/git-host.types.js';
import type { GitRunner } from '#/types/git-worktree.types.js';

const STDERR_TAIL = 400;

/** Fetches `source`'s `branch` into `refs/forge/base/<branch>` of `localRepo` and returns that ref and its commit. */
export async function fetchBase(git: GitRunner, i: FetchBaseInput): Promise<BaseTip> {
  assertSafeRefArg('base branch', i.branch);
  if (i.localRepo === undefined) {
    throw new GitHostError(
      'invalid',
      'syncing the base needs the local repository (option localRepo)',
    );
  }

  const check = await git.try(i.localRepo, [
    'check-ref-format',
    `refs/heads/${i.branch}`,
  ]);

  if (check.code !== 0) {
    throw new GitHostError('invalid', `invalid base branch: ${i.branch}`);
  }

  const ref = `refs/forge/base/${i.branch}`;
  const fetched = await git.try(
    i.localRepo,
    ['fetch', '--quiet', '--no-tags', i.source, `+refs/heads/${i.branch}:${ref}`],
    { env: { GIT_TERMINAL_PROMPT: '0', ...i.env } },
  );

  if (fetched.code !== 0) {
    const why = redactSecrets(fetched.stderr, i.secrets ?? [])
      .trim()
      .slice(-STDERR_TAIL);

    if (/couldn't find remote ref/i.test(why)) {
      throw new GitHostError('not_found', `base branch ${i.branch} is not on the remote`);
    }

    throw new GitHostError('unavailable', `could not fetch ${i.branch}: ${why}`);
  }

  const sha = (
    await git.run(i.localRepo, ['rev-parse', '--verify', `${ref}^{commit}`])
  ).trim();

  return { ref, sha };
}
