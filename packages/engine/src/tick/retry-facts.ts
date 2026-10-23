/**
 * Reads the stored facts a retry brief needs: the escalation answered, stage outcomes, the last run.
 *
 * Why: the wake delta is pure, so the dispatch path reads the history once, inside its transaction,
 *   and hands it over. Without this a retry wake (whose key is the escalation's id, not a run) has
 *   no way to tell the Worker why the ticket stopped.
 *
 * Exports: readRetryFacts().
 * Depends on: @forge/core (StorageTx, Ticket), types/retry-context. IO only through the open transaction.
 */

import type { StorageTx, Ticket } from '@forge/core';
import type { RetryFacts } from '#/types/retry-context.types.js';

/** What the last run closed with: its finish summary, else its error message, else its last text. */
async function closingText(tx: StorageTx, runId: string): Promise<string> {
  const events = await tx.runEvents.listByRun(runId);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'finish') {
      return e.summary;
    }

    if (e?.type === 'error') {
      return e.message;
    }
  }

  const last = events.filter((e) => e.type === 'text').at(-1);

  return last?.type === 'text' ? last.text : '';
}

/** Facts for a retry of `ticket`; `wakeKey` is the retry wake's idempotency key (the escalation id for an owner retry). */
export async function readRetryFacts(
  tx: StorageTx,
  ticket: Ticket,
  wakeKey: string | undefined,
): Promise<RetryFacts> {
  const id = wakeKey?.split('~')[0];
  const escalation = id ? await tx.interactions.get(id) : null;
  const run = ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null;

  return {
    escalation: escalation && escalation.ticket_id === ticket.id ? escalation : null,
    stageRuns: await tx.stageRuns.listByTicket(ticket.id),
    lastRun: run
      ? {
          id: run.id,
          ...(run.agent_id ? { agent: run.agent_id } : {}),
          status: run.status,
          ...(run.error_family ? { error_family: run.error_family } : {}),
          text: await closingText(tx, run.id),
        }
      : null,
  };
}
