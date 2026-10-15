/**
 * SQLite InboxStateRepository for the `inbox_states` table.
 *
 * Why: the Inbox is derived from live rows, so the only thing it persists is what the owner
 *   did with an item: when they read it, when they archived it and the item's `updated_at` at
 *   those moments, which is what lets a changed item resurface. Rows are re-parsed with the
 *   core schema on read, so a half-written or hand-edited mark cannot hide an item by
 *   accident.
 *
 * Exports: createInboxStateRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { InboxStateRow } from '@forge/core';
import type { InboxStateRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toRow = (row: SqlRow): InboxStateRow =>
  parseStored(InboxStateRow, dropNulls(row), 'inbox state');

export function createInboxStateRepository(driver: SqlDriver): InboxStateRepository {
  return {
    async get(project, kind, itemId) {
      const row = driver.get(
        'SELECT * FROM inbox_states WHERE project = ? AND kind = ? AND item_id = ?',
        [project, kind, itemId],
      );

      return row ? toRow(row) : null;
    },

    async listByProject(project) {
      return driver
        .all('SELECT * FROM inbox_states WHERE project = ? ORDER BY rowid', [project])
        .map(toRow);
    },

    async upsert(row) {
      const s = InboxStateRow.parse(row);
      driver.run(
        `INSERT INTO inbox_states (project, kind, item_id, read_at, read_item_updated_at,
           archived_at, archived_item_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (project, kind, item_id) DO UPDATE SET
           read_at = excluded.read_at, read_item_updated_at = excluded.read_item_updated_at,
           archived_at = excluded.archived_at,
           archived_item_updated_at = excluded.archived_item_updated_at`,
        [
          s.project,
          s.kind,
          s.item_id,
          s.read_at ?? null,
          s.read_item_updated_at ?? null,
          s.archived_at ?? null,
          s.archived_item_updated_at ?? null,
        ],
      );
    },
  };
}
