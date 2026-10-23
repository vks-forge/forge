/**
 * Run as Express: releases a ticket held for a lane into the Express lane.
 *
 * Why: only Express has a pipeline today, so a Standard or Full ticket is held with a lane-hold
 *   escalation (d-0135). "Run as Express" is the owner's way out: it settles that escalation, then
 *   moves the ticket through `transition()` (`unparked`, lane lowered to express, which only a
 *   person may do: d-0141 item 9) and lets the tick pick it up. It refuses a ticket with no pending
 *   lane hold, so it can never release a ticket that waits for another reason.
 *
 * Exports: runAsExpress().
 * Depends on: @forge/core (toEscalation), tick/card-log, tick/card-notify, tick/escalation-settle,
 *   tick/ticket-moves, tick/tick-requests, types/card-planning. Writes storage.
 */

import { toEscalation } from '@forge/core';
import type { TicketId } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { settleEscalation } from '#/tick/escalation-settle.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { RunAsExpressResult } from '#/types/card-planning.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** `POST /tickets/:id/run-as-express`: releases a ticket held for a lane into the Express lane, through `transition()`, and settles its lane-hold escalation. */
export async function runAsExpress(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
  author: string,
): Promise<RunAsExpressResult> {
  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<RunAsExpressResult> => {
      const existing = await tx.tickets.get(ticketId as TicketId);
      if (!existing) {
        return { status: 'not_found' };
      }

      const held = (await tx.interactions.listByTicket(ticketId)).find((i) => {
        const view = toEscalation(i);

        return (
          i.status === 'pending' &&
          view.payload.kind === 'failure' &&
          view.payload.cause === 'lane_hold'
        );
      });

      if (!held || existing.status !== 'waiting_human') {
        return { status: 'not_held' };
      }

      // Settle first: the move below closes any wait still pending as "ticket moved on".
      await settleEscalation(
        tx,
        at,
        { ...held, card_id: held.card_id ?? existing.card_id },
        { action: 'run_as_express', by: 'owner' },
        author,
      );

      const moved = await moveTicketTx(tx, ticketId, at, (t) =>
        t.status === 'waiting_human'
          ? {
              events: [{ type: 'unparked' }],
              fields: { lane: 'express' },
              reason: 'You chose to run it as Express',
            }
          : null,
      );

      if (!moved.ok) {
        throw new Error(`could not release ${ticketId}: ${moved.reason}`);
      }

      await logCardEvent(tx, moved.ticket.card_id, {
        kind: 'note',
        at,
        actor: { type: 'user', id: author },
        payload: { text: `${ticketId} was released to run as Express.` },
      });

      return { status: 'released', ticket: moved.ticket };
    },
  );

  if (result.status === 'released') {
    requestTick(deps, state);
    if (result.ticket.card_id) {
      await notifyCard(deps, result.ticket.card_id);
    }
  }

  return result;
}
