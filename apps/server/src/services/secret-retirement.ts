/**
 * Deletes the receipt secrets of runs that are over.
 *
 * Why: a run's HMAC secrets are kept in the SecretStore for the life of the run so gate G1 can
 *   verify its receipts after a restart (d-0100), and must not outlive it: a secret that
 *   stays on disk forever is a standing key for forging that run's chain. A run is over when
 *   it has stopped for good (any outcome), with one exception: a run that succeeded is judged
 *   by G1 after it settles, so its secrets stay until its ticket has left the gates (merged,
 *   cancelled or sent back to rework). Runs that are still alive, or interrupted and waiting
 *   for a resume, are never touched. The sweep runs at start (it also removes what a crash
 *   left behind, and secrets of runs the database no longer knows) and after every tick.
 *   A failing sweep is logged and retried next time; it never stops a tick.
 *
 * Exports: createSecretRetirement().
 * Depends on: @forge/core (StorageAdapter, TicketId), @forge/engine (Logger), @forge/hooks
 *   (RunSecretRegistry). IO: reads storage, deletes secrets through the registry.
 */

import type { RunStatus, StorageAdapter, TicketId, TicketStatus } from '@forge/core';
import type { Logger } from '@forge/engine';
import type { RunSecretRegistry } from '@forge/hooks';

/** Statuses of a run that may still act or be resumed. */
const NOT_OVER: readonly RunStatus[] = ['starting', 'running', 'settling', 'interrupted'];

/** Ticket statuses in which G1 may still judge (or re-judge) the ticket's current run. */
const GATING: readonly TicketStatus[] = ['verifying', 'review', 'needs_signoff'];

/** Returns `sweep()`, which retires every over run's secrets and reports how many. */
export function createSecretRetirement(deps: {
  readonly storage: StorageAdapter;
  readonly registry: RunSecretRegistry;
  readonly log: Logger;
}): { sweep(): Promise<number> } {
  const isOver = (runId: string): Promise<boolean> =>
    deps.storage.transaction(async (tx) => {
      const run = await tx.runs.get(runId);
      if (!run) {
        return true;
      }

      if (NOT_OVER.includes(run.status)) {
        return false;
      }

      const ticket = await tx.tickets.get(run.ticket_id as TicketId);

      return !(ticket?.assignee_run_id === run.id && GATING.includes(ticket.status));
    });

  return {
    async sweep() {
      try {
        const retired = await deps.registry.sweep(isOver);
        if (retired.length > 0) {
          deps.log('debug', `retired the secrets of ${retired.length} finished run(s)`, {
            runs: retired,
          });
        }

        return retired.length;
      } catch (error) {
        deps.log('warn', 'could not retire finished runs secrets', {
          error: String(error),
        });

        return 0;
      }
    },
  };
}
