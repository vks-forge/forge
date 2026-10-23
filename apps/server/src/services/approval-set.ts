/**
 * The owner's answers to a run's tool approvals, as `admit()` reads them.
 *
 * Why: a Worker whose call was parked for the owner is resumed under a new run row that points
 *   back at the first (`retry_of`). The answers live on the ticket's `permission` interactions,
 *   written by the run that asked, so the context of the asking run and of its resume reads the
 *   same rows: "allow once" lets the repeated call through, "deny" refuses it without asking
 *   again, and "allow always" counts as once while the project's settings reload (no gap between
 *   the click and the rule). Another run of the ticket, a fresh retry that is not a resume, reads
 *   none of them: a once-approval does not outlive the run that asked (d-0175, tool-system.md §5.4).
 *
 * Exports: approvalsForRun().
 * Depends on: @forge/core (Run, StorageAdapter, toEscalation), @forge/tools (ApprovalSet type). IO: reads interactions.
 */

import { toEscalation } from '@forge/core';
import type { Run, StorageAdapter } from '@forge/core';
import type { ApprovalRef } from '@forge/tools';

/** The answered tool approvals of the run and of the run it resumes. */
export async function approvalsForRun(
  storage: StorageAdapter,
  run: Run,
): Promise<{ once: ApprovalRef[]; denied: ApprovalRef[] }> {
  const rows = await storage.transaction((tx) =>
    tx.interactions.listByTicket(run.ticket_id),
  );

  const once: ApprovalRef[] = [];
  const denied: ApprovalRef[] = [];
  for (const row of rows) {
    if (
      row.kind !== 'permission' ||
      row.status !== 'answered' ||
      row.run_id === undefined ||
      (row.run_id !== run.id && row.run_id !== run.retry_of)
    ) {
      continue;
    }

    const view = toEscalation(row);
    if (view.payload.kind !== 'permission') {
      continue;
    }

    const ref = { key: view.payload.approval_key, ref: row.id };
    const action = view.settled?.action;
    if (action === 'allow_once' || action === 'allow_always') {
      once.push(ref);
    } else if (action === 'deny') {
      denied.push(ref);
    }
  }

  return { once, denied };
}
