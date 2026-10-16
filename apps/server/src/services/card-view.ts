/**
 * Builds the card views the routes return: summary (with rolled-up column) and detail.
 *
 * Why: the Board list, the Card page and the PATCH answer must agree on a card's column,
 *   Needs you overlay, counts and dependencies. The column comes from `rollupCardColumn`
 *   over the stored phase, the card's tickets and the pending questions, never from a stored
 *   column, and `needs_you` is the overlay (the card's own flag or a waiting ticket), so the
 *   owner's answer is never hidden. `blocks` is the reverse view of the `depends_on` edges.
 *   One module reads those inputs and shapes the answer, so no route re-derives them.
 *
 * Exports: viewCard(), summarizeCard(), cardDetail().
 * Depends on: @forge/core (rollupCardColumn, card schemas), services/ticket-summary,
 *   types/card-view. IO:
 *   reads storage inside the caller's transaction.
 */

import { cardNeedsYou, rollupCardColumn } from '@forge/core';
import type {
  Card,
  CardDetail,
  CardDirectorStatus,
  CardRelation,
  CardSummary,
  Interaction,
  StorageTx,
} from '@forge/core';
import { summarizeTicket } from '#/services/ticket-summary.js';
import type { CardView } from '#/types/card-view.types.js';

/**
 * Reads the card's tickets and rolls up its column. `allPending` is every pending question and
 * `relations` the dependency edges that touch the card (a whole project's list works too);
 * the caller reads both once per request.
 */
export async function viewCard(
  tx: StorageTx,
  card: Card,
  allPending: readonly Interaction[],
  relations: readonly CardRelation[],
): Promise<CardView> {
  const tickets = await tx.tickets.listByCard(card.id);
  const ids = new Set<string>(tickets.map((t) => t.id));
  const pending = allPending.filter((i) => ids.has(i.ticket_id));

  return {
    card,
    tickets,
    pending,
    column: rollupCardColumn(card, tickets, pending),
    needsYou: cardNeedsYou(card, tickets, pending),
    dependsOn: relations.filter((r) => r.from === card.id).map((r) => r.to),
    blocks: relations.filter((r) => r.to === card.id).map((r) => r.from),
  };
}

/** The Board shape; `project` is reported as the slug. */
export function summarizeCard(view: CardView, slug: string): CardSummary {
  return {
    ...view.card,
    project: slug,
    needs_you: view.needsYou,
    column: view.column,
    depends_on: [...view.dependsOn],
    blocks: [...view.blocks],
    ticket_count: view.tickets.length,
    tickets_done: view.tickets.filter((t) => t.status === 'done').length,
  };
}

/** The Card page shape: the summary plus ticket summaries (with run status), pending questions and the Director's chat status. */
export async function cardDetail(
  tx: StorageTx,
  view: CardView,
  slug: string,
  director: CardDirectorStatus,
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
    director,
  };
}
