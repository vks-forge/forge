/**
 * Stable JSON — a serialisation that does not depend on object key order.
 *
 * Why: two plan versions are compared field by field to show the owner what a revision
 *   changed, and the same value must compare equal however its keys were built (a model's
 *   answer, a zod parse and a database round trip each order keys differently). Sorting keys
 *   at every level gives one string per value, so the diff reports real changes only.
 *
 * Exports: stableJson().
 * Depends on: none. No IO.
 */

/** JSON text of `value` with object keys sorted at every depth; `undefined` members are omitted. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return v;
    }

    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  });
}
