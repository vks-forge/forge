/**
 * Trace helper: one-line emit onto the engine's optional debug sink.
 *
 * Why: the engine reports decisions (a dispatch pick, a rejected step, every run event) to the
 *   debug trace log (d-0163), but the sink is optional so the engine runs unchanged without it.
 *   Funnelling every emit through one function means no call site repeats the "is there a
 *   sink" check and a sink that throws can never break a tick.
 *
 * Exports: emitTrace().
 * Depends on: @forge/core (TraceInput, NOOP_TRACE), types/engine. No IO.
 */

import { NOOP_TRACE } from '@forge/core';
import type { TraceInput } from '@forge/core';
import type { EngineDeps } from '#/types/engine.types.js';

/** Sends `entry` to the engine's trace sink; a missing sink drops it and a failing sink is ignored. */
export function emitTrace(deps: Pick<EngineDeps, 'trace'>, entry: TraceInput): void {
  try {
    (deps.trace ?? NOOP_TRACE).emit(entry);
  } catch {
    // Tracing must never break a tick.
  }
}
