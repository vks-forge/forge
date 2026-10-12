/**
 * Result constructors — `ok()` and `err()`.
 *
 * Why: the policy paths (ticket transitions, id and branch parsing) must fail closed and
 *   never throw into the Director tick, because an exception in the scheduler loop could
 *   stall every ticket. Returning a value the caller must inspect makes rejection an
 *   ordinary handled outcome: the error travels back to whoever issued the event (API,
 *   gate, engine) and the ticket stays unchanged.
 *
 * Exports: ok(), err().
 * Depends on: types/result. No IO.
 */

import type { Result } from '#/types/result.types.js';

/** Wraps a success value. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
/** Wraps a failure value. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
