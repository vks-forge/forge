/**
 * Shapes the run list is filtered and paged by.
 *
 * Why: the Runs screen pages through runs newest first, and the stats and cost reports read
 *   every run in a window. Page `n+1` must start exactly after the last run of page `n` even
 *   while runs start, so storage takes the last row's sort key rather than an offset. Both
 *   storage adapters and the server's cursor share these shapes so they cannot disagree on order.
 *
 * Exports: RunListKey, RunListFilter.
 * Depends on: schemas/run. Types only.
 */

import type { RunStatus } from '#/schemas/run.js';

/** Position in the run list: the last row already shown. */
export interface RunListKey {
  readonly started_at: string;
  readonly id: string;
}

/**
 * What `RunRepository.list` filters and pages by. `project` is the ticket's `project` column
 * (runs are attributed through their ticket); absent means every project. `since` keeps runs
 * started at or after it.
 */
export interface RunListFilter {
  readonly project?: string;
  readonly statuses?: readonly RunStatus[];
  readonly since?: string;
  readonly limit: number;
  readonly after?: RunListKey;
}
