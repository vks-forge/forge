/**
 * Result type — explicit success/failure value.
 *
 * Why: callers of policy functions must be forced to look at failure. A success/failure
 *   union makes "the transition was rejected" a typed value the Director, API and gates
 *   handle explicitly instead of an exception that escapes the tick.
 *
 * Exports: Result.
 * Depends on: No IO (types only).
 */

/** Either `{ ok: true, value }` or `{ ok: false, error }`. */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
