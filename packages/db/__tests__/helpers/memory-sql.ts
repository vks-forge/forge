/**
 * SQL helpers for the migration 0029 tests: a fresh migrated database, a record insert and trigger assertions.
 *
 * Why: the memory migration is pinned by two test files (additive shape and constraints, then the
 *   append-only triggers) that need the same raw inserts and the same "this update must abort" check. Raw
 *   SQL is used on purpose: the triggers are the second lock behind the repository, so they are tested
 *   without going through it.
 *
 * Exports: STAMP, ticket(), card(), memoryTables, checkList(), fresh(), record(), abortsWith().
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { expect } from 'vitest';
import { openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver } from '#/index.js';

export const STAMP = '2026-10-18T00:00:00.000Z';

export const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'standard', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

export const card = (id: string): string =>
  `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref, created_by_type,
     created_by_id, created_at, updated_at)
   VALUES ('${id}', 'sf', 'issue', 'c', 's', 'chat', 'm', 'user', 'u1', '${STAMP}', '${STAMP}')`;

export const memoryTables = [
  'memory_records',
  'memory_tags',
  'memory_links',
  'memory_events',
  'memory_aid_versions',
  'memory_access_log',
  'memory_imports',
  'memory_purge_guard',
];

/** The words listed in the CHECK of `column` in the SQL that created `table`. */
export function checkList(driver: SqlDriver, table: string, column: string): string[] {
  const sql =
    driver.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE name = '${table}'`)
      ?.sql ?? '';

  const match = new RegExp(
    `${column}\\s+TEXT[^,]*?CHECK \\(${column} IN \\(([^)]*)\\)`,
    's',
  ).exec(sql);

  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

export const fresh = (): SqlDriver => {
  const driver = openSqliteDriver(':memory:');
  runMigrations(driver);

  return driver;
};

export const record = (
  driver: SqlDriver,
  id = 'd-0001',
  over: Record<string, unknown> = {},
): void => {
  const row: Record<string, unknown> = {
    project: 'forge',
    id,
    kind: 'decision',
    status: 'active',
    statement: 'Use zod',
    body: 'why',
    source_type: 'chat',
    source_ref: 'owner',
    author: 'user',
    origin: 'owner',
    confidence: 0.5,
    created_at: STAMP,
    valid_from: '2026-10-18',
    ...over,
  };

  const cols = Object.keys(row);
  driver.run(
    `INSERT INTO memory_records (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c] as string | number | null),
  );
};

export const abortsWith = (
  driver: SqlDriver,
  sql: string,
  params: unknown[],
  word: string,
): void => {
  expect(() => driver.run(sql, params as never[])).toThrow(new RegExp(word));
};
