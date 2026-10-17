/**
 * Stage state: where a ticket's pipeline stands, read from its rows.
 *
 * Why: nothing stores "the current stage". Dispatch, the scheduler, the verify phase and the
 *   outcome of a settled run all ask the same question (what does this ticket's pipeline want
 *   next?), and the answer must come from the same place or two phases can disagree about one
 *   ticket. This reads the snapshot and the stage rows and runs the pure cursor over them. It
 *   also tells a check run (a read-only agent, never the ticket's assignee) from a writer run,
 *   which is decided by the role the snapshot recorded for the agent, and an agent the snapshot
 *   does not know counts as a check, so the narrower rules apply (fail closed).
 *
 * Exports: readStageState(), isCheckRow().
 * Depends on: @forge/core (stageCursor, currentCycle), types/stage-runner. Reads storage.
 */

import { currentCycle, stageCursor } from '@forge/core';
import type { StageRun, StorageTx, TicketPipeline } from '@forge/core';
import type { StageState } from '#/types/stage-runner.types.js';

/** The ticket's snapshot, rows, cycle and next step; null when it has no pipeline snapshot yet. */
export async function readStageState(
  tx: StorageTx,
  ticketId: string,
): Promise<StageState | null> {
  const snapshot = await tx.ticketPipelines.get(ticketId);
  if (!snapshot) {
    return null;
  }

  const records = await tx.stageRuns.listByTicket(ticketId);
  const cycle = currentCycle(records);

  return { snapshot, records, cycle, cursor: stageCursor(snapshot, records, cycle) };
}

/** True when `row` is an attempt of a read-only agent (or of one the snapshot cannot place). */
export function isCheckRow(
  snapshot: Pick<TicketPipeline, 'roles'>,
  row: StageRun,
): boolean {
  if (row.kind !== 'agent') {
    return false;
  }

  const role = row.agent_id === undefined ? undefined : snapshot.roles[row.agent_id];

  return role !== 'writer' && role !== 'tester';
}
