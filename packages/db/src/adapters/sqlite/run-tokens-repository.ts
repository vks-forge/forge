/**
 * SQLite RunTokenRepository: SHA-256 hashes of per-run bearer tokens, revocable.
 *
 * Why: the Forge MCP server (a separate process per run) and the hook handler both have
 *   to prove a caller holds the token the driver issued for one run, and they only have
 *   the database in common. Only the hash is stored, so reading the file yields nothing
 *   usable; the per-run HMAC secret that signs receipts is not stored at all and lives in
 *   the Forge server's memory. Revoking sets `revoked_at` and the hash stops being
 *   returned, so a finished or compromised run's token dies without deleting the audit
 *   trail. Re-issuing for a resumed run replaces the hash and clears the revocation.
 *
 * Exports: createRunTokenRepository().
 * Depends on: @forge/core, shared/run-token, types/storage-driver.types.
 */

import type { RunTokenRepository } from '@forge/core';
import { parseTokenRecord } from '#/shared/run-token.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createRunTokenRepository(driver: SqlDriver): RunTokenRepository {
  return {
    async put(runId, tokenSha256, issuedAt) {
      const t = parseTokenRecord(runId, tokenSha256);
      driver.run(
        `INSERT INTO run_tokens (run_id, token_sha256, issued_at, revoked_at)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT (run_id) DO UPDATE SET
           token_sha256 = excluded.token_sha256,
           issued_at = excluded.issued_at,
           revoked_at = NULL`,
        [t.runId, t.tokenSha256, issuedAt],
      );
    },

    async getHash(runId) {
      const row = driver.get<{ token_sha256: string }>(
        'SELECT token_sha256 FROM run_tokens WHERE run_id = ? AND revoked_at IS NULL',
        [runId],
      );
      return row?.token_sha256 ?? null;
    },

    async revoke(runId, at) {
      driver.run(
        'UPDATE run_tokens SET revoked_at = ? WHERE run_id = ? AND revoked_at IS NULL',
        [at, runId],
      );
    },
  };
}
