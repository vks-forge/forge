/**
 * Check run — is this run a reviewer's or researcher's, as the stage rows say.
 *
 * Why: a reviewer must judge the change, not the Worker's story (d-0070). The ticket tool would
 *   show it the ticket's earlier runs, which is a way to find the writer's session and be talked
 *   into agreeing. Whether a run is a check is read from the engine's own records: the run has a
 *   stage row and the agent on it has a reviewer or researcher role in the ticket's pipeline
 *   snapshot. When the row exists but the role cannot be told (no snapshot, an agent the snapshot
 *   does not know) the run counts as a check: hiding too much is the safe error.
 *
 * Exports: isCheckRun().
 * Depends on: @forge/core (StorageTx, Run). IO: storage reads inside the caller's transaction.
 */

import type { Run, StorageTx } from '@forge/core';

/** True when `run` belongs to a check stage (or to a stage whose role cannot be determined). */
export async function isCheckRun(
  tx: StorageTx,
  run: Pick<Run, 'id' | 'ticket_id'>,
): Promise<boolean> {
  const row = await tx.stageRuns.getByRun(run.id);
  if (!row) {
    return false;
  }

  const snapshot = await tx.ticketPipelines.get(run.ticket_id);
  const role = row.agent_id === undefined ? undefined : snapshot?.roles[row.agent_id];

  return role === undefined || role === 'reviewer' || role === 'researcher';
}
