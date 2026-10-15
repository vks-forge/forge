/**
 * Builds the card views the routes return: summary (with rolled-up column) and detail.
 *
 * Why: the Board list, the Card page and the PATCH answer must agree on a card's column and
 *   counts, and the column must come from `rollupCardColumn` over the card's tickets and
 *   the pending questions, never from a stored value. One module reads those inputs and
 *   shapes the answer, so no route re-derives the column its own way.
 *
 * Exports: viewCard(), summarizeCard(), cardDetail().
 * Depends on: @forge/core (rollupCardColumn, card schemas), services/ticket-summary,
 *   types/card-view. IO:
 *   reads storage inside the caller's transaction.
 */

import { rollupCardColumn } from '@forge/core';
import type { Card, CardDetail, CardSummary, Interaction, StorageTx } from '@forge/core';
import { summarizeTicket } from '#/services/ticket-summary.js';
import type { CardView } from '#/types/card-view.types.js';

/** Reads the card's tickets and rolls up its column. `allPending` is every pending question (the caller reads it once per request). */
export async function viewCard(
  tx: StorageTx,
  card: Card,
  allPending: readonly Interaction[],
): Promise<CardView> {
  const tickets = await tx.tickets.listByCard(card.id);
  const ids = new Set<string>(tickets.map((t) => t.id));
  const pending = allPending.filter((i) => ids.has(i.ticket_id));

  return { card, tickets, pending, column: rollupCardColumn(card, tickets, pending) };
}

/** The Board shape; `project` is reported as the slug. */
export function summarizeCard(view: CardView, slug: string): CardSummary {
  return {
    ...view.card,
    project: slug,
    column: view.column,
    ticket_count: view.tickets.length,
    tickets_done: view.tickets.filter((t) => t.status === 'done').length,
  };
}

/** The Card page shape: the summary plus ticket summaries (with run status) and pending questions. */
export async function cardDetail(
  tx: StorageTx,
  view: CardView,
  slug: string,
): Promise<CardDetail> {
  const tickets = [];
  for (const ticket of view.tickets) {
    const run = ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null;
    tickets.push(summarizeTicket(ticket, slug, run?.status));
  }

  return {
    ...summarizeCard(view, slug),
    tickets,
    pending_interactions: [...view.pending],
  };
}
