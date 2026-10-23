/**
 * Input of `computeCostReport` and the running totals it keeps per ticket and harness.
 *
 * Why: the cost report is computed from the runs of a window plus a few lookups the server
 *   reads (ticket titles, the budgets settings hold). Naming the bundle keeps the pure
 *   function independent of storage and lets tests build it by hand.
 *
 * Exports: CostReportInput, CostPageWindow, CostBucket.
 * Depends on: schemas/cost-report, schemas/director-spend, schemas/run, schemas/stats-range. Types only.
 */

import type { CostBudgets, TokenTotals } from '#/schemas/cost-report.js';
import type { DirectorSpend } from '#/schemas/director-spend.js';
import type { Run } from '#/schemas/run.js';
import type { StatsRange } from '#/schemas/stats-range.js';

export interface CostReportInput {
  readonly project: string;
  readonly range: StatsRange;
  readonly nowMs: number;
  /** Runs of the project started inside the window. */
  readonly runs: readonly Run[];
  /** Director spend rows of the project dated inside the window (rows outside it are ignored). */
  readonly directorSpend: readonly DirectorSpend[];
  /** Ticket titles by id, for the per-ticket rows. */
  readonly titles: ReadonlyMap<string, string>;
  readonly budgets: Omit<CostBudgets, 'period_usd'>;
  /** Which rows of the ranked ticket and run tables to return; default the first `COST_TOP_N` of each. */
  readonly page?: {
    readonly ticket: CostPageWindow;
    readonly run: CostPageWindow;
  };
}

/** A page of a ranked table. */
export interface CostPageWindow {
  readonly limit: number;
  readonly offset: number;
}

/** Running totals of one ticket or harness. */
export interface CostBucket {
  cost_usd: number;
  runs: number;
  tokens: TokenTotals;
}
