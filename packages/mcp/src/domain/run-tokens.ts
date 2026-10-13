/**
 * Per-run bearer token verification.
 *
 * Why: the Forge MCP server is a door into ticket and run state, started by the driver
 *   for exactly one run. The driver registers a token hash in storage before launch and
 *   the server proves the caller's token against it on startup, so another process (or
 *   a Worker that learns the DB path) cannot speak as that run. Only hashes are stored,
 *   so reading the database never yields a usable token; a revoked token reads as absent
 *   and fails; the comparison is constant-time so the token cannot be guessed byte by
 *   byte; and any storage error is a refusal, never a pass.
 *
 * Exports: hashToken() (re-exported from @forge/tools), verifyRunToken().
 * Depends on: @forge/core (StorageAdapter type), @forge/tools (hashToken, constantTimeEqual).
 *   IO: storage read.
 */

import type { StorageAdapter } from '@forge/core';
import { constantTimeEqual, hashToken } from '@forge/tools';

export { hashToken };

/**
 * True only if `token` hashes to the live (registered, not revoked) hash for `runId`.
 * Unknown runs, revoked tokens, malformed stored hashes and storage errors all return false.
 */
export async function verifyRunToken(
  storage: StorageAdapter,
  runId: string,
  token: string,
): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = await storage.transaction((tx) => tx.runTokens.getHash(runId));
  } catch {
    stored = null;
  }

  // Compare against a dummy when absent so timing does not reveal registration.
  const matches = constantTimeEqual(stored ?? hashToken(' '), hashToken(token));

  return stored !== null && stored !== '' && matches;
}
