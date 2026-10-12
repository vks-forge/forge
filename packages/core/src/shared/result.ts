/**
 * Result constructors — `ok()` and `err()`.
 *
 * Why: policy paths such as `transition()` and the id parsers must never throw and fail
 *   closed on bad input (code.md rule 6), so they return a value the caller has to
 *   inspect.
 *
 * Exports: ok(), err().
 * Depends on: types/result. No IO.
 */

import type { Result } from '#/types/result.types.js';

/** Wraps a success value. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
/** Wraps a failure value. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
