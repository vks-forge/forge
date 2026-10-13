/**
 * Canonical JSON — a byte-stable serialisation for signing and hashing.
 *
 * Why: the tool catalogue signature and every receipt hash are computed over structured
 *   data, and two processes (the signer, the verifier in another run) must derive the same
 *   bytes from the same logical value. Plain `JSON.stringify` depends on key insertion
 *   order, so a harmless reorder of a yaml file or a row would invalidate a signature, or
 *   worse, let two different values share one. Sorting keys and rejecting values JSON
 *   cannot represent closes both gaps. The input can be hostile (a catalogue file edited
 *   by a Worker, YAML aliases that expand exponentially), so depth and total size are
 *   capped and a cycle is an error, not a hang or a stack overflow (tool-system.md §10).
 *
 * Exports: canonicalJson(), CANONICAL_MAX_DEPTH, CANONICAL_MAX_NODES.
 * Depends on: No IO.
 */

export const CANONICAL_MAX_DEPTH = 64;
export const CANONICAL_MAX_NODES = 100_000;

/**
 * Serialises `value` with object keys sorted; `undefined` object members are dropped.
 * Throws `RangeError` past {@link CANONICAL_MAX_DEPTH} or {@link CANONICAL_MAX_NODES} and `TypeError` on a
 * non-finite number.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value, 0, { nodes: 0 }));
}

function sortKeys(value: unknown, depth: number, budget: { nodes: number }): unknown {
  if (depth > CANONICAL_MAX_DEPTH) {
    throw new RangeError('canonicalJson: nested too deeply');
  }

  if (++budget.nodes > CANONICAL_MAX_NODES) {
    throw new RangeError('canonicalJson: value too large');
  }

  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : sortKeys(v, depth + 1, budget)));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = sortKeys(v, depth + 1, budget);
      }
    }

    return out;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonicalJson: non-finite number');
  }

  return value;
}
