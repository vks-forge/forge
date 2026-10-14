/**
 * The ids of a ticket's earlier runs, read from storage.
 *
 * Why: a rework run exists to fix what gate G1 rejected, often only the claims. The edits
 *   the ticket needs were made, and receipted, by an earlier run in the same worktree, so
 *   the rework run has no edit receipts of its own and every honest `edited` claim would
 *   fail for want of evidence (probe 8 runs 2 and 3, 2026-10-14). G1 therefore also reads
 *   the receipts of the ticket's runs that started before this one. Those runs' own chains
 *   were verified when they were gated; here they only back claims.
 *
 * Exports: createStorageEarlierRuns().
 * Depends on: @forge/core (StorageAdapter, Run). IO: reads storage.
 */

import type { Run, StorageAdapter } from '@forge/core';

/** `earlierRunIds` for G1: other runs of the same ticket that started before `run`, oldest first. */
export function createStorageEarlierRuns(
  storage: StorageAdapter,
): (run: Run) => Promise<string[]> {
  return async (run) => {
    const runs = await storage.transaction((tx) => tx.runs.listByTicket(run.ticket_id));

    return runs
      .filter((r) => r.id !== run.id && r.started_at < run.started_at)
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map((r) => r.id);
  };
}
