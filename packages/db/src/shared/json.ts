/**
 * JSON column helpers: encode domain values to TEXT and decode them back.
 *
 * Why: payload-like fields (`usage`, `payload`, `answer`, `blocked_by`) are free-form
 *   structures stored as TEXT, and the encoding must be identical in every repository or
 *   a row written by one cannot be read by another. Decoding deliberately returns
 *   untyped data: callers re-validate with the core zod schemas, because a column
 *   written by an older version or edited by hand must not be trusted as typed.
 *   `dropNulls` exists because SQL returns NULL where the schemas expect an absent
 *   optional field.
 *
 * Exports: toJson(), fromJson(), dropNulls().
 * Depends on: nothing. No IO.
 */

/** Encode any JSON-able value; `undefined` becomes the string `null`. */
export function toJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

/** Decode a JSON TEXT column; a null column stays null. */
export function fromJson(text: unknown): unknown {
  return typeof text === 'string' ? (JSON.parse(text) as unknown) : null;
}

/** Remove null-valued keys so optional zod fields (absent, not null) parse. */
export function dropNulls(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
}
