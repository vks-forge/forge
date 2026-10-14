/**
 * Digest of tool arguments and results for receipts.
 *
 * Why: the receipt chain proves what was called and what came back without keeping the
 *   content (which may hold secrets or be huge). Both sides of the proof, the Pre and the
 *   Post receipt, must hash identically, so the canonical-JSON-then-SHA-256 step lives in
 *   one place.
 *
 * Exports: argsHash(), resultHash().
 * Depends on: @forge/tools (canonicalJson, sha256Hex). No IO.
 */

import { canonicalJson, sha256Hex, TruncatedOutput } from '@forge/tools';

/** Digest of canonical JSON, used for `args_hash` and `result_hash`. */
export function argsHash(value: unknown): string {
  return sha256Hex(canonicalJson(value ?? null));
}

/**
 * Digest recorded as an effect's `result_hash`. An output the hook truncated arrives as a
 * `TruncatedOutput` carrying the hash of the full serialization, which is used as is, so
 * the receipt binds the whole output and not the stub.
 */
export function resultHash(value: unknown): string {
  const truncated = TruncatedOutput.safeParse(value);

  return truncated.success ? truncated.data.sha256 : argsHash(value);
}
