/**
 * Cancelling tickets: the transition, the leftovers, the live run and the worktree.
 *
 * Why: cancelling is the owner's way out of every wait, so it must leave nothing behind. The
 *   status change goes through `transition()` like every other (code.md rule 6) and any wait
 *   still pending on the ticket is closed with it; the side effects that cannot be part of a
 *   database transaction (stopping a live run, removing its worktree) follow once it committed.
 *   A ticket other tickets wait on must not be cancelled quietly: a cancelled blocker never
 *   unblocks, so its dependents would wait for ever. The caller either refuses (and names the
 *   dependents) or cancels the whole chain, dependents and their dependents, in one go. The worktree
 *   and the ticket's local branch are removed with it (tick/workspace-cleanup).
 *
 * Exports: openDependents(), cancelTicketsTx(), stopCancelled(), stopCancelledAll().
 * Depends on: @forge/core (TERMINAL_STATUSES, ticket types), tick/escalation-settle, tick/ticket-moves, tick/workspace-cleanup.
 *   Writes inside the caller's transaction; the run and worktree go through the EngineDeps ports.
 */

import { TERMINAL_STATUSES, openDependentIds } from '@forge/core';
import type { StorageTx, Ticket, TicketId } from '@forge/core';
import { CANCEL_GRACE_MS } from '#/shared/time.js';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { cleanWorkspace } from '#/tick/workspace-cleanup.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Every open ticket that waits, directly or through another open ticket, on `ticketId`. */
export async function openDependents(
  tx: StorageTx,
  ticketId: string,
): Promise<TicketId[]> {
  const open: Ticket[] = [];
  for (const status of [
    'inbox',
    'planned',
    'in_progress',
    'blocked',
    'waiting_human',
    'verifying',
    'review',
    'needs_signoff',
  ] as const) {
    open.push(...(await tx.tickets.listByStatus(status)));
  }

  return openDependentIds(open, ticketId) as TicketId[];
}

/** Cancels each ticket through `transition()` and closes its pending waits; returns the tickets that actually moved. */
export async function cancelTicketsTx(
  tx: StorageTx,
  ids: readonly string[],
  nowIso: string,
  reason = 'You cancelled it',
): Promise<Ticket[]> {
  const cancelled: Ticket[] = [];
  for (const id of ids) {
    const moved = await moveTicketTx(tx, id, nowIso, (t) =>
      TERMINAL_STATUSES.includes(t.status)
        ? null
        : { events: [{ type: 'cancelled' }], reason },
    );

    if (moved.ok) {
      cancelled.push(moved.ticket);
      await cancelLeftovers(tx, nowIso, id, 'the ticket was cancelled');
    }
  }

  return cancelled;
}

/** After the cancel committed: stop the ticket's live run and remove its worktree and local branch. Failures are logged, never thrown. */
export async function stopCancelled(
  deps: EngineDeps,
  state: EngineState,
  ticket: Ticket,
): Promise<void> {
  const pump = ticket.assignee_run_id
    ? state.pumps.get(ticket.assignee_run_id)
    : undefined;

  if (pump) {
    pump.cancelled = true;
    let stopTimer = (): void => undefined;
    try {
      await pump.driver.cancel(pump.handle);
      const grace = new Promise<void>((r) => {
        stopTimer = deps.clock.after(CANCEL_GRACE_MS, r);
      });

      // The harness's process tree can outlive `cancel()` for a moment; its files stay held until it is gone.
      await Promise.race([pump.finished, grace]);
    } catch (e) {
      deps.log?.('error', `cancel of ${pump.runId} failed`, { error: String(e) });
    }

    stopTimer();
  }

  await cleanWorkspace(deps, state, ticket);
}

/** Stops and cleans up every ticket in `cancelled` (a plan's replaced tickets) once their cancel has committed. */
export async function stopCancelledAll(
  deps: EngineDeps,
  state: EngineState,
  cancelled: readonly Ticket[] | undefined,
): Promise<void> {
  for (const t of cancelled ?? []) {
    await stopCancelled(deps, state, t);
  }
}
