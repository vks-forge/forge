/**
 * Builds the card views the routes return: summary (with rolled-up column) and detail.
 *
 * Why: the Board list, the Card page and the PATCH answer must agree on a card's column,
 *   Needs you overlay, counts and dependencies. The column comes from `rollupCardColumn`
 *   over the stored phase, the card's tickets and the pending questions, never from a stored
 *   column, and `needs_you` is the overlay (the card's own flag or a waiting ticket), so the
 *   owner's answer is never hidden. `blocks` is the reverse view of the `depends_on` edges.
 *   The grill's open-point count and the newest plan version come from the card's planning
 *   state. One module reads those inputs and shapes the answer, so no route re-derives them.
 *   Cost is the card's cached Director spend (the sum of its ledger rows, kept on that planning
 *   state) plus the card's tickets' recorded run cost, and the budget row reports the cap in force
 *   (core's `effectiveCardBudget`) against that same total; a list passes one grouped sum for its whole page so a Board of many cards does
 *   not query per card, and the detail adds the per-ticket split.
 *
 *   The summary also counts tickets running and tickets waiting on the owner, so a tile can say "2 running,
 *   1 waiting for you" without the web fetching the card's tickets; the detail's ticket rows carry stage,
 *   run in flight and Retry offer (services/ticket-progress).
 *
 * Exports: viewCard(), summarizeCard(), cardDetail().
 * Depends on: @forge/core (rollupCardColumn, rollupCardCost, effectiveCardBudget, card schemas), services/needs-you-view, services/ticket-summary, services/ticket-progress,
 *   types/card-view. IO:
 *   reads storage inside the caller's transaction.
 */

import {
  NEEDS_YOU_STATUSES,
  cardNeedsYou,
  effectiveCardBudget,
  rollupCardColumn,
  rollupCardCost,
} from '@forge/core';
import type {
  BudgetDefault,
  Card,
  CardDetail,
  CardDirectorStatus,
  CardRelation,
  CardSummary,
  Interaction,
  StorageTx,
} from '@forge/core';
import { cardNeedsYouDetail } from '#/services/needs-you-view.js';
import { progressExtra, ticketProgress } from '#/services/ticket-progress.js';
import { summarizeTicket } from '#/services/ticket-summary.js';
import type { CardView } from '#/types/card-view.types.js';

/**
 * Reads the card's tickets and rolls up its column. `allPending` is every pending question and
 * `relations` the dependency edges that touch the card (a whole project's list works too);
 * the caller reads both once per request. `ticketsUsd` is the card's ticket run cost when the
 * caller already read it for many cards at once; absent, it is read here for this card.
 */
export async function viewCard(
  tx: StorageTx,
  card: Card,
  allPending: readonly Interaction[],
  relations: readonly CardRelation[],
  ticketsUsd?: number,
): Promise<CardView> {
  const tickets = await tx.tickets.listByCard(card.id);
  const ids = new Set<string>(tickets.map((t) => t.id));
  const pending = allPending.filter((i) => ids.has(i.ticket_id));
  const planning = await tx.cardPlanning.get(card.id);
  const shaping = card.phase === 'grilling' || card.phase === 'verifying';

  return {
    card,
    tickets,
    pending,
    column: rollupCardColumn(card, tickets, pending),
    needsYou: cardNeedsYou(card, tickets, pending),
    dependsOn: relations.filter((r) => r.from === card.id).map((r) => r.to),
    blocks: relations.filter((r) => r.to === card.id).map((r) => r.from),
    openPoints: shaping ? planning.grill.open_points : null,
    planVersion: (await tx.cardPlanning.latestPlan(card.id))?.version ?? null,
    directorUsd: planning.grill.director_spend_usd,
    ticketsUsd: ticketsUsd ?? (await tx.runs.costByCard([card.id]))[card.id] ?? 0,
  };
}

/**
 * Tickets that wait on the owner, by the same rule as the card's Needs you overlay: finished work and
 * blocked tickets by status, a `waiting_human` ticket only while an owner question is open.
 */
function waitingOnOwner(view: CardView): number {
  const asked = new Set(
    view.pending.filter((i) => i.escalated_at !== undefined).map((i) => i.ticket_id),
  );

  return view.tickets.filter((t) =>
    t.status === 'waiting_human'
      ? asked.has(t.id)
      : NEEDS_YOU_STATUSES.includes(t.status),
  ).length;
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
    ticket_count: view.tickets.filter((t) => t.status !== 'cancelled').length,
    tickets_done: view.tickets.filter((t) => t.status === 'done').length,
    tickets_cancelled: view.tickets.filter((t) => t.status === 'cancelled').length,
    tickets_running: view.tickets.filter(
      (t) => t.status === 'in_progress' || t.status === 'verifying',
    ).length,
    tickets_waiting_you: waitingOnOwner(view),
    open_points: view.openPoints,
    plan_version: view.planVersion,
    cost_usd: view.directorUsd + view.ticketsUsd,
  };
}

/** The Card page shape: the summary plus ticket summaries (with run status), pending questions, the current needs-you items and the Director's chat status. */
export async function cardDetail(
  tx: StorageTx,
  view: CardView,
  slug: string,
  director: CardDirectorStatus,
  budgetDefault: BudgetDefault,
): Promise<CardDetail> {
  const costByTicket = await tx.runs.costByTicket(view.tickets.map((t) => t.id));
  const progress = await ticketProgress(tx, view.tickets, view.pending);
  const tickets = [];
  for (const ticket of view.tickets) {
    const run = ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null;
    tickets.push(
      summarizeTicket(ticket, slug, run?.status, {
        costUsd: costByTicket[ticket.id] ?? 0,
        ...progressExtra(progress, ticket.id),
        cardTitle: view.card.title,
      }),
    );
  }

  return {
    ...summarizeCard(view, slug),
    tickets,
    cost: rollupCardCost({
      directorUsd: view.directorUsd,
      tickets: view.tickets,
      costByTicket,
    }),
    budget: {
      ...effectiveCardBudget(view.card, budgetDefault),
      spent_usd: view.directorUsd + view.ticketsUsd,
    },
    pending_interactions: [...view.pending],
    needs_you_detail: await cardNeedsYouDetail(tx, view.card),
    director,
  };
}
