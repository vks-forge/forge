/**
 * Park a ticket whose project asks for a harness this server does not have.
 *
 * Why: each project names the harness its Workers run on (`default_harness`), and a server
 *   only has the drivers installed on it. If that harness is missing, starting the run on
 *   some other harness would silently change who writes the code and what policy applies
 *   (fail closed). Retrying every tick cannot fix a missing install either. So the ticket
 *   is parked with the plain reason, the user sees it in "Needs you", and releasing it
 *   after installing the harness or changing the project's setting dispatches it normally.
 *
 * Exports: parkForHarness().
 * Depends on: tick/ticket-moves, steps/run-step (hold), types/engine-state. IO only through storage.
 */

import type { Ticket } from '@forge/core';
import { hold } from '#/steps/run-step.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Parks `ticket` (planned or in progress) with the harness error as its reason; holds dispatch either way. */
export async function parkForHarness(
  ctx: EngineCtx,
  ticket: Ticket,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  hold(ctx, `dispatch:${ticket.id}`);

  const moved = await moveTicket(ctx.deps.storage, ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'planned' || cur.status === 'in_progress'
      ? { events: [{ type: 'parked', reason }] }
      : null,
  );

  if (!moved.ok) {
    ctx.report.errors.push({ where: `dispatch ${ticket.id}`, message: reason });

    return;
  }

  ctx.report.parked.push({ ticketId: ticket.id, reason });
  ctx.deps.log?.('warn', `${ticket.id} parked: ${reason}`);
}
