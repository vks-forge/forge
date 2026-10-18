/**
 * The ids of a ticket's earlier runs, read from storage.
 *
 * Why: a rework run exists to fix what gate G1 rejected, often only the claims. The edits
 *   the ticket needs were made, and receipted, by an earlier run in the same worktree, so
 *   the rework run has no edit receipts of its own and every honest `edited` claim would
 *   fail for want of evidence (probe 8 runs 2 and 3, 2026-10-14). G1 therefore also reads
 *   the receipts of the ticket's other runs that started no later than this one. Parallel
 *   writer-group members share one worktree and diff, so each member's G1 must see every
 *   sibling's receipts, including a sibling that started in the same millisecond (a strict
 *   `<` would hide it). Those runs' own chains were verified when they were gated; here they
 *   only back claims.
 *
 * Exports: createStorageEarlierRuns().
 * Depends on: @forge/core (StorageAdapter, Run). IO: reads storage.
 */

import type { Run, StorageAdapter } from '@forge/core';

/** `earlierRunIds` for G1: every other run of the same ticket that started at or before `run`, ordered by start then id. */
export function createStorageEarlierRuns(
  storage: StorageAdapter,
): (run: Run) => Promise<string[]> {
  return async (run) => {
    const runs = await storage.transaction((tx) => tx.runs.listByTicket(run.ticket_id));

    return runs
      .filter((r) => r.id !== run.id && r.started_at <= run.started_at)
      .sort(
        (a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id),
      )
      .map((r) => r.id);
  };
}
