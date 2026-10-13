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
 * Exports: Worktree, WorktreeManager.
 * Depends on: schemas/ids. Types only.
 */

import type { TicketId } from '#/schemas/ids.js';

/** A created (or reused) worktree: where it is and the commit it branched from. */
export interface Worktree {
  readonly path: string;
  readonly baseSha: string;
}

/** Git worktrees for tickets. All paths are absolute; `create` is idempotent for the same ticket and branch. */
export interface WorktreeManager {
  /** Creates `.worktrees/<ticketId>` on a new `branch` cut from `baseRef`; reuses it if it already exists on that branch. */
  create(ticketId: TicketId, branch: string, baseRef: string): Promise<Worktree>;
  /** Removes the worktree and prunes; the branch is kept. A path that is already gone is not an error. */
  remove(path: string): Promise<void>;
  /** Paths changed since `baseSha`: committed, modified and untracked. */
  changedFiles(path: string, baseSha: string): Promise<string[]>;
  /** Stages everything and commits as the Forge author; null when there was nothing to commit. */
  commitAll(path: string, message: string): Promise<string | null>;
  /** The commit the worktree is at. */
  head(path: string): Promise<string>;
}
