/**
 * Settling an escalation: the one way an interaction ends with an action.
 *
 * Why: whoever ends a wait (the owner's click, the Director's first look, an automatic resume
 *   once a setup is fixed) must do the same three things together or the owner's screens drift:
 *   close the interaction by compare-and-swap so two writers cannot both win, store who did what
 *   as the answer, and write `escalation_settled` to the card so the chat can say "answered by
 *   the Director" or "resumed by itself". A ticket that leaves its waiting state some other way
 *   (cancelled, released by the old route) has its leftover waits closed here too, so nothing
 *   stays pending against a ticket that moved on.
 *
 * Exports: settleEscalation(), cancelLeftovers().
 * Depends on: @forge/core (escalation schemas, storage tx), tick/card-log. Writes inside the caller's transaction.
 */

import type {
  CardActor,
  EscalationAnswer,
  Interaction,
  StorageTx,
  Ticket,
} from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';

const actorOf = (answer: EscalationAnswer, author: string): CardActor =>
  answer.by === 'owner' ? { type: 'user', id: author } : ENGINE_ACTOR;

/**
 * Closes `row` with `answer` if it is still pending and logs `escalation_settled` on its card;
 * false (and nothing written) when it was not pending. `author` names the person for `by: owner`.
 */
export async function settleEscalation(
  tx: StorageTx,
  nowIso: string,
  row: Pick<Interaction, 'id' | 'ticket_id' | 'card_id'>,
  answer: EscalationAnswer,
  author = 'owner',
): Promise<boolean> {
  if (!(await tx.interactions.answer(row.id, answer, nowIso))) {
    return false;
  }

  await logCardEvent(tx, row.card_id, {
    kind: 'escalation_settled',
    at: nowIso,
    actor: actorOf(answer, author),
    payload: {
      interaction_id: row.id,
      ticket_id: row.ticket_id as Ticket['id'],
      action: answer.action,
      by: answer.by,
      ...(answer.note === undefined ? {} : { note: answer.note }),
      ...(answer.comment === undefined ? {} : { comment: answer.comment }),
    },
  });

  return true;
}

/**
 * Cancels every interaction of `ticketId` still pending, for a ticket that left its waiting state
 * without anyone settling them; each is closed as settled by the system (`cancel`, `auto`).
 */
export async function cancelLeftovers(
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
  note: string,
): Promise<void> {
  for (const row of await tx.interactions.listByTicket(ticketId)) {
    if (row.status !== 'pending') {
      continue;
    }

    await tx.interactions.update(row.id, { status: 'cancelled', answered_at: nowIso });
    await logCardEvent(tx, row.card_id, {
      kind: 'escalation_settled',
      at: nowIso,
      actor: ENGINE_ACTOR,
      payload: {
        interaction_id: row.id,
        ticket_id: ticketId as Ticket['id'],
        action: 'cancel',
        by: 'auto',
        note,
      },
    });
  }
}
