/**
 * rollupTicketCost / rollupCardCost: add up recorded dollars for a ticket and for a card.
 *
 * Why: the ticket and card pages show spend beside the work. One pure place does the
 *   arithmetic so the headline and the breakdown always agree: a card's total is exactly its
 *   Director spend plus its tickets' run spend, and a run with no recorded cost is zero and
 *   flagged rather than priced from tokens (a guessed price shown as spend is worse than a
 *   visible gap).
 *
 * Exports: rollupTicketCost(), rollupCardCost().
 * Depends on: schemas/cost-rollup, schemas/run, types/cost-rollup-input.types. No IO.
 */

import type { CardCost, TicketCost } from '#/schemas/cost-rollup.js';
import type { Run } from '#/schemas/run.js';
import type { CardCostInput } from '#/types/cost-rollup-input.types.js';

/** The ticket's runs, oldest start first, with their summed recorded cost. */
export function rollupTicketCost(runs: readonly Run[]): TicketCost {
  const by_run = [...runs]
    .sort((a, b) =>
      a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
    )
    .map((r) => ({
      run_id: r.id,
      usd: r.cost_usd ?? 0,
      status: r.status,
      started_at: r.started_at,
      recorded: r.cost_usd !== undefined,
    }));

  return { total_usd: by_run.reduce((sum, r) => sum + r.usd, 0), by_run };
}

/** The card's Director spend plus its tickets' run spend, with every ticket listed highest first. */
export function rollupCardCost(input: CardCostInput): CardCost {
  // Array.prototype.sort is stable, so equal spend keeps the card's own ticket order.
  const by_ticket = input.tickets
    .map((t) => ({
      ticket_id: t.id,
      title: t.title,
      usd: input.costByTicket[t.id] ?? 0,
    }))
    .sort((a, b) => b.usd - a.usd);

  const tickets_usd = by_ticket.reduce((sum, t) => sum + t.usd, 0);

  return {
    director_usd: input.directorUsd,
    tickets_usd,
    total_usd: input.directorUsd + tickets_usd,
    by_ticket,
  };
}
