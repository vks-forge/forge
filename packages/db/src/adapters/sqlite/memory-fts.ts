/**
 * Writes to the memory full-text index, in the same transaction as the record they describe.
 *
 * Why: search must never show a record that was rolled back or miss one that was written, and the index
 *   holds words from the record's statement, gist, tags, aliases and body. Keeping every write to
 *   `memory_fts` in this one module (called only by the records repository, inside its transaction)
 *   means a rolled-back insert leaves no index entry, and an aids change replaces a record's entry whole.
 *   Status is deliberately not indexed: search filters status and scope in SQL through the record row, so
 *   an approval or a supersede never needs a reindex.
 *
 * Exports: indexRecord(), unindexRecord(), reindexProject().
 * Depends on: adapters/sqlite/memory-rows, types/memory-adapter.types, types/storage-driver.types.
 */

import {
  RECORD_COLUMNS,
  joinAliases,
  toMemoryRow,
} from '#/adapters/sqlite/memory-rows.js';
import type { FtsRecord } from '#/types/memory-adapter.types.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

/** Adds the record's entry; `tags` are the words of its tag rows. */
export function indexRecord(
  driver: SqlDriver,
  row: FtsRecord,
  tags: readonly string[],
): void {
  driver.run(
    `INSERT INTO memory_fts (statement, gist, tags, aliases, body, project, id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.statement,
      row.gist ?? '',
      tags.join(' '),
      joinAliases(row.aliases),
      row.body,
      row.project,
      row.id,
    ],
  );
}

/** Removes the record's entry. */
export function unindexRecord(driver: SqlDriver, project: string, id: string): void {
  driver.run('DELETE FROM memory_fts WHERE project = ? AND id = ?', [project, id]);
}

/** Rebuilds every entry of one project from its rows. */
export function reindexProject(driver: SqlDriver, project: string): void {
  driver.run('DELETE FROM memory_fts WHERE project = ?', [project]);

  const tags = new Map<string, string[]>();
  for (const t of driver.all<{ id: string; tag: string }>(
    'SELECT id, tag FROM memory_tags WHERE project = ? ORDER BY tag',
    [project],
  )) {
    tags.set(t.id, [...(tags.get(t.id) ?? []), t.tag]);
  }

  for (const raw of driver.all(
    `SELECT ${RECORD_COLUMNS} FROM memory_records WHERE project = ? ORDER BY id`,
    [project],
  )) {
    const row = toMemoryRow(raw);
    indexRecord(driver, row, tags.get(row.id) ?? []);
  }
}
