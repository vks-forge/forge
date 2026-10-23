/**
 * Cancelling from an escalation or a ticket page: refuse or cancel the whole chain.
 *
 * Why: cancelling is the owner's way out of every wait, but a ticket other tickets wait on cannot
 *   be cancelled quietly: a cancelled blocker never unblocks, so its dependents would wait for
 *   ever. Without `cascade` the owner is told which tickets depend on it (409); with it the ticket
 *   and every open dependent are cancelled through `transition()` in one transaction, the
 *   escalation that was acted on is settled in the same one, and only then are live runs stopped
 *   and worktrees removed. It is the only cancel door: the owner (ticket page, escalation) and the
 *   card's Director (`cancel_ticket`, d-0179) both come through it, and the history line says who and why.
 *
 * Exports: cancelFlow().
 * Depends on: @forge/core (escalation schemas), tick/card-notify, tick/escalation-settle,
 *   tick/ticket-cancel, tick/tick-requests, types/escalation. Writes storage.
 */

import type { Interaction, Ticket, TicketId } from '@forge/core';
import { iso } from '#/shared/time.js';
import { notifyCard } from '#/tick/card-notify.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { cancelTicketsTx, openDependents, stopCancelled } from '#/tick/ticket-cancel.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { ActOutcome, CancelBy } from '#/types/escalation.types.js';

/** The history line of a cancel: who did it and why, in words the owner reads on the ticket and the card. */
function cancelReason(who: CancelBy, reason: string | undefined): string {
  if (who === 'director') {
    return `The Director cancelled it: ${reason ?? 'no reason given'}`;
  }

  return reason === undefined
    ? 'You cancelled the stuck ticket and what waited on it'
    : `You cancelled it: ${reason}`;
}

/**
 * The one cancel door: cancels the ticket, and its dependents with `cascade`; refuses when others
 * wait on it. `by` and `reason` go on the ticket's history line.
 */
export async function cancelFlow(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
  row: Interaction | null,
  cascade: boolean,
  author: string,
  who: { readonly by: CancelBy; readonly reason?: string } = { by: 'owner' },
): Promise<ActOutcome> {
  const nowIso = iso(deps.clock.now());
  const out = await deps.storage.transaction(
    async (tx): Promise<ActOutcome | Ticket[]> => {
      const ticket = await tx.tickets.get(ticketId as TicketId);
      if (!ticket) {
        return { status: 'not_found' };
      }

      const dependents = await openDependents(tx, ticketId);
      if (dependents.length > 0 && !cascade) {
        return { status: 'ticket_has_dependents', dependents };
      }

      if (
        row &&
        !(await settleEscalation(
          tx,
          nowIso,
          row.card_id === undefined ? { ...row, card_id: ticket.card_id } : row,
          { action: 'cancel', by: 'owner', cascade },
          author,
        ))
      ) {
        return { status: 'not_pending' };
      }

      const cancelled = await cancelTicketsTx(
        tx,
        [ticketId, ...dependents],
        nowIso,
        cancelReason(who.by, who.reason),
      );

      return cancelled.length === 0 ? { status: 'stale' } : cancelled;
    },
  );

  if (!Array.isArray(out)) {
    return out;
  }

  for (const t of out) {
    await stopCancelled(deps, state, t);
  }

  requestTick(deps, state);
  const first = out[0];
  if (first?.card_id) {
    await notifyCard(deps, first.card_id);
  }

  return {
    status: 'done',
    interaction: row
      ? await deps.storage.transaction((tx) => tx.interactions.get(row.id))
      : null,
  };
}
