/**
 * JSON column helpers: encode domain values to TEXT and decode them back.
 *
 * Why: payload-like fields (`usage`, `payload`, `answer`, `blocked_by`) are stored as
 *   JSON text in both adapters' row shape; one pair of functions keeps the encoding
 *   identical (code.md rule 5). Decoded values are still parsed by zod afterwards.
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
