/**
 * bucketize — cuts a time window into UTC day, week or month buckets.
 *
 * Why: the Overview draws spend and activity per day, week or month across every project.
 *   If the server and the charts disagreed about where a week starts, or two timestamps of
 *   one UTC day landed in different buckets, money would be dropped or counted twice. One
 *   pure rule fixes it: buckets are named by their UTC start date, weeks start on Monday,
 *   months on the 1st, the list is contiguous and covers the whole window, so a bucket with
 *   no activity is a zero, never a gap. The browser only formats the labels locally.
 *
 * Exports: bucketKeyOf(), bucketize().
 * Depends on: schemas/stats-range (type). No IO.
 */

import type { StatsGroup } from '#/schemas/stats-range.js';

const DAY_MS = 86_400_000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `YYYY-MM-DD` start (UTC) of the bucket holding the timestamp. */
export function bucketKeyOf(iso: string, group: StatsGroup): string {
  const ms = Date.parse(iso);

  if (group === 'day') {
    return isoDay(ms);
  }

  if (group === 'month') {
    return `${iso.slice(0, 7)}-01`;
  }

  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
  // 1970-01-01 was a Thursday, so (days + 3) mod 7 counts days since Monday.
  const sinceMonday = (Math.floor(ms / DAY_MS) + 3) % 7;

  return isoDay(dayStart - sinceMonday * DAY_MS);
}

function nextKey(key: string, group: StatsGroup): string {
  const ms = Date.parse(`${key}T00:00:00Z`);

  if (group === 'day') {
    return isoDay(ms + DAY_MS);
  }

  if (group === 'week') {
    return isoDay(ms + 7 * DAY_MS);
  }

  const d = new Date(ms);

  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Bucket start dates, oldest first, from the bucket of `from` to the bucket of `to`. */
export function bucketize(
  window: { readonly from: string; readonly to: string },
  group: StatsGroup,
): string[] {
  const last = bucketKeyOf(window.to, group);
  const keys: string[] = [];

  for (
    let key = bucketKeyOf(window.from, group);
    key <= last;
    key = nextKey(key, group)
  ) {
    keys.push(key);
  }

  return keys;
}
