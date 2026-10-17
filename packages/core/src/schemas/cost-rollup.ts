/**
 * Cost rollup schemas: what one ticket and one card cost, with the split behind the total.
 *
 * Why: the owner asks "what did this card cost?" and wants the answer broken down: the
 *   Director's own work (planning, chat, escalation answers) versus the Workers' runs, and
 *   per run or per ticket underneath. Only recorded dollars are summed; a run that recorded
 *   no cost counts as zero and says so (`recorded: false`), so a gap reads as a gap, never
 *   as a free run. Defined here so the server routes and the web pages share one shape.
 *
 * Exports: TicketRunCost, TicketCost, CardTicketCost, CardCost.
 * Depends on: schemas/run, zod. No IO.
 */

import { z } from 'zod';
import { RunStatus } from '#/schemas/run.js';

const Usd = z.number().nonnegative();

/** One run's line on a ticket. `recorded` is false when the harness reported no cost (`usd` is then 0). */
export const TicketRunCost = z.object({
  run_id: z.string().min(1),
  usd: Usd,
  status: RunStatus,
  started_at: z.iso.datetime(),
  recorded: z.boolean(),
});
export type TicketRunCost = z.infer<typeof TicketRunCost>;

/** `cost` on `GET /tickets/:id`: the sum of its runs, oldest run first. */
export const TicketCost = z.object({
  total_usd: Usd,
  by_run: z.array(TicketRunCost),
});
export type TicketCost = z.infer<typeof TicketCost>;

export const CardTicketCost = z.object({
  ticket_id: z.string().min(1),
  title: z.string(),
  usd: Usd,
});
export type CardTicketCost = z.infer<typeof CardTicketCost>;

/**
 * `cost` on `GET /cards/:id`. `director_usd` is the card's Director steps (planning, chat
 * turns, escalation answers), `tickets_usd` the runs of its tickets; `total_usd` is their sum.
 * `by_ticket` lists every ticket of the card, highest spend first.
 */
export const CardCost = z.object({
  director_usd: Usd,
  tickets_usd: Usd,
  total_usd: Usd,
  by_ticket: z.array(CardTicketCost),
});
export type CardCost = z.infer<typeof CardCost>;
