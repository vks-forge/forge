/**
 * Migration runner: applies pending migrations idempotently via `schema_migrations`.
 *
 * Why: the factory opens its database on every start, from the API, the Director and
 *   the hook/MCP processes alike, and several of them can open a fresh file at the same
 *   moment. Opening must therefore be safe to repeat and to race, and must never leave
 *   the schema half-applied. The whole run is one `BEGIN IMMEDIATE` transaction and the
 *   applied set is read after the lock is taken, so a second opener waits, then finds
 *   nothing left to do instead of re-creating tables from a stale read. If an applied
 *   migration was edited, ids go backwards, or the database holds migrations this binary
 *   has never heard of (a newer database opened by an older build), the runner refuses
 *   to start rather than run against a schema nobody can reason about.
 *
 * Exports: runMigrations(), migrationChecksum().
 * Depends on: migrations/registry, types/storage-driver.types, @forge/core, node:crypto.
 */

import { createHash } from 'node:crypto';
import { UnknownForgeError } from '@forge/core';
import { MIGRATIONS } from '#/migrations/registry.js';
import type { Migration } from '#/types/migrations.types.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

/** SHA-256 of a migration's SQL, as recorded in `schema_migrations`. */
export const migrationChecksum = (m: Migration): string =>
  createHash('sha256').update(m.sql).digest('hex');

/** Throws unless ids strictly increase. */
export function assertIncreasing(migrations: readonly Migration[]): void {
  let last = 0;
  for (const m of migrations) {
    if (m.id <= last) {
      throw new UnknownForgeError(`Migration ids must increase: ${m.id}`);
    }

    last = m.id;
  }
}

/**
 * Apply every migration not yet recorded; returns the ids applied by this call.
 * Pass `migrations` only in tests; production uses the built-in list.
 */
export function runMigrations(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): number[] {
  assertIncreasing(migrations);
  driver.exec('BEGIN IMMEDIATE');
  try {
    // DDL is transactional in SQLite, so this table and every migration commit together.
    driver.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);

    // Read under the write lock: another opener may have applied migrations while we waited.
    const done = new Map(
      driver
        .all<{ id: number; checksum: string }>(
          'SELECT id, checksum FROM schema_migrations',
        )
        .map((r) => [r.id, r.checksum]),
    );

    const known = new Set(migrations.map((m) => m.id));
    const unknown = [...done.keys()].filter((id) => !known.has(id)).sort((a, b) => a - b);
    if (unknown.length > 0) {
      throw new UnknownForgeError(
        `Database schema is newer than this build: unknown migration id(s) ${unknown.join(', ')}`,
      );
    }

    const applied: number[] = [];
    for (const m of migrations) {
      const recorded = done.get(m.id);
      if (recorded !== undefined) {
        if (recorded !== migrationChecksum(m)) {
          throw new UnknownForgeError(
            `Migration ${m.id} (${m.name}) was edited after apply`,
          );
        }

        continue;
      }

      driver.exec(m.sql);
      driver.run(
        'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [m.id, m.name, migrationChecksum(m), new Date().toISOString()],
      );

      applied.push(m.id);
    }

    driver.exec('COMMIT');

    return applied;
  } catch (error) {
    driver.exec('ROLLBACK');
    throw error;
  }
}
