/**
 * Card chat ticket edits: the Director changes a ticket's waits, priority or brief.
 *
 * Why: the owner asks the card's Director to "make CHE-17 wait for CHE-27" or "raise CHE-27", and
 *   until now it could only say so. The action runs through the same `editTicketTx` door the
 *   ticket page uses, so the Director is held to the same rules as the owner (no loop, same
 *   project, nothing a running Worker would miss) and a refusal comes back as plain words
 *   on the card, never as a thrown error. It may only touch tickets of its own card.
 *
 * Exports: editTicketAction().
 * Depends on: @forge/core (TicketId, chat action schema), tick/card-chat-gate, tick/ticket-edit.
 *   Writes inside the caller's transaction.
 */

import { TicketId } from '@forge/core';
import type { ActionTaken, Card, StorageTx, TicketEditBody } from '@forge/core';
import { CHAT_ACTOR, done, refuse } from '#/tick/card-chat-gate.js';
import { editTicketTx } from '#/tick/ticket-edit.js';
import type { TicketEditAction } from '#/types/card-chat.types.js';

function editOf(action: TicketEditAction): TicketEditBody | string {
  if (action.kind === 'set_ticket_priority') {
    return { priority: action.priority };
  }

  if (action.kind === 'edit_ticket_description') {
    return { body: action.body };
  }

  const ids = action.depends_on.map((id) => TicketId.safeParse(id));
  const bad = action.depends_on.find((_, i) => !ids[i]?.success);

  return bad === undefined
    ? { depends_on: ids.flatMap((r) => (r.success ? [r.data] : [])) }
    : `${bad} is not a ticket id`;
}

/** Runs one ticket edit action on an open card; the outcome is on the card history already. */
export async function editTicketAction(
  tx: StorageTx,
  card: Card,
  at: string,
  action: TicketEditAction,
): Promise<ActionTaken> {
  const target = TicketId.safeParse(action.ticket_id);
  const ticket = target.success ? await tx.tickets.get(target.data) : null;
  if (!target.success || ticket?.card_id !== card.id) {
    return refuse(
      tx,
      card.id,
      at,
      action.kind,
      `${action.ticket_id} is not a ticket of this card`,
    );
  }

  const edit = editOf(action);
  if (typeof edit === 'string') {
    return refuse(tx, card.id, at, action.kind, edit);
  }

  const out = await editTicketTx(tx, target.data, edit, CHAT_ACTOR, at);
  if (out.status === 'refused') {
    return refuse(tx, card.id, at, action.kind, out.message);
  }

  if (out.status !== 'updated') {
    return refuse(
      tx,
      card.id,
      at,
      action.kind,
      `${action.ticket_id} could not be changed just now`,
    );
  }

  const summary = {
    set_ticket_dependencies: `set what ${ticket.id} waits for to ${
      (edit.depends_on ?? []).join(', ') || 'nothing'
    }`,
    set_ticket_priority: `set the priority of ${ticket.id} to ${edit.priority}`,
    edit_ticket_description: `changed the description of ${ticket.id}`,
  }[action.kind];

  return done(tx, card.id, at, action.kind, summary);
}
