/**
 * An empty tick report: the record a tick fills in, and the one an owner's act uses when it
 * borrows the tick's machinery.
 *
 * Why: the tick hands back a `TickReport` of everything it did. Code shared with owner actions
 *   (the merge door, which an approval reaches outside a tick) takes the same context and so
 *   needs a report to write into; one constructor keeps the shape in one place. A Director job
 *   fills a report of its own that outlives the tick that started it, and the next tick absorbs it.
 *
 * Exports: emptyReport(), absorbReport().
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

/** Adds the lists of `from` to `into`, so what a job reported after its tick returned is not lost. */
export function absorbReport(into: TickReport, from: TickReport): void {
  into.crashed.push(...from.crashed);
  into.resumed.push(...from.resumed);
  into.resumeFailed.push(...from.resumeFailed);
  into.settled.push(...from.settled);
  into.triaged.push(...from.triaged);
  into.dispatched.push(...from.dispatched);
  into.steered.push(...from.steered);
  into.verified.push(...from.verified);
  into.parked.push(...from.parked);
  into.violations.push(...from.violations);
  into.rejectedSteps.push(...from.rejectedSteps);
  into.errors.push(...from.errors);
}
