/**
 * Port: where per-run token hashes are kept.
 *
 * Why: the server must prove a caller holds the token the driver issued for this run,
 *   but the core StorageAdapter has no place for token hashes and this package may not
 *   open databases. The composition root supplies this narrow port (backed by a
 *   `run_tokens(run_id, token_sha256)` table), so the server compares hashes without
 *   knowing how or where they are stored.
 *
 * Exports: RunTokenStore.
 * Depends on: No IO (interface only).
 */

export interface RunTokenStore {
  /** sha256 hex of the token issued for `runId`, or null when none is registered. */
  getTokenHash(runId: string): Promise<string | null>;
}
