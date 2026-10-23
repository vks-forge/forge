/**
 * Harness row helpers: what a saved row keeps of its last check, and what its newest run says.
 *
 * Why: the Settings page read "Not tested yet" next to a harness that had run 52 Worker runs,
 *   because every save rebuilt the row and dropped the last test result, and only the Test button
 *   ever filled it again. A save that changes nothing about how the harness runs must keep that
 *   result, and every row also reports what its newest ended run did, so "it worked" does not
 *   depend on a button the owner may never press.
 *
 * Exports: testFieldsOf(), recentEndedRuns(), lastRunOf().
 * Depends on: @forge/core (Harness, Run), types/routes. IO: reads recent runs from storage.
 */

import type { Harness, Run } from '@forge/core';
import type { RouteDeps } from '#/types/routes.types.js';

/** How many recent runs `last_run` looks through; a harness unused for longer shows none. */
const RECENT_RUNS = 200;

const LIVE_RUN: readonly Run['status'][] = ['starting', 'running', 'settling'];

/**
 * What a rebuilt row keeps of the last check: its status, version and time. A paused harness
 * stays paused through an edit (only a passing check lifts it). `keep: false` is a changed
 * binary or sign-in, which the old result no longer describes.
 */
export const testFieldsOf = (row: Harness | null, keep = true) => {
  if (row === null || (!keep && row.status !== 'paused')) {
    return { status: 'unknown' as const };
  }

  return {
    status: row.status,
    ...(row.status_note === undefined ? {} : { status_note: row.status_note }),
    ...(row.version === undefined || !keep ? {} : { version: row.version }),
    ...(row.last_checked_at === undefined || !keep
      ? {}
      : { last_checked_at: row.last_checked_at }),
  };
};

/** Runs newest first that are over (a run still going says nothing yet about the harness). */
export async function recentEndedRuns(deps: RouteDeps): Promise<Run[]> {
  const runs = await deps.storage.transaction((tx) =>
    tx.runs.list({ limit: RECENT_RUNS }),
  );

  return runs.filter((r) => !LIVE_RUN.includes(r.status));
}

/** What the newest ended Worker run on `row` says; the live-test button is a separate thing. */
export function lastRunOf(row: Harness, runs: readonly Run[]) {
  const run = runs.find((r) => r.harness === row.id || r.harness === row.kind);

  return run
    ? {
        last_run: {
          at: run.ended_at ?? run.started_at,
          status: run.status,
          version: run.driver_version,
        },
      }
    : {};
}
