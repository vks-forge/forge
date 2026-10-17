/**
 * TraceSink port — where debug trace entries are sent.
 *
 * Why: the engine and the adapters must be able to say "this happened" without knowing
 *   whether anyone is listening or where the lines end up (files today). A port with one
 *   fire-and-forget method keeps IO out of the engine, lets tracing be off at zero cost
 *   (the no-op sink), and guarantees a slow or broken trace can never stall a tick: `emit`
 *   returns nothing and never throws (d-0163).
 *
 * Exports: TraceSink.
 * Depends on: schemas/trace. Types only.
 */

import type { TraceInput } from '#/schemas/trace.js';

export interface TraceSink {
  /** Records one entry. Synchronous for the caller, never throws, never blocks on IO. */
  emit(entry: TraceInput): void;
}
