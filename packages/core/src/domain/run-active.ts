/**
 * isRunActive — the one rule for "may this run still act?".
 *
 * Why: two separate processes decide whether a run may keep going from its row: the hook
 *   handler (may it still get tool receipts?) and the Forge MCP server (may it still write
 *   comments, questions and `finish`?). If each kept its own test, a settled run could
 *   still be granted receipts or state writes, or a run that is still booting could be
 *   locked out of its own MCP server. A run is active while it is `starting` or `running`
 *   and has no `ended_at`; every other status, and any run with an end time, is not.
 *   An `interrupted` run is waiting for the next start, not acting, so it gets no
 *   receipts until its resume makes it `running` again; an ended run is never reopened
 *   (a retry is a new run row) (execution-plane.md §8, d-0092).
 *
 * Exports: isRunActive().
 * Depends on: schemas/run. No IO.
 */

import type { Run } from '#/schemas/run.js';

/** True for a `starting` or `running` run that has not ended. */
export function isRunActive(run: Pick<Run, 'status' | 'ended_at'>): boolean {
  return (
    (run.status === 'starting' || run.status === 'running') && run.ended_at === undefined
  );
}
