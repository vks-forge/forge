/**
 * Result type — explicit success/failure value.
 *
 * Why: policy paths such as `transition()` and the id parsers must never throw and fail closed on bad input (code.md rule 6), so they return a value the caller has to inspect.
 *
 * Exports: Result.
 * Depends on: No IO (types only).
 */

/** Either `{ ok: true, value }` or `{ ok: false, error }`. */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
