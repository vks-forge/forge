/**
 * WorktreeManager port — one git worktree per ticket run.
 *
 * Why: every Worker runs in its own worktree on its own branch, never in the main
 *   checkout, so Forge's runtime data and the main tree stay outside the Worker's cwd and
 *   tickets run in parallel (d-0059). The engine creates the worktree before dispatch,
 *   reads what a run really changed from git (not from the agent's claim) when it settles,
 *   commits the result for the PR, and removes the tree when the ticket is Done or
 *   Cancelled. Behind a port the engine is tested with a fake and the git CLI stays in an
 *   adapter package (execution-plane.md §8).
 *
 * Exports: Worktree, WorktreeDiffFile, WorktreeDiff, WorktreeRemoveOptions, ConflictFile,
 *   UpstreamCommit, MergeInResult, WorktreeManager.
 * Depends on: schemas/ids, schemas/worktree-prep. Types only.
 */

import type { TicketId } from '#/schemas/ids.js';
import type { WorktreePrep } from '#/schemas/worktree-prep.js';

/** A created (or reused) worktree: where it is and the commit it branched from. */
export interface Worktree {
  readonly path: string;
  readonly baseSha: string;
}

/** One changed file in a {@link WorktreeDiff}; `oldPath` is set for renames. */
export interface WorktreeDiffFile {
  readonly status: 'A' | 'M' | 'D' | 'R';
  readonly path: string;
  readonly oldPath?: string;
}

/** What a run changed against its base: per-file status and the unified patch text. */
export interface WorktreeDiff {
  readonly files: readonly WorktreeDiffFile[];
  readonly patch: string;
}

/** Options of `WorktreeManager.remove`. */
export interface WorktreeRemoveOptions {
  /** Also delete this local branch (a cancelled ticket's work is not kept). Never touches a remote. */
  readonly deleteBranch?: string;
}

/** One file the base and the ticket changed in incompatible ways; `path` is relative like `changedFiles`. */
export interface ConflictFile {
  readonly path: string;
  /** Not text: this ticket's version was kept and cannot be merged by hand-editing markers. */
  readonly binary: boolean;
  /** Set when one side deleted the file and the other changed it; the ticket's side was kept. */
  readonly deletedBy?: 'ticket' | 'base';
}

/** A commit the base gained that touched a conflicted file. */
export interface UpstreamCommit {
  readonly sha: string;
  readonly subject: string;
}

/**
 * Outcome of merging a base commit into a ticket's branch. `conflict` has already been
 * committed (a merge commit whose text files still hold `<<<<<<<` markers), so `head` is
 * durable and the base tip is now an ancestor of the branch.
 */
export type MergeInResult =
  | { readonly kind: 'up_to_date' }
  | { readonly kind: 'merged'; readonly head: string }
  | {
      readonly kind: 'conflict';
      readonly head: string;
      readonly files: readonly ConflictFile[];
      readonly upstream: readonly UpstreamCommit[];
    };

/** Git worktrees for tickets. All paths are absolute; `create` is idempotent for the same ticket and branch. */
export interface WorktreeManager {
  /** Creates the ticket's worktree folder (`<worktreeRoot>/<ticketId>`, outside the checkout) on a new `branch` cut from `baseRef`; reuses it if it already exists on that branch. */
  create(ticketId: TicketId, branch: string, baseRef: string): Promise<Worktree>;
  /**
   * Removes the worktree, its prep record and prunes; the branch is kept unless `deleteBranch`
   * names it. Falls back to deleting the folder (retrying locked files) when git cannot. A path
   * that is already gone is not an error; a folder that survives is.
   */
  remove(path: string, opts?: WorktreeRemoveOptions): Promise<void>;
  /** Paths changed since `baseSha`: committed, modified and untracked. */
  changedFiles(path: string, baseSha: string): Promise<string[]>;
  /**
   * Committed, uncommitted and untracked changes against `baseSha`, with renames detected;
   * untracked files appear as added. Gates read this, not the Worker's own account.
   */
  diff(path: string, baseSha: string): Promise<WorktreeDiff>;
  /** Stages everything and commits as the Forge author; null when there was nothing to commit. */
  commitAll(path: string, message: string): Promise<string | null>;
  /** The commit the worktree is at. */
  head(path: string): Promise<string>;
  /** The worktree's top folder; equals `path` unless the project is scoped to a subfolder of the repository. */
  rootOf(path: string): string;
  /**
   * Untracked, not-ignored paths at the top of the worktree, repository-relative, with a
   * folder reported once (`node_modules`, not its files). Setup compares two readings to learn
   * what it created.
   */
  untracked(path: string): Promise<string[]>;
  /** The worktree's preparation record, or null when none was stored or it cannot be read. */
  readPrep(path: string): Promise<WorktreePrep | null>;
  /**
   * Stores the preparation record beside the worktree (outside every Worker cwd). Paths in
   * `outputs` then stay out of `changedFiles`, `diff` and `commitAll`.
   */
  writePrep(path: string, prep: WorktreePrep): Promise<void>;
  /**
   * Merges `sha` (the base tip from `GitHost.syncBase`) into the worktree's branch with a
   * Forge-authored merge commit (`message`); never rebases, never rewrites history. Commit
   * pending work first: a dirty tree that the merge would overwrite throws a `crash` error.
   * `up_to_date` when `sha` is already in the branch; `merged` when it applied cleanly; on
   * conflict the markers are left in text files, binary files keep the ticket's version,
   * delete-versus-modify keeps the ticket's side, everything is committed (hooks off) and
   * the file list plus the upstream commits that touched them come back.
   */
  mergeIn(path: string, sha: string, message: string): Promise<MergeInResult>;
  /** Whether commit `sha` is in the history of the worktree's head (`merge-base --is-ancestor`). */
  contains(path: string, sha: string): Promise<boolean>;
}
