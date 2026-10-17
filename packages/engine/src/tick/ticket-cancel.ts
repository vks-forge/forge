/**
 * Cancelling tickets: the transition, the leftovers, the live run and the worktree.
 *
 * Why: cancelling is the owner's way out of every wait, so it must leave nothing behind. The
 *   status change goes through `transition()` like every other (code.md rule 6) and any wait
 *   still pending on the ticket is closed with it; the side effects that cannot be part of a
 *   database transaction (stopping a live run, removing its worktree) follow once it committed.
 *   A ticket other tickets wait on must not be cancelled quietly: a cancelled blocker never
 *   unblocks, so its dependents would wait for ever. The caller either refuses (and names the
 *   dependents) or cancels the whole chain, dependents and their dependents, in one go.
 *
 * Exports: openDependents(), cancelTicketsTx(), stopCancelled().
 * Depends on: @forge/core (TERMINAL_STATUSES, ticket types), tick/escalation-settle, tick/ticket-moves.
 *   Writes inside the caller's transaction; the run and worktree go through the EngineDeps ports.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { StorageTx, Ticket, TicketId } from '@forge/core';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
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

  const found = new Set<string>();
  const queue = [ticketId];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    for (const t of open) {
      if (t.blocked_by.includes(next as TicketId) && !found.has(t.id)) {
        found.add(t.id);
        queue.push(t.id);
      }
    }
  }

  return [...found] as TicketId[];
}

/** Cancels each ticket through `transition()` and closes its pending waits; returns the tickets that actually moved. */
export async function cancelTicketsTx(
  tx: StorageTx,
  ids: readonly string[],
  nowIso: string,
): Promise<Ticket[]> {
  const cancelled: Ticket[] = [];
  for (const id of ids) {
    const moved = await moveTicketTx(tx, id, nowIso, (t) =>
      TERMINAL_STATUSES.includes(t.status) ? null : { events: [{ type: 'cancelled' }] },
    );

    if (moved.ok) {
      cancelled.push(moved.ticket);
      await cancelLeftovers(tx, nowIso, id, 'the ticket was cancelled');
    }
  }

  return cancelled;
}

/** After the cancel committed: stop the ticket's live run and remove its worktree. Failures are logged, never thrown. */
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
    await pump.driver.cancel(pump.handle).catch((e: unknown) => {
      deps.log?.('error', `cancel of ${pump.runId} failed`, { error: String(e) });
    });
  }

  const settings = await deps.config.project(ticket.project).catch(() => undefined);
  const runtime = deps.project(ticket.project, settings);
  if (ticket.worktree && runtime) {
    await runtime.worktrees.remove(ticket.worktree).catch((e: unknown) => {
      deps.log?.('warn', `could not remove worktree of ${ticket.id}`, {
        error: String(e),
      });
    });
  }
}
