/**
 * Project stats schema — what the Home screen draws for one project (d-0104).
 *
 * Why: Home answers "how is this project going?" with counts and graphs, not a list of
 *   things to do (that is the Inbox, d-0116). Every number here is computed from rows Forge
 *   already keeps (tickets, runs, gate results); nothing is estimated. A figure that cannot
 *   be computed (no ticket finished in the window, no gate ran) is `null`, never zero, so the
 *   UI shows "no data" instead of a flattering or alarming 0. Money appears only as far as
 *   runs recorded a `cost_usd`; `cost_coverage` says how many runs did, so a chart of spend
 *   is never read as complete when it is not.
 *
 * Exports: TicketStateCounts, DurationStats, RateStat, CostCoverage, ProjectStats.
 * Depends on: schemas/stats-range, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { SeriesPoint, StatsWindow } from '#/schemas/stats-range.js';
import { TicketStatus } from '#/schemas/ticket.js';

/** Count per ticket status; every status is present, zero included. */
export const TicketStateCounts = z.record(TicketStatus, z.number().int().nonnegative());
export type TicketStateCounts = z.infer<typeof TicketStateCounts>;

/** Median and 90th percentile in milliseconds; null when there were no samples. */
export const DurationStats = z.object({
  count: z.number().int().nonnegative(),
  median_ms: z.number().nonnegative().nullable(),
  p90_ms: z.number().nonnegative().nullable(),
});
export type DurationStats = z.infer<typeof DurationStats>;

/** `hits` of `total`; `rate` (0..1) is null when `total` is 0. */
export const RateStat = z.object({
  hits: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1).nullable(),
});
export type RateStat = z.infer<typeof RateStat>;

/** How many of the window's runs recorded a cost. */
export const CostCoverage = z.object({
  runs_total: z.number().int().nonnegative(),
  runs_with_cost: z.number().int().nonnegative(),
});
export type CostCoverage = z.infer<typeof CostCoverage>;

/** `GET /projects/:slug/stats`. */
export const ProjectStats = StatsWindow.extend({
  project: z.string().min(1),
  /** Tickets now, by status (not limited to the window). */
  tickets_by_state: TicketStateCounts,
  /** Tickets that reached `done` per day; the day is when the ticket last changed (done is terminal). */
  throughput: z.array(SeriesPoint),
  /** Created-to-done time of tickets done in the window. */
  lead_time: DurationStats,
  /** Of tickets created in the window, how many were sent back for rework at least once. */
  rework_rate: RateStat,
  /** Of the window's G1 verdicts that passed or failed (skipped ones do not count), how many passed. */
  gate_pass_rate: RateStat,
  runs_per_day: z.array(SeriesPoint),
  /** Workers running right now (runs `starting` or `running`). */
  active_workers: z.number().int().nonnegative(),
  /** USD per day from runs that recorded a cost, by run start day. */
  spend_per_day: z.array(SeriesPoint),
  cost_coverage: CostCoverage,
});
export type ProjectStats = z.infer<typeof ProjectStats>;
