/**
 * An empty tick report: the record a tick fills in, and the one an owner's act uses when it
 * borrows the tick's machinery.
 *
 * Why: the tick hands back a `TickReport` of everything it did. Code shared with owner actions
 *   (the merge door, which an approval reaches outside a tick) takes the same context and so
 *   needs a report to write into; one constructor keeps the shape in one place.
 *
 * Exports: emptyReport().
 * Depends on: types/engine. No IO.
 */

import type { TickReport } from '#/types/engine.types.js';

/** A report with every list empty, stamped `nowIso`. */
export function emptyReport(nowIso: string, firstTick: boolean): TickReport {
  return {
    at: nowIso,
    firstTick,
    crashed: [],
    resumed: [],
    resumeFailed: [],
    settled: [],
    triaged: [],
    dispatched: [],
    steered: [],
    verified: [],
    parked: [],
    violations: [],
    rejectedSteps: [],
    errors: [],
  };
}
