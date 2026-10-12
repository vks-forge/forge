/**
 * Canonical JSON — a byte-stable serialisation for signing and hashing.
 *
 * Why: the tool catalogue signature and every receipt hash are computed over structured
 *   data, and two processes (the signer, the verifier in another run) must derive the same
 *   bytes from the same logical value. Plain `JSON.stringify` depends on key insertion
 *   order, so a harmless reorder of a yaml file or a row would invalidate a signature, or
 *   worse, let two different values share one. Sorting keys and rejecting values JSON
 *   cannot represent closes both gaps (tool-system.md §10).
 *
 * Exports: canonicalJson().
 * Depends on: No IO.
 */

/** Serialises `value` with object keys sorted; `undefined` object members are dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonicalJson: non-finite number');
  }
  return value;
}
