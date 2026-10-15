/**
 * Input of `computeCostReport` and the running totals it keeps per ticket and harness.
 *
 * Why: the cost report is computed from the runs of a window plus a few lookups the server
 *   reads (ticket titles, the budgets settings hold). Naming the bundle keeps the pure
 *   function independent of storage and lets tests build it by hand.
 *
 * Exports: CostReportInput, CostBucket.
 * Depends on: schemas/cost-report, schemas/run, schemas/stats-range. Types only.
 */

import type { CostBudgets, TokenTotals } from '#/schemas/cost-report.js';
import type { Run } from '#/schemas/run.js';
import type { StatsRange } from '#/schemas/stats-range.js';

export interface CostReportInput {
  readonly project: string;
  readonly range: StatsRange;
  readonly nowMs: number;
  /** Runs of the project started inside the window. */
  readonly runs: readonly Run[];
  /** Ticket titles by id, for the per-ticket rows. */
  readonly titles: ReadonlyMap<string, string>;
  readonly budgets: Omit<CostBudgets, 'period_usd'>;
}

/** Running totals of one ticket or harness. */
export interface CostBucket {
  cost_usd: number;
  runs: number;
  tokens: TokenTotals;
}
