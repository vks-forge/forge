/**
 * Cost report schema — where a project's money and tokens went.
 *
 * Why: Workers bill by the token and a project owner wants to know which tickets, runs and
 *   harnesses ate the budget. Forge records a run's `cost_usd` (when the harness reported
 *   one) and its token usage per model, and nothing else: there is no per-model price table
 *   and no spend budget per period. So this report adds up what was recorded, shows tokens
 *   per model (never a made-up dollar figure), says how many runs had a cost
 *   (`runs_with_cost` of `runs_total`) and returns only the budgets that settings really
 *   hold (the per-run and per-step caps), with `null` where none exists.
 *
 * Exports: TokenTotals, CostByTicket, CostByRun, CostByHarness, CostByModel, CostBudgets,
 *   CostReport, COST_TOP_N.
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

/** Cap on `by_ticket` and `by_run`. */
export const COST_TOP_N = 50;

/** `GET /projects/:slug/cost`. */
export const CostReport = StatsWindow.extend({
  project: z.string().min(1),
  total_usd: z.number().nonnegative(),
  runs_total: Count,
  runs_with_cost: Count,
  tokens: TokenTotals,
  per_day: z.array(SeriesPoint),
  /** Highest spend first, at most `COST_TOP_N`. */
  by_ticket: z.array(CostByTicket),
  /** Highest spend first (runs without cost last, newest first), at most `COST_TOP_N`. */
  by_run: z.array(CostByRun),
  by_harness: z.array(CostByHarness),
  by_model: z.array(CostByModel),
  budgets: CostBudgets,
});
export type CostReport = z.infer<typeof CostReport>;
