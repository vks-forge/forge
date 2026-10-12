/**
 * Hashing and constant-time comparison helpers for the hook handler.
 *
 * Why: the bearer token is the only thing standing between a Worker and another run's
 *   receipt chain, so it is compared in constant time (a plain `===` leaks how many
 *   leading bytes matched), and tool arguments and results are stored as digests so the
 *   chain proves what was called without keeping the content.
 *
 * Exports: sha256Hex(), tokensEqual(), argsHash().
 * Depends on: node:crypto, @forge/tools (canonicalJson). No IO.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '@forge/tools';

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Digest of canonical JSON, used for `args_hash` and `result_hash`. */
export function argsHash(value: unknown): string {
  return sha256Hex(canonicalJson(value ?? null));
}

/** Constant-time string equality: both sides are digested first so lengths never leak. */
export function tokensEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}
