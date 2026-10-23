/**
 * The Director's `cancel_ticket` action: the owner's cancel door, used on the owner's word.
 *
 * Why: when the owner tells a card's Director "stop FG-12", the Director must be able to do it,
 *   but its reply is untrusted model output. The action therefore checks that the ticket belongs
 *   to this card and is still open, then goes through `cancelFlow()`, the same door the ticket
 *   page uses: the Worker is stopped, the folder, branch and PR are cleaned up, the ticket moves
 *   through `transition()`, and a ticket others wait on is refused naming them unless the Director
 *   asked for `cascade`. The history line says the Director did it and why (d-0179). The owner must
 *   really have asked: fail closed, the action is refused unless a person's own message that
 *   triggered this turn names the ticket (id or plan key, as a whole word). Turns triggered only by
 *   escalations, Worker blocks, system events or Director steps can never cancel.
 *
 * Exports: cancelTicketAction().
 * Depends on: @forge/core (TERMINAL_STATUSES, chat types), tick/card-chat-gate, tick/escalation-cancel, tick/plan-keys. Writes storage.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { ActionTaken, CardChatAction, CardId, TicketId } from '@forge/core';
import { done, gate, refuse } from '#/tick/card-chat-gate.js';
import { ticketPlanKeys } from '#/tick/plan-keys.js';
import { cancelFlow } from '#/tick/escalation-cancel.js';
import type { ChatTurn } from '#/types/card-chat.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the owner's words name the ticket by id or plan key, as a whole word (FG-1 is not FG-12). */
function namesTicket(text: string, id: string, planKey: string | undefined): boolean {
  return [id, planKey].some(
    (name) =>
      name !== undefined &&
      new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`, 'i').test(text),
  );
}

/** Cancels one ticket of the card through the one cancel door; a refusal is a card note, never a throw. */
export async function cancelTicketAction(
  ctx: EngineCtx,
  cardId: CardId,
  action: Extract<CardChatAction, { kind: 'cancel_ticket' }>,
  turn: ChatTurn,
): Promise<ActionTaken> {
  const { deps, state, nowIso } = ctx;
  const refusal = await deps.storage.transaction(async (tx) => {
    const g = await gate(tx, cardId, nowIso, 'cancel_ticket');
    if (!g.ok) {
      return g.taken;
    }

    const ticket = await tx.tickets.get(action.ticket_id as TicketId);
    const key = (await ticketPlanKeys(tx, cardId)).get(action.ticket_id)?.key;
    if (!namesTicket(turn.ownerText, action.ticket_id, key)) {
      return refuse(
        tx,
        cardId,
        nowIso,
        'cancel_ticket',
        `the owner did not ask for ${action.ticket_id} to be cancelled in this message (suggest it instead)`,
      );
    }

    if (ticket?.card_id !== cardId) {
      return refuse(
        tx,
        cardId,
        nowIso,
        'cancel_ticket',
        `${action.ticket_id} is not a ticket of this card`,
      );
    }

    return TERMINAL_STATUSES.includes(ticket.status)
      ? refuse(
          tx,
          cardId,
          nowIso,
          'cancel_ticket',
          `${action.ticket_id} is already ${ticket.status}`,
        )
      : null;
  });

  if (refusal) {
    return refusal;
  }

  const out = await cancelFlow(
    deps,
    state,
    action.ticket_id,
    null,
    action.cascade === true,
    'director',
    { by: 'director', reason: action.reason },
  );

  return deps.storage.transaction((tx) => {
    switch (out.status) {
      case 'done':
        return done(
          tx,
          cardId,
          nowIso,
          'cancel_ticket',
          `cancelled ${action.ticket_id}: ${action.reason}`,
        );
      case 'ticket_has_dependents':
        return refuse(
          tx,
          cardId,
          nowIso,
          'cancel_ticket',
          `${out.dependents.join(', ')} wait on ${action.ticket_id}; cancel them with it (cascade) or leave it`,
        );
      default:
        return refuse(
          tx,
          cardId,
          nowIso,
          'cancel_ticket',
          `${action.ticket_id} could not be cancelled (${out.status})`,
        );
    }
  });
}
