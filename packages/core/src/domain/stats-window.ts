/**
 * Stats window helpers — UTC day buckets, dense series and percentiles.
 *
 * Why: Home and Cost both draw one point per UTC day for the last N days. If each report
 *   cut its window or bucketed days on its own, the throughput graph and the spend graph of
 *   the same project would disagree about which day a run belongs to, and a day with no
 *   activity would be missing instead of zero. One set of helpers defines the window (N whole
 *   UTC days ending today), the day of a timestamp, a zero-filled series and the percentile
 *   rule, so every figure is computed the same way and tests can pin it once.
 *
 * Exports: statsWindow(), dayOf(), denseSeries(), bump(), percentile(), durationStats(), rateStat().
 * Depends on: schemas/stats-range, schemas/project-stats. No IO.
 */

import type { DurationStats, RateStat } from '#/schemas/project-stats.js';
import { STATS_RANGE_DAYS } from '#/schemas/stats-range.js';
import type { SeriesPoint, StatsRange, StatsWindow } from '#/schemas/stats-range.js';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` (UTC) of a timestamp. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** The window of `range` ending at `nowMs`, plus its UTC days oldest first. */
export function statsWindow(
  range: StatsRange,
  nowMs: number,
): StatsWindow & { readonly days: readonly string[] } {
  const count = STATS_RANGE_DAYS[range];
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const fromMs = todayStart - (count - 1) * DAY_MS;
  const days = Array.from({ length: count }, (_, i) =>
    new Date(fromMs + i * DAY_MS).toISOString().slice(0, 10),
  );

  return {
    range,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    days,
  };
}

/** One point per day, 0 where `byDay` has nothing; values outside `days` are ignored. */
export function denseSeries(
  days: readonly string[],
  byDay: ReadonlyMap<string, number>,
): SeriesPoint[] {
  return days.map((date) => ({ date, value: byDay.get(date) ?? 0 }));
}

/** Adds `amount` to `key` of a day map. */
export function bump(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Nearest-rank percentile (`p` in 0..1) of ascending `sorted`; null when empty. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const rank = Math.max(1, Math.ceil(p * sorted.length));

  return sorted[rank - 1] ?? null;
}

/** Median and p90 of `samples` (any order). */
export function durationStats(samples: readonly number[]): DurationStats {
  const sorted = [...samples].sort((a, b) => a - b);

  return {
    count: sorted.length,
    median_ms: percentile(sorted, 0.5),
    p90_ms: percentile(sorted, 0.9),
  };
}

export function rateStat(hits: number, total: number): RateStat {
  return { hits, total, rate: total === 0 ? null : hits / total };
}
