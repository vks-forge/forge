/**
 * Joins two tick reports for the engine test rig.
 *
 * Why: gate jobs run beside the tick, so a scenario that reads "tick: merged" needs the tick that started the job
 *   and the follow-up tick that applies it. The rig reports both as one so a scenario asserts on what the
 *   pair did.
 *
 * Exports: mergeReports().
 * Depends on: src/types/engine (TickReport). No IO.
 */

import type { TickReport } from '#/types/engine.types.js';

/** Adds the lists of `b` to those of `a`; the tick that applies a gate job reports what the one that started it could not. */
export function mergeReports(a: TickReport, b: TickReport): TickReport {
  return {
    ...a,
    crashed: [...a.crashed, ...b.crashed],
    resumed: [...a.resumed, ...b.resumed],
    resumeFailed: [...a.resumeFailed, ...b.resumeFailed],
    settled: [...a.settled, ...b.settled],
    triaged: [...a.triaged, ...b.triaged],
    dispatched: [...a.dispatched, ...b.dispatched],
    steered: [...a.steered, ...b.steered],
    verified: [...a.verified, ...b.verified],
    parked: [...a.parked, ...b.parked],
    violations: [...a.violations, ...b.violations],
    rejectedSteps: [...a.rejectedSteps, ...b.rejectedSteps],
    errors: [...a.errors, ...b.errors],
  };
}
