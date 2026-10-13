/**
 * NewRunEvent: a run event before storage has numbered it.
 *
 * Why: a run's events come from several writers at once (the driver streaming harness
 *   output, the Forge MCP server recording comments, questions and `finish`). If each
 *   writer chose its own `seq`, two of them would pick the same number and one event
 *   would be lost to a primary-key error, or the log would have gaps the control room
 *   cannot tell from missing data. Writers therefore submit events without `seq` and
 *   storage assigns the next number inside the transaction, so there is exactly one
 *   allocator (director-core.md §3).
 *
 * Exports: NewRunEvent.
 * Depends on: schemas/run. Types only.
 */

import type { RunEvent } from '#/schemas/run.js';

// Omit<> on a union collapses it to the common keys, so distribute over the variants.
type WithoutSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;

/** Any `RunEvent` variant minus the storage-assigned `seq`. */
export type NewRunEvent = WithoutSeq<RunEvent>;
