/**
 * The identity and safety switches of every commit Forge makes in a ticket's worktree.
 *
 * Why: the worktree is Worker-controlled, so a commit Forge writes in it (the PR commit, the
 *   merge of a moved base) must carry the Forge author, ignore a signing setup the machine may
 *   have, and never run hooks the Worker could have planted. One definition keeps the commit and
 *   the merge from drifting apart on any of those three.
 *
 * Exports: commitConfig(), commitEnv().
 * Depends on: node:os, types/git-worktree. No IO.
 */

import { devNull } from 'node:os';
import type { GitAuthor } from '#/types/git-worktree.types.js';

/** `-c` options placed before the git subcommand: author, no signing, hooks pointed at nothing. */
export function commitConfig(author: GitAuthor): string[] {
  return [
    ...['-c', `user.name=${author.name}`],
    ...['-c', `user.email=${author.email}`],
    ...['-c', 'commit.gpgsign=false'],
    ...['-c', `core.hooksPath=${devNull}`],
  ];
}

/** Environment that makes git author and commit as `author` even where config is missing. */
export function commitEnv(author: GitAuthor): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  };
}
