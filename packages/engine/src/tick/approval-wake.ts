/**
 * The wake that resumes a run once its tool approvals are answered, and what it carries.
 *
 * Why: a run that raised several approvals is resumed once, after the last of them is answered,
 *   not once per answer. The wake is keyed by the run (`perm:<run id>`), so the owner's
 *   last click and the run's own settle can both ask for it and the queue keeps one. The
 *   resumed Worker is then handed every answer of that run, read back from the stored items, so
 *   the brief matches what the owner decided and not what any code remembered.
 *
 * Exports: permWakeKey(), runOfPermWake(), approvalsOfRun(), pendingApprovalsOfRun().
 * Depends on: @forge/core (escalation schemas, storage tx), types/approval. Reads storage.
 */

import { toEscalation } from '@forge/core';
import type { Interaction, StorageTx } from '@forge/core';
import type { ApprovalAnswer } from '#/types/approval.types.js';

const PREFIX = 'perm:';

/** The wake key that resumes `runId` after its approvals were answered. */
export const permWakeKey = (runId: string): string => `${PREFIX}${runId}`;

/** The run a permission wake key names, or null for any other wake key. */
export const runOfPermWake = (key: string): string | null =>
  key.startsWith(PREFIX) ? key.slice(PREFIX.length) : null;

const permissionsOf = async (
  tx: StorageTx,
  ticketId: string,
  runId: string,
): Promise<Interaction[]> =>
  (await tx.interactions.listByTicket(ticketId))
    .filter((i) => i.kind === 'permission' && i.run_id === runId)
    .sort((a, b) => a.asked_at.localeCompare(b.asked_at));

/** The run's approvals still waiting on the owner, oldest first. */
export async function pendingApprovalsOfRun(
  tx: StorageTx,
  ticketId: string,
  runId: string,
): Promise<Interaction[]> {
  return (await permissionsOf(tx, ticketId, runId)).filter((i) => i.status === 'pending');
}

/** Every answered approval of the run, oldest first, as the resumed Worker is told it. */
export async function approvalsOfRun(
  tx: StorageTx,
  ticketId: string,
  runId: string,
): Promise<ApprovalAnswer[]> {
  const out: ApprovalAnswer[] = [];
  for (const row of await permissionsOf(tx, ticketId, runId)) {
    const view = toEscalation(row);
    const action = view.settled?.action;
    if (
      view.payload.kind !== 'permission' ||
      (action !== 'allow_once' && action !== 'allow_always' && action !== 'deny')
    ) {
      continue;
    }

    const note = (row.answer as { note?: unknown } | undefined)?.note;
    out.push({
      what: view.payload.what,
      answer: action,
      ...(typeof note === 'string' && note !== '' ? { note } : {}),
    });
  }

  return out;
}
