/**
 * Run-token hash lookup over the Forge SQLite database.
 *
 * Why: the driver records a hash of each run's token before launching the MCP server,
 *   and the server proves the caller's token against it. This reads that hash from a
 *   `run_tokens` table. If the table does not exist the lookup throws and the authority
 *   treats it as "no token", so the server refuses to start rather than serving
 *   unauthenticated.
 *
 * Exports: createSqliteTokenStore().
 * Depends on: @forge/db (SqlDriver type), @forge/mcp (RunTokenStore type). IO: SQLite read.
 */

import type { SqlDriver } from '@forge/db';
import type { RunTokenStore } from '@forge/mcp';

export function createSqliteTokenStore(driver: SqlDriver): RunTokenStore {
  return {
    async getTokenHash(runId) {
      const row = driver.get<{ token_sha256: string }>(
        'SELECT token_sha256 FROM run_tokens WHERE run_id = ?',
        [runId],
      );
      return row?.token_sha256 ?? null;
    },
  };
}
