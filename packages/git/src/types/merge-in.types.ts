/**
 * Types for merging a base commit into a ticket's branch.
 *
 * Why: `mergeIn` needs a few seams from the worktree manager (the git runner, the author, the
 *   scope frame, the list of setup outputs to leave out of the commit); naming them keeps the
 *   merge in its own file instead of growing the manager.
 *
 * Exports: MergeInDeps, MergeInOps.
 * Depends on: @forge/core, types/git-worktree. Types only.
 */

import type { MergeInResult } from '@forge/core';
import type { GitAuthor, GitRunner } from '#/types/git-worktree.types.js';

export interface MergeInDeps {
  readonly git: GitRunner;
  readonly author: GitAuthor;
  /** The worktree's top folder for a handed-out path. */
  readonly rootOf: (path: string) => string;
  /** A repository-relative path in the frame of the project's folder (`../x` when outside it). */
  readonly inScopeFrame: (path: string) => string;
  /** Pathspecs that keep recorded setup outputs (installed packages) out of a commit. */
  readonly excludes: (root: string) => Promise<string[]>;
}

export interface MergeInOps {
  mergeIn(path: string, sha: string, message: string): Promise<MergeInResult>;
  contains(path: string, sha: string): Promise<boolean>;
}
