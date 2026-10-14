/**
 * SQLite GithubConnectionRepository for the `github_connections` table.
 *
 * Why: a company reaches its repositories through one GitHub App per org or account
 *   (d-0094). Projects name a connection and the GitHub host resolves the App id and the
 *   key's secret name from this row. The row never holds key bytes: only `key_secret_name`,
 *   which points into the SecretStore, so a database snapshot or an API listing cannot leak
 *   a private key. Rows are re-parsed with the core schema on read so a drifted row cannot
 *   reach the host builder.
 *
 * Exports: createGithubConnectionRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { GithubConnection } from '@forge/core';
import type { GithubConnectionRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

function toConnection(row: SqlRow): GithubConnection {
  return parseStored(GithubConnection, dropNulls(row), 'github connection');
}

export function createGithubConnectionRepository(
  driver: SqlDriver,
): GithubConnectionRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM github_connections WHERE id = ?', [id]);

      return row ? toConnection(row) : null;
    },

    async upsert(connection) {
      const c = GithubConnection.parse(connection);
      driver.run(
        `INSERT INTO github_connections (id, account, app_id, app_slug, key_secret_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET account = excluded.account, app_id = excluded.app_id,
           app_slug = excluded.app_slug, key_secret_name = excluded.key_secret_name,
           status = excluded.status`,
        [
          c.id,
          c.account,
          c.app_id,
          c.app_slug ?? null,
          c.key_secret_name,
          c.status,
          c.created_at,
        ],
      );
    },

    async list() {
      return driver
        .all('SELECT * FROM github_connections ORDER BY rowid')
        .map(toConnection);
    },
  };
}
