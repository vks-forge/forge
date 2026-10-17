/**
 * Inbox ticket insert: the one way the engine files a new ticket under a card.
 *
 * Why: a ticket is born in two places, intake (a request whose card type starts work) and the
 *   card chat (the Director filing more work at the user's word). Both must number it the
 *   same way (`<PROJECT>-<n>`, next free), start it in the `inbox` for triage, link it to its
 *   card and write `ticket_created` to the card history in the same transaction, so a ticket
 *   can never exist without its history line or be filed twice under one number. One function
 *   keeps that identical for every caller. New work on a card that was `done` moves it back to
 *   `in_progress`.
 *
 * Exports: insertInboxTicket().
 * Depends on: @forge/core (ticket schemas, makeTicketId), domain/ticket-numbers, tick/card-log,
 *   types/ticket-insert.
 *   Writes inside the caller's transaction.
 */

import { TicketStatus, makeTicketId } from '@forge/core';
import type { Project, StorageTx, Ticket } from '@forge/core';
import { nextTicketNumber } from '#/domain/ticket-numbers.js';
import { logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import type { NewInboxTicket } from '#/types/ticket-insert.types.js';

async function allTicketIds(tx: StorageTx): Promise<string[]> {
  const lists = await Promise.all(
    TicketStatus.options.map((s) => tx.tickets.listByStatus(s)),
  );

  return lists.flat().map((t) => t.id);
}

/** Inserts the ticket and logs `ticket_created` on its card; returns the stored ticket. */
export async function insertInboxTicket(
  tx: StorageTx,
  project: Project,
  input: NewInboxTicket,
): Promise<Ticket> {
  const id = makeTicketId(
    project.prefix,
    nextTicketNumber(await allTicketIds(tx), project.prefix),
  );

  const ticket: Ticket = {
    id,
    project: project.id,
    card_id: input.cardId,
    title: input.title,
    body: input.body,
    type: input.type,
    lane: input.lane ?? 'express',
    tier_predicted: 'A',
    status: 'inbox',
    status_version: 0,
    rework_count: 0,
    priority: input.priority ?? 0,
    ...(input.createdByIntake === undefined
      ? {}
      : { created_by_intake: input.createdByIntake }),
    created_at: input.at,
    updated_at: input.at,
    blocked_by: [...(input.blockedBy ?? [])] as Ticket['blocked_by'],
  };

  await tx.tickets.insert(ticket);
  await logCardEvent(tx, input.cardId, {
    kind: 'ticket_created',
    at: input.at,
    actor: input.actor,
    payload: { ticket_id: id, title: input.title },
  });

  // A finished card that gets new work is live again (through the one card door), so the Board
  // does not show a Done card with open tickets.
  const card = await tx.cards.get(input.cardId);
  if (card?.phase === 'done') {
    await moveCardTx(tx, card.id, { type: 'resume_work' }, input.at);
  }

  return ticket;
}
