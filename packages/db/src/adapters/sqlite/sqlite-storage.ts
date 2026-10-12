/**
 * SQLite StorageAdapter: single writer, BEGIN IMMEDIATE transactions, migrations on open.
 *
 * Why: all Director state changes happen in the tick under one writer, and a
 *   half-applied change (ticket moved, run row missing) would leave a ticket no later
 *   tick can recover. This adapter makes each transaction atomic and serial:
 *   transactions span awaits, so they queue through an in-process mutex, and they take
 *   `BEGIN IMMEDIATE` so another process (the API, a CLI) waits on busy_timeout instead
 *   of interleaving. A throw rolls everything back and is rethrown unchanged, so callers
 *   see the real error. Migrations run on open so a new database is usable immediately
 *   (director-core.md §2-§3, d-0023).
 *
 * Exports: createSqliteStorage().
 * Depends on: adapters/sqlite/*, migrations/run-migrations, shared/mutex, @forge/core.
 */

import type { StorageAdapter, StorageTx } from '@forge/core';
import { createIntakeEventRepository } from '#/adapters/sqlite/intake-events-repository.js';
import { createInteractionRepository } from '#/adapters/sqlite/interactions-repository.js';
import { createRunEventRepository } from '#/adapters/sqlite/run-events-repository.js';
import { createRunRepository } from '#/adapters/sqlite/runs-repository.js';
import { openSqliteDriver } from '#/adapters/sqlite/better-sqlite-driver.js';
import { createTicketRepository } from '#/adapters/sqlite/tickets-repository.js';
import { runMigrations } from '#/migrations/run-migrations.js';
import { createMutex } from '#/shared/mutex.js';
import type { SqlDriver, SqliteStorageOptions } from '#/types/storage-driver.types.js';

/** Wrap an already-open, already-migrated driver as a StorageAdapter. */
export function createStorageOnDriver(driver: SqlDriver): StorageAdapter {
  const mutex = createMutex();
  const tx: StorageTx = {
    tickets: createTicketRepository(driver),
    runs: createRunRepository(driver),
    runEvents: createRunEventRepository(driver),
    intakeEvents: createIntakeEventRepository(driver),
    interactions: createInteractionRepository(driver),
  };
  return {
    transaction: (fn) =>
      mutex.run(async () => {
        driver.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(tx);
          driver.exec('COMMIT');
          return result;
        } catch (error) {
          driver.exec('ROLLBACK');
          throw error;
        }
      }),
    // Queue behind in-flight transactions so close never cuts one off.
    close: () => mutex.run(async () => driver.close()),
  };
}

/** Open (or create) a SQLite database at `path`, apply migrations and return the adapter. */
export function createSqliteStorage(
  path: string,
  opts: SqliteStorageOptions = {},
): StorageAdapter {
  const driver = openSqliteDriver(path, opts);
  try {
    runMigrations(driver);
  } catch (error) {
    driver.close();
    throw error;
  }
  return createStorageOnDriver(driver);
}
