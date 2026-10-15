/**
 * Interactions: answering a parked ticket's question, and expiring one nobody answers.
 *
 * Why: a Worker that needs a human pauses and the ticket parks in WaitingHuman with the
 *   interaction as its durable reason (director-core.md §8). The answer must be accepted
 *   exactly once (a human and a timeout cannot both resolve it) and must wake the ticket
 *   through the wake queue so the resume is a normal dispatch. A question nobody answers
 *   for `interaction_timeout_ms` must not leave the ticket waiting silently forever: it
 *   moves to Blocked with a reason the control room shows.
 *
 * Exports: answerInteraction(), answerPending(), expireInteractions().
 * Depends on: @forge/core (interaction port), tick/card-log, tick/wakes, tick/ticket-moves, tick/tick-requests.
 */

import type { StorageTx, Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { requestTick } from '#/tick/tick-requests.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** CAS-answers `id` and queues the response wake; false when it was not pending. */
async function answerIn(
  deps: EngineDeps,
  tx: StorageTx,
  id: string,
  ticketId: string,
  answer: unknown,
): Promise<boolean> {
  const won = await tx.interactions.answer(id, answer, iso(deps.clock.now()));
  if (!won) {
    return false;
  }

  const ticket = await tx.tickets.get(ticketId as Ticket['id']);
  await logCardEvent(tx, ticket?.card_id, {
    kind: 'interaction_answered',
    at: iso(deps.clock.now()),
    actor: { type: 'user', id: 'owner' },
    payload: { ticket_id: ticketId, interaction_id: id },
  });

  await requestWakeTx(tx, deps, {
    ticketId,
    kind: 'response_wake',
    reason: 'answered',
    key: id,
  });

  return true;
}

/** Answers a pending interaction by id; false when unknown or no longer pending. */
export async function answerInteraction(
  deps: EngineDeps,
  state: EngineState,
  id: string,
  answer: unknown,
): Promise<boolean> {
  const won = await deps.storage.transaction(async (tx) => {
    const row = await tx.interactions.get(id);

    return row ? answerIn(deps, tx, id, row.ticket_id, answer) : false;
  });

  if (won) {
    requestTick(deps, state);
  }

  return won;
}

/** A chat reply answers a ticket's single pending question; returns its id, else null. */
export async function answerPending(
  deps: EngineDeps,
  tx: StorageTx,
  ticket: Ticket,
  text: string,
): Promise<string | null> {
  if (ticket.status !== 'waiting_human') {
    return null;
  }

  const pending = (await tx.interactions.listByTicket(ticket.id)).filter(
    (i) => i.status === 'pending',
  );

  const only = pending.length === 1 ? pending[0] : undefined;
  if (!only) {
    return null;
  }

  return (await answerIn(deps, tx, only.id, ticket.id, text)) ? only.id : null;
}

/** Expires overdue questions and blocks their tickets with a reason. */
export async function expireInteractions(ctx: EngineCtx): Promise<void> {
  const { storage } = ctx.deps;
  const pending = await storage.transaction((tx) => tx.interactions.listPending());
  for (const i of pending) {
    if (Date.parse(i.timeout_at) > ctx.now) {
      continue;
    }

    await storage.transaction(async (tx) => {
      if (!(await tx.interactions.expire(i.id, ctx.nowIso))) {
        return;
      }

      const moved = await moveTicketTx(tx, i.ticket_id, ctx.nowIso, (t) =>
        t.status === 'waiting_human'
          ? {
              events: [
                { type: 'blocked', reason: `question timed out unanswered (${i.id})` },
              ],
            }
          : null,
      );

      if (moved.ok) {
        ctx.deps.log?.('info', `interaction ${i.id} timed out`, { ticket: i.ticket_id });
      }
    });
  }
}
