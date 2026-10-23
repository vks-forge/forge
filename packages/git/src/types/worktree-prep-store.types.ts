/**
 * Type of the per-worktree preparation record store.
 *
 * Why: the git worktree manager keeps one small record per ticket worktree (what setup did, which
 *   folders it created) and the store behind it is a separate file-backed piece; naming its
 *   shape keeps the manager testable and the two files short.
 *
 * Exports: PrepStore.
 * Depends on: @forge/core (WorktreePrep, types only).
 */

import type { WorktreePrep } from '@forge/core';

/** Reads, writes and deletes the record of the worktree at `root` (its top folder). */
export interface PrepStore {
  read(root: string): Promise<WorktreePrep | null>;
  write(root: string, prep: WorktreePrep): Promise<void>;
  remove(root: string): Promise<void>;
}
