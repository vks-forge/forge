/**
 * Digest of tool arguments and results for receipts.
 *
 * Why: the receipt chain proves what was called and what came back without keeping the
 *   content (which may hold secrets or be huge). Both sides of the proof, the Pre and the
 *   Post receipt, must hash identically, so the canonical-JSON-then-SHA-256 step lives in
 *   one place.
 *
 * Exports: argsHash().
 * Depends on: @forge/tools (canonicalJson, sha256Hex). No IO.
 */

import { canonicalJson, sha256Hex } from '@forge/tools';

/** Digest of canonical JSON, used for `args_hash` and `result_hash`. */
export function argsHash(value: unknown): string {
  return sha256Hex(canonicalJson(value ?? null));
}
