/**
 * Cost report schema — where a project's money and tokens went.
 *
 * Why: Workers bill by the token and a project owner wants to know which tickets, runs and
 *   harnesses ate the budget. The Director's own steps cost money too, so the report adds both
 *   sources: `worker_usd` (runs), `director_usd` (the dated Director spend ledger) and their sum
 *   `total_usd`, with the same split per day, so the project total matches the sum of its cards. Forge records a run's `cost_usd` (when the harness reported
 *   one) and its token usage per model, and nothing else: there is no per-model price table
 *   and no spend budget per period. So this report adds up what was recorded, shows tokens
 *   per model (never a made-up dollar figure), says how many runs had a cost
 *   (`runs_with_cost` of `runs_total`) and returns only the budgets that settings really
 *   hold (the per-run and per-step caps), with `null` where none exists.
 *
 * Exports: TokenTotals, CostDayPoint, CostByTicket, CostByRun, CostByHarness, CostByModel, CostBudgets,
 *   CostReport, CostPageQuery, COST_TOP_N, COST_PAGE_MAX.
 * Depends on: schemas/stats-range, zod. No IO.
 */

import { z } from 'zod';
import { SeriesPoint, StatsWindow } from '#/schemas/stats-range.js';

const Count = z.number().int().nonnegative();

/** Token counts, summed. */
export const TokenTotals = z.object({
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
  cached_in: z.number().nonnegative(),
  cache_write: z.number().nonnegative(),
});
export type TokenTotals = z.infer<typeof TokenTotals>;

/** One UTC day of spend, split by source; `worker_usd + director_usd` is that day's total. */
export const CostDayPoint = z.object({
  date: z.iso.date(),
  worker_usd: z.number().nonnegative(),
  director_usd: z.number().nonnegative(),
});
export type CostDayPoint = z.infer<typeof CostDayPoint>;

/** Worker spend of one ticket (its runs); the Director's share of a ticket is on the ticket page. */
export const CostByTicket = z.object({
  ticket_id: z.string().min(1),
  title: z.string().optional(),
  cost_usd: z.number().nonnegative(),
  runs: Count,
  tokens: TokenTotals,
});
export type CostByTicket = z.infer<typeof CostByTicket>;

export const CostByRun = z.object({
  run_id: z.string().min(1),
  ticket_id: z.string().min(1),
  harness: z.string().min(1),
  started_at: z.iso.datetime(),
  /** Null when the run recorded no cost. */
  cost_usd: z.number().nonnegative().nullable(),
  tokens: TokenTotals,
});
export type CostByRun = z.infer<typeof CostByRun>;

export const CostByHarness = z.object({
  harness: z.string().min(1),
  cost_usd: z.number().nonnegative(),
  runs: Count,
  tokens: TokenTotals,
});
export type CostByHarness = z.infer<typeof CostByHarness>;

/** Tokens per model; dollars are not split by model because Forge records none. */
export const CostByModel = z.object({
  model: z.string().min(1),
  tokens: TokenTotals,
});
export type CostByModel = z.infer<typeof CostByModel>;

/** The caps settings hold; `period_usd` is always null (no per-period budget exists yet). */
export const CostBudgets = z.object({
  run_max_usd: z.number().positive(),
  step_budget_usd: z.number().positive(),
  period_usd: z.null(),
});
export type CostBudgets = z.infer<typeof CostBudgets>;

/** Default page size of `by_ticket` and `by_run` (the report's long-standing top 50). */
export const COST_TOP_N = 50;
/** Largest page a client may ask for. */
export const COST_PAGE_MAX = 100;

/** `GET /projects/:slug/cost` paging parameters; ticket and run tables page independently. */
export const CostPageQuery = z.object({
  ticket_limit: z.coerce.number().int().min(1).max(COST_PAGE_MAX).default(COST_TOP_N),
  ticket_offset: z.coerce.number().int().min(0).default(0),
  run_limit: z.coerce.number().int().min(1).max(COST_PAGE_MAX).default(COST_TOP_N),
  run_offset: z.coerce.number().int().min(0).default(0),
});
export type CostPageQuery = z.infer<typeof CostPageQuery>;

/** `GET /projects/:slug/cost`. */
export const CostReport = StatsWindow.extend({
  project: z.string().min(1),
  /** Workers plus Director: `worker_usd + director_usd`. */
  total_usd: z.number().nonnegative(),
  /** Dollars the runs recorded. */
  worker_usd: z.number().nonnegative(),
  /** Dollars the Director's steps recorded (planning, chat, escalation answers, checks). */
  director_usd: z.number().nonnegative(),
  runs_total: Count,
  runs_with_cost: Count,
  /** Director steps in the window, and how many of them carried a price. */
  director_steps_total: Count,
  director_steps_recorded: Count,
  tokens: TokenTotals,
  /** Total (Workers plus Director) per UTC day. */
  per_day: z.array(SeriesPoint),
  /** The same days split by source; each day's two figures add up to its `per_day` value. */
  per_day_split: z.array(CostDayPoint),
  /** Highest spend first: the page `ticket_offset`/`ticket_limit` asks for (default the top `COST_TOP_N`). */
  by_ticket: z.array(CostByTicket),
  /** Tickets with a run in the window, all pages together (absent from older servers). */
  by_ticket_total: Count.optional(),
  /** Highest spend first (runs without cost last, newest first): the page `run_offset`/`run_limit` asks for. */
  by_run: z.array(CostByRun),
  /** Runs in the window, all pages together (absent from older servers). */
  by_run_total: Count.optional(),
  by_harness: z.array(CostByHarness),
  by_model: z.array(CostByModel),
  budgets: CostBudgets,
});
export type CostReport = z.infer<typeof CostReport>;
