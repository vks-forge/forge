/**
 * List a clone's local branches and its checked-out branch.
 *
 * Why: when a user registers a project the base branch is the one choice that is easy to get
 *   wrong by typing (`master` vs `main`, a stale default). Showing the real branches, with the
 *   checked-out one pre-selected, turns a typo into a pick from a list. The call only reads:
 *   it never fetches, checks out or writes into the user's clone, and it returns at most
 *   `limit` names so a clone with thousands of branches stays a usable form.
 *
 * Exports: listBranches().
 * Depends on: adapters/git-cli/run-git, types/list-branches. IO: runs git.
 */

import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import type { BranchListing, BranchListingOptions } from '#/types/list-branches.types.js';

const DEFAULT_LIMIT = 50;

/** Local branches of the repository at `opts.path`; an unreadable repository gives an empty listing. */
export async function listBranches(opts: BranchListingOptions): Promise<BranchListing> {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const head = await git.try(opts.path, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const current =
    head.code === 0 && head.stdout.trim() !== '' ? head.stdout.trim() : null;

  const refs = await git.try(opts.path, [
    'for-each-ref',
    '--format=%(refname:short)',
    '--sort=refname',
    'refs/heads',
  ]);

  const all =
    refs.code === 0
      ? refs.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : [];

  return { current, branches: all.slice(0, limit), truncated: all.length > limit };
}
