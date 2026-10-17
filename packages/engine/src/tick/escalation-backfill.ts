/**
 * Escalation backfill: gives every ticket that was already waiting an escalation to act on.
 *
 * Why: tickets parked before escalations existed carry only a reason text and no interaction, so
 *   the owner's screens would show nothing to click for them (the invariant sweep reports exactly
 *   these). When the engine starts, each waiting or blocked ticket with no pending interaction
 *   (and no wake already on its way) gets one at the owner's stage, its cause read off the reason
 *   text in code by core `classifyPark`: a held lane (DCP-1 included) becomes a lane hold so
 *   "Run as Express" works, a retry cap offers "Retry", and so on. It is idempotent: a ticket
 *   that already has a pending interaction, or whose answer is waiting on its response wake, is
 *   left alone, so running it twice, or after a restart, changes nothing.
 *
 * Exports: backfillEscalations().
 * Depends on: @forge/core (classifyPark), tick/escalation-raise, shared/time. Reads and writes storage.
 */

import { classifyPark } from '@forge/core';
import { FAR_FUTURE } from '#/shared/time.js';
import { isCardClosed } from '#/tick/card-close.js';
import { attemptsOf, raiseEscalation } from '#/tick/escalation-raise.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Raises an owner-stage escalation for each waiting ticket that has none; returns how many it raised. */
export async function backfillEscalations(ctx: EngineCtx): Promise<number> {
  return ctx.deps.storage.transaction(async (tx) => {
    const pending = new Set(
      (await tx.interactions.listPending()).map((i) => i.ticket_id),
    );

    const wakes = new Set(
      (await tx.wakeRequests.listDue(FAR_FUTURE)).map((w) => w.ticket_id),
    );

    const waiting = [
      ...(await tx.tickets.listByStatus('waiting_human')),
      ...(await tx.tickets.listByStatus('blocked')),
    ];

    let raised = 0;
    for (const ticket of waiting) {
      if (pending.has(ticket.id) || wakes.has(ticket.id)) {
        continue;
      }

      const card =
        ticket.card_id === undefined ? null : await tx.cards.get(ticket.card_id);

      const park = card && isCardClosed(card) ? null : classifyPark(ticket);
      if (!park) {
        continue;
      }

      await raiseEscalation(
        tx,
        ctx.deps,
        ctx.nowIso,
        ticket,
        {
          kind: 'failure',
          cause: park.cause,
          summary: park.summary,
          attempts: await attemptsOf(tx, ticket.id),
          lane: ticket.lane,
        },
        'owner',
      );

      raised += 1;
    }

    return raised;
  });
}
