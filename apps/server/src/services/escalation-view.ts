/**
 * Escalation views: interaction rows turned into what the owner's screens read.
 *
 * Why: the Inbox, the Card page and the Ticket page all show the same escalation, so one service
 *   builds it. Core reads the row into its typed form (legacy rows included); this adds what only
 *   storage knows: the ticket's title, the card, and the actions the owner may take now. A wait the
 *   Director is still looking at offers no actions (the owner is shown "Director is looking at
 *   this"), and a settled one offers none either. A re-plan is offered only for a ticket whose card
 *   is not a Discussion, so every action on offer is one the engine will accept.
 *
 * Exports: escalationViews(), waitActionsFor(), cardEscalations().
 * Depends on: @forge/core (escalation rules and schemas, storage tx). IO: reads storage inside the caller's transaction.
 */

import { escalationActions, ticketWaitActions, toEscalation } from '@forge/core';
import type {
  CardId,
  EscalationAction,
  EscalationView,
  Interaction,
  StorageTx,
  Ticket,
} from '@forge/core';

const SETTLED_LIMIT = 50;

/** Whether a re-plan has a card to go back through: the ticket has one, open and not a Discussion. */
async function replannable(tx: StorageTx, ticket: Ticket | null): Promise<boolean> {
  const card = ticket?.card_id === undefined ? null : await tx.cards.get(ticket.card_id);

  return card !== null && card.type !== 'discussion' && card.closed_reason === undefined;
}

/** The views of `rows`, in the order given. */
export async function escalationViews(
  tx: StorageTx,
  rows: readonly Interaction[],
): Promise<EscalationView[]> {
  const tickets = new Map<string, Ticket | null>();
  const out: EscalationView[] = [];
  for (const row of rows) {
    if (!tickets.has(row.ticket_id)) {
      tickets.set(row.ticket_id, await tx.tickets.get(row.ticket_id as Ticket['id']));
    }

    const ticket = tickets.get(row.ticket_id) ?? null;
    const base = toEscalation(row);
    const actions: EscalationAction[] =
      row.status === 'pending' && base.stage === 'owner'
        ? escalationActions(base.payload, { replannable: await replannable(tx, ticket) })
        : [];

    out.push({
      ...base,
      ticket_title: ticket?.title ?? '',
      ...(base.card_id === undefined && ticket?.card_id !== undefined
        ? { card_id: ticket.card_id }
        : {}),
      actions,
    });
  }

  return out;
}

/** What the ticket page offers for the ticket's own wait (`wait_actions`). */
export async function waitActionsFor(
  tx: StorageTx,
  ticket: Ticket,
  pending: readonly EscalationView[],
  waitReason: string | null,
): Promise<EscalationAction[]> {
  return ticketWaitActions(
    { status: ticket.status, replannable: await replannable(tx, ticket) },
    pending,
    waitReason,
  );
}

/** A card's escalations: every pending one first, then the last settled ones, newest first. */
export async function cardEscalations(
  tx: StorageTx,
  cardId: CardId,
): Promise<EscalationView[]> {
  const pending = await tx.interactions.listPendingByCard(cardId);
  const tickets = await tx.tickets.listByCard(cardId);
  const settled = (
    await Promise.all(tickets.map((t) => tx.interactions.listByTicket(t.id)))
  )
    .flat()
    .filter((i) => i.status !== 'pending')
    .sort((a, b) =>
      (b.answered_at ?? b.asked_at).localeCompare(a.answered_at ?? a.asked_at),
    )
    .slice(0, SETTLED_LIMIT);

  return escalationViews(tx, [...pending, ...settled]);
}
