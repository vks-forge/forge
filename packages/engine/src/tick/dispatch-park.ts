/**
 * Park a ticket that cannot be dispatched until a human fixes something outside Forge.
 *
 * Why: each project names the harness its Workers run on (`default_harness`), and a server
 *   only has the drivers installed on it. If that harness is missing, starting the run on
 *   some other harness would silently change who writes the code and what policy applies
 *   (fail closed). Retrying every tick cannot fix a missing install either. So the ticket
 *   is parked with the plain reason, the user sees it in "Needs you", and releasing it
 *   after installing the harness or changing the project's setting dispatches it normally.
 *
 *   The park raises an escalation for the owner (Retry once it is fixed, Re-plan or Cancel), at
 *   the owner's stage: the Director has nothing to try on a missing install.
 *
 *   The same park serves the other case a retry cannot fix: the project's repository has no
 *   commit to cut a worktree from (an init-only folder, d-0124). The reason is the plain
 *   message the user reads in "Needs you".
 *
 * Exports: parkForHarness(), parkDispatch().
 * Depends on: tick/escalation-raise, tick/ticket-moves, steps/run-step (hold), types/engine-state. IO only through storage.
 */

import type { Ticket } from '@forge/core';
import { hold } from '#/steps/run-step.js';
import { attemptsOf, raiseEscalation } from '#/tick/escalation-raise.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Parks `ticket` (planned or in progress) with the error as its reason; holds dispatch either way. */
export async function parkDispatch(
  ctx: EngineCtx,
  ticket: Ticket,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  hold(ctx, `dispatch:${ticket.id}`);

  const moved = await ctx.deps.storage.transaction(async (tx) => {
    const parked = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
      cur.status === 'planned' || cur.status === 'in_progress'
        ? { events: [{ type: 'parked', reason }] }
        : null,
    );

    // Nothing the Director can try fixes a missing harness or an empty repository: straight to the owner.
    if (parked.ok) {
      await raiseEscalation(
        tx,
        ctx.deps,
        ctx.nowIso,
        parked.ticket,
        {
          kind: 'failure',
          cause: 'not_retried',
          summary: reason,
          attempts: await attemptsOf(tx, ticket.id),
          lane: parked.ticket.lane,
        },
        'owner',
      );
    }

    return parked;
  });

  if (!moved.ok) {
    ctx.report.errors.push({ where: `dispatch ${ticket.id}`, message: reason });

    return;
  }

  ctx.report.parked.push({ ticketId: ticket.id, reason });
  ctx.deps.log?.('warn', `${ticket.id} parked: ${reason}`);
}

/** Parks `ticket` because its harness is missing (see {@link parkDispatch}). */
export const parkForHarness = parkDispatch;
