/**
 * Migration runner: applies pending migrations idempotently via `schema_migrations`.
 *
 * Why: the factory opens its database on every start, from the API and the Director
 *   alike, so opening must be safe to repeat and must never leave the schema
 *   half-applied. Each migration runs in its own transaction and records a checksum; if
 *   an applied migration was edited, or ids go backwards, the runner refuses to start
 *   rather than run against a schema nobody can reason about.
 *
 * Exports: runMigrations().
 * Depends on: migrations/registry, types/storage-driver.types, @forge/core, node:crypto.
 */

import { createHash } from 'node:crypto';
import { UnknownForgeError } from '@forge/core';
import { MIGRATIONS } from '#/migrations/registry.js';
import type { Migration } from '#/types/migrations.types.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

const checksum = (m: Migration): string =>
  createHash('sha256').update(m.sql).digest('hex');

/**
 * Apply every migration not yet recorded; returns the ids applied by this call.
 * Pass `migrations` only in tests; production uses the built-in list.
 */
export function runMigrations(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): number[] {
  driver.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = new Map(
    driver
      .all<{ id: number; checksum: string }>('SELECT id, checksum FROM schema_migrations')
      .map((r) => [r.id, r.checksum]),
  );
  const applied: number[] = [];
  let last = 0;
  for (const m of migrations) {
    if (m.id <= last) throw new UnknownForgeError(`Migration ids must increase: ${m.id}`);
    last = m.id;
    const known = done.get(m.id);
    if (known !== undefined) {
      if (known !== checksum(m))
        throw new UnknownForgeError(
          `Migration ${m.id} (${m.name}) was edited after apply`,
        );
      continue;
    }
    driver.exec('BEGIN IMMEDIATE');
    try {
      driver.exec(m.sql);
      driver.run(
        'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [m.id, m.name, checksum(m), new Date().toISOString()],
      );
      driver.exec('COMMIT');
    } catch (error) {
      driver.exec('ROLLBACK');
      throw error;
    }
    applied.push(m.id);
  }
  return applied;
}
