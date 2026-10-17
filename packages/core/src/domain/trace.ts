/**
 * The trace sink that does nothing.
 *
 * Why: tracing is off unless the owner turns it on, and off must cost nothing and change no
 *   behaviour. Callers hold a `TraceSink` either way, so there is no `if (trace)` at every
 *   call site; the composition passes this value when `FORGE_TRACE` is unset (d-0163).
 *
 * Exports: NOOP_TRACE.
 * Depends on: types/ports/trace. No IO.
 */

import type { TraceSink } from '#/types/ports/trace.types.js';

export const NOOP_TRACE: TraceSink = Object.freeze({
  emit: (): void => undefined,
});
