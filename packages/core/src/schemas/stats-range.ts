/**
 * Range and time-series shapes shared by the Home stats and the Cost screen.
 *
 * Why: Home graphs and the Cost page both ask "the last 7, 30 or 90 days" and both draw
 *   one value per calendar day. One definition of the range words, of how many days each
 *   covers and of a `{date, value}` point means the two screens (and the server routes that
 *   feed them) cannot disagree about where a window starts or what a day is: a day is a UTC
 *   calendar day, and a day with nothing in it is a zero point, never a gap, so a chart
 *   never has to guess.
 *
 * Exports: StatsRange, STATS_RANGE_DAYS, StatsRangeQuery, SeriesPoint, StatsWindow.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const StatsRange = z.enum(['7d', '30d', '90d']);
export type StatsRange = z.infer<typeof StatsRange>;

/** Days each range covers, today included. */
export const STATS_RANGE_DAYS: Readonly<Record<StatsRange, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** `?range=` of the stats and cost endpoints; absent means 30 days. */
export const StatsRangeQuery = z.object({ range: StatsRange.default('30d') });
export type StatsRangeQuery = z.infer<typeof StatsRangeQuery>;

/** One day of a series: `date` is a UTC `YYYY-MM-DD`. */
export const SeriesPoint = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number(),
});
export type SeriesPoint = z.infer<typeof SeriesPoint>;

/** The window a response covers: `from` is the start of its first UTC day, `to` is when it was computed. */
export const StatsWindow = z.object({
  range: StatsRange,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type StatsWindow = z.infer<typeof StatsWindow>;
