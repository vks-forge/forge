/**
 * Deletes the receipt secrets of runs that are over.
 *
 * Why: a run's HMAC secrets are kept in the SecretStore so gate G1 can verify its receipts
 *   after a restart (d-0100), and must not outlive the work: a secret that stays on disk
 *   forever is a standing key for forging that run's chain. But a ticket's runs vouch for each
 *   other. A run that paused for an answer, hit its turn limit, errored or timed out has still
 *   edited and read files that stay in the ticket's branch, and the next run (often the same
 *   harness session) claims them without a receipt of its own; G1 trusts that earlier chain
 *   only after re-verifying it with this secret. Deleting it at the run's end left the ticket
 *   failing G1 for ever, with no way the Worker could make the proof come back. So the rule is
 *   the one successful runs already followed, now for every ended run: the secrets stay until
 *   the run's ticket is done or cancelled (d-0178, amending d-0100). Runs that are still alive,
 *   or interrupted and waiting for a resume, are never touched. The sweep runs at start (it
 *   also removes what a crash left behind, and secrets of runs the database no longer knows)
 *   and after every tick. A failing sweep is logged and retried next time; it never stops a tick.
 *
 * Exports: createSecretRetirement().
 * Depends on: @forge/core (StorageAdapter, TicketId), @forge/engine (Logger), @forge/hooks
 *   (RunSecretRegistry). IO: reads storage, deletes secrets through the registry.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { RunStatus, StorageAdapter, TicketId, TicketStatus } from '@forge/core';
import type { Logger } from '@forge/engine';
import type { RunSecretRegistry } from '@forge/hooks';

/** Statuses of a run that may still act or be resumed. */
const NOT_OVER: readonly RunStatus[] = ['starting', 'running', 'settling', 'interrupted'];

/** Ticket statuses no run of the ticket can matter in any more. */
const CLOSED: readonly TicketStatus[] = TERMINAL_STATUSES;

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

      return ticket === undefined || ticket === null || CLOSED.includes(ticket.status);
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
