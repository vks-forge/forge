/**
 * Overview stats schema — what the cross-project Overview dashboard draws at `/`.
 *
 * Why: an owner running several projects needs one place that says how all the work is going,
 *   what waits on them and what it all costs. Project Home answers that for one project; this
 *   is the same facts summed across projects and cut into day, week or month buckets. Every
 *   number comes from rows Forge already keeps. Money is only what runs recorded: spend never
 *   includes a guess, and `cost_coverage` says how many runs and Director steps carried a cost so
 *   a total is never read as complete when it is not. Spend has two sources, Workers (runs) and
 *   the Director (its dated spend ledger): every spend figure is the sum of both and carries the
 *   split, so the Overview, the Cost page and the card agree on one number. Series are arrays aligned to `buckets` (one value
 *   per bucket, zero where nothing happened) so a chart never has to fill gaps.
 *
 * Exports: OverviewKpis, OverviewProjectSeries, OverviewSpendSlice, OverviewProjectSpendSlice,
 *   OverviewSourceSeries, OverviewCostCoverage, OverviewProjectRow,
 *   OverviewAttention, OverviewStats, OverviewQuery.
 * Depends on: schemas/director-spend, schemas/inbox, schemas/project, schemas/project-stats, schemas/stats-range, zod. No IO.
 */

import { z } from 'zod';
import { SpendSource } from '#/schemas/director-spend.js';
import { InboxKind } from '#/schemas/inbox.js';
import { ProjectStatus } from '#/schemas/project.js';
import { CostCoverage, RateStat } from '#/schemas/project-stats.js';
import { StatsGroup, StatsRange } from '#/schemas/stats-range.js';

const Usd = z.number().nonnegative();
const Count = z.number().int().nonnegative();
const PerBucket = z.array(z.number().nonnegative());

/** The headline figures. `spend_prev_usd` is null for `all` (nothing comes before it). */
export const OverviewKpis = z.object({
  /** Workers plus Director in the window: `spend_worker_usd + spend_director_usd`. */
  spend_usd: Usd,
  spend_worker_usd: Usd,
  spend_director_usd: Usd,
  spend_prev_usd: Usd.nullable(),
  spend_this_month_usd: Usd,
  tickets_done: Count,
  tickets_in_progress: Count,
  waiting_on_you: Count,
  workers_running: Count,
  active_projects: Count,
  g1_pass_rate: RateStat,
});
export type OverviewKpis = z.infer<typeof OverviewKpis>;

/** One project's spend per bucket, for the stacked chart: `values` is the total, `director_values` its Director part. */
export const OverviewProjectSeries = z.object({
  project: z.string().min(1),
  values: PerBucket,
  director_values: PerBucket,
});
export type OverviewProjectSeries = z.infer<typeof OverviewProjectSeries>;

/** One slice of a Worker spend breakdown (by harness or lane; the Director has neither). */
export const OverviewSpendSlice = z.object({ key: z.string().min(1), usd: Usd });
export type OverviewSpendSlice = z.infer<typeof OverviewSpendSlice>;

/** One project's slice of the whole: `usd` is Workers plus Director, split in the two fields after it. */
export const OverviewProjectSpendSlice = OverviewSpendSlice.extend({
  worker_usd: Usd,
  director_usd: Usd,
});
export type OverviewProjectSpendSlice = z.infer<typeof OverviewProjectSpendSlice>;

/** Spend per bucket for one source, across the included projects. */
export const OverviewSourceSeries = z.object({
  source: SpendSource,
  values: PerBucket,
});
export type OverviewSourceSeries = z.infer<typeof OverviewSourceSeries>;

/** How much of the spend carries a price: runs and Director steps in the window, and those that reported one. */
export const OverviewCostCoverage = CostCoverage.extend({
  director_steps: Count,
  director_steps_recorded: Count,
});
export type OverviewCostCoverage = z.infer<typeof OverviewCostCoverage>;

/** One row of the projects table. `spark` is runs started per bucket. */
export const OverviewProjectRow = z.object({
  slug: z.string().min(1),
  status: ProjectStatus,
  open_cards: Count,
  tickets_in_progress: Count,
  waiting_on_you: Count,
  /** Workers plus Director. */
  spend_usd: Usd,
  director_usd: Usd,
  last_activity: z.iso.datetime().nullable(),
  spark: PerBucket,
});
export type OverviewProjectRow = z.infer<typeof OverviewProjectRow>;

/** A needs-action inbox item with its project, for the Needs attention list. */
export const OverviewAttention = z.object({
  id: z.string().min(1),
  kind: InboxKind,
  project: z.string().min(1),
  title: z.string().min(1),
  ticket_id: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  updated_at: z.iso.datetime(),
});
export type OverviewAttention = z.infer<typeof OverviewAttention>;

/** `GET /stats/overview`. */
export const OverviewStats = z.object({
  range: StatsRange,
  group: StatsGroup,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** Start of each bucket, oldest first: a UTC date, or for `today` the ISO instant the hour starts; every series below has one value per entry. */
  buckets: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/)),
  /** Slugs the figures cover. */
  projects_included: z.array(z.string()),
  /** Requested slugs that are not registered projects; ignored. */
  unknown: z.array(z.string()),
  kpis: OverviewKpis,
  spend_by_project: z.array(OverviewProjectSeries),
  /** Spend over time split by source: one series for Workers, one for the Director. */
  spend_by_source: z.array(OverviewSourceSeries),
  tickets_done: PerBucket,
  /** Tickets created in the bucket. */
  tickets_started: PerBucket,
  runs_passed: PerBucket,
  /** Refused, out of turns, timed out or errored. */
  runs_failed: PerBucket,
  /** Interrupted or cancelled; runs still in flight are not counted yet. */
  runs_interrupted: PerBucket,
  spend_by_project_total: z.array(OverviewProjectSpendSlice),
  spend_by_harness: z.array(OverviewSpendSlice),
  spend_by_lane: z.array(OverviewSpendSlice),
  projects: z.array(OverviewProjectRow),
  attention: z.array(OverviewAttention),
  cost_coverage: OverviewCostCoverage,
});
export type OverviewStats = z.infer<typeof OverviewStats>;

/**
 * `GET /stats/overview` query as the URL carries it (strings in). `projects` is a comma list,
 * `archived` is `0` or `1`; `group` absent means the range's default grouping.
 */
export const OverviewQuery = z
  .object({
    range: StatsRange.default('30d'),
    group: StatsGroup.optional(),
    projects: z
      .string()
      .optional()
      .transform((list) => [
        ...new Set(
          (list ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
        ),
      ]),
    archived: z
      .enum(['0', '1'])
      .default('0')
      .transform((flag) => flag === '1'),
  })
  .refine(
    (q) => q.group === undefined || (q.range === 'today') === (q.group === 'hour'),
    {
      message: 'group hour goes with range today, and only with it',
      path: ['group'],
    },
  );
export type OverviewQuery = z.infer<typeof OverviewQuery>;
