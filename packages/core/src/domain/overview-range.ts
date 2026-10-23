/**
 * overviewRunsSince: how far back the Overview must read rows to draw its figures.
 *
 * Why: the Overview compares the chosen range with the period before it and shows this month's
 *   spend whatever the range, so the server has to load runs and Director spend rows from the
 *   earlier of those two starts. One pure rule, shared by the route and the tests, keeps the read
 *   window and the arithmetic in `computeOverviewStats` from drifting apart (a row the sums need
 *   but the read skipped would silently shrink a total).
 *
 * Exports: overviewRunsSince(), monthStartMs().
 * Depends on: domain/stats-window, schemas/stats-range. No IO.
 */

import { statsWindow } from '#/domain/stats-window.js';
import { STATS_RANGE_DAYS } from '#/schemas/stats-range.js';
import type { StatsRange } from '#/schemas/stats-range.js';

const DAY_MS = 86_400_000;

/** UTC start of the month `nowMs` falls in. */
export const monthStartMs = (nowMs: number): number => {
  const d = new Date(nowMs);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/**
 * Earliest run or Director spend row the server must read: the start of the previous period (for
 * the change figure) or of this month, whichever is earlier. `all` reads everything (undefined).
 */
export function overviewRunsSince(
  range: StatsRange,
  nowMs: number,
  utcOffsetMinutes = 0,
): string | undefined {
  if (range === 'all') {
    return undefined;
  }

  const { from } = statsWindow(range, nowMs, undefined, utcOffsetMinutes);
  const prevFromMs = Date.parse(from) - STATS_RANGE_DAYS[range] * DAY_MS;

  return new Date(Math.min(prevFromMs, monthStartMs(nowMs))).toISOString();
}
