/**
 * Validation shared by both storage adapters for run-token writes.
 *
 * Why: the token table must only ever hold a SHA-256 digest. If an adapter accepted any
 *   string, a caller bug (storing the raw token) would put a usable credential into a
 *   file a Worker may be able to read. Both adapters run the same check, so the SQLite
 *   and in-memory stores reject the same inputs.
 *
 * Exports: parseTokenRecord().
 * Depends on: @forge/core (Sha256Hex, InvalidInputError). No IO.
 */

import { InvalidInputError, Sha256Hex } from '@forge/core';

/** Validates the arguments of `RunTokenRepository.put`; throws InvalidInputError on an empty id or a non-digest. */
export function parseTokenRecord(
  runId: string,
  tokenSha256: string,
): { runId: string; tokenSha256: string } {
  if (runId.length === 0) {
    throw new InvalidInputError('run id must not be empty');
  }

  const digest = Sha256Hex.safeParse(tokenSha256);
  // Never echo the value: if a raw token was passed by mistake it must not reach logs.
  if (!digest.success) {
    throw new InvalidInputError('run token must be a sha256 hex digest');
  }

  return { runId, tokenSha256: digest.data };
}
