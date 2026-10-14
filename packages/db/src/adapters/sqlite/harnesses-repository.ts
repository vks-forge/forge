/**
 * SQLite HarnessRepository for the `harnesses` table.
 *
 * Why: the server reads the harness row at the start of each run to learn which executable
 *   to start and how it authenticates, and the owner edits it from Settings. The registry
 *   is tiny and edited rarely, so it is plain upsert-by-id; `ON CONFLICT DO UPDATE` rather
 *   than replace keeps the row's place in the list. Rows are re-parsed with the core
 *   `Harness` schema on read so a hand-edited auth mode fails closed instead of reaching a
 *   driver.
 *
 * Exports: createHarnessRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { Harness } from '@forge/core';
import type { HarnessRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toHarness = (row: SqlRow): Harness =>
  parseStored(Harness, dropNulls(row), 'harness');

export function createHarnessRepository(driver: SqlDriver): HarnessRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM harnesses WHERE id = ?', [id]);

      return row ? toHarness(row) : null;
    },

    async upsert(harness) {
      const h = Harness.parse(harness);
      driver.run(
        `INSERT INTO harnesses (id, kind, binary_path, version, auth_mode, status, last_checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, binary_path = excluded.binary_path,
           version = excluded.version, auth_mode = excluded.auth_mode, status = excluded.status,
           last_checked_at = excluded.last_checked_at`,
        [
          h.id,
          h.kind,
          h.binary_path ?? null,
          h.version ?? null,
          h.auth_mode,
          h.status,
          h.last_checked_at ?? null,
        ],
      );
    },

    async list() {
      return driver.all('SELECT * FROM harnesses ORDER BY rowid').map(toHarness);
    },
  };
}
