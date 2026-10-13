/**
 * SQLite StorageAdapter: single writer, BEGIN IMMEDIATE transactions, migrations on open.
 *
 * Why: all Director state changes happen in the tick under one writer, and a
 *   half-applied change (ticket moved, run row missing) would leave a ticket no later
 *   tick can recover. This adapter makes each transaction atomic and serial:
 *   transactions span awaits, so they queue through an in-process mutex, and they take
 *   `BEGIN IMMEDIATE` so another process (the API, a CLI) waits on busy_timeout instead
 *   of interleaving. A throw rolls everything back and is rethrown, so callers see the
 *   real error; backend failures are classified into ForgeError families (a busy database
 *   is `stall`, a constraint violation `invalid_input`). A transaction started from inside
 *   another one would wait for itself forever, so it is rejected at once. Migrations run on open so a new database is usable immediately
 *   (director-core.md §2-§3, d-0023).
 *
 * Exports: createSqliteStorage(), createStorageOnDriver(), openSqlite().
 * Depends on: adapters/sqlite/*, migrations/run-migrations, shared/db-errors, shared/mutex,
 *   types/*, @forge/core.
 */

import type { StorageAdapter, StorageTx } from '@forge/core';
import { createGateResultRepository } from '#/adapters/sqlite/gate-results-repository.js';
import { createIntakeEventRepository } from '#/adapters/sqlite/intake-events-repository.js';
import { createInteractionRepository } from '#/adapters/sqlite/interactions-repository.js';
import { runImmediate } from '#/adapters/sqlite/immediate-tx.js';
import { createProjectRepository } from '#/adapters/sqlite/projects-repository.js';
import { createSqliteReceiptLog } from '#/adapters/sqlite/receipt-log.js';
import { createRunInboxRepository } from '#/adapters/sqlite/run-inbox-repository.js';
import { createRunTokenRepository } from '#/adapters/sqlite/run-tokens-repository.js';
import { createRunEventRepository } from '#/adapters/sqlite/run-events-repository.js';
import { createRunRepository } from '#/adapters/sqlite/runs-repository.js';
import { openSqliteDriver } from '#/adapters/sqlite/better-sqlite-driver.js';
import { createTicketRelationRepository } from '#/adapters/sqlite/ticket-relations-repository.js';
import { createTicketRepository } from '#/adapters/sqlite/tickets-repository.js';
import { createWakeRequestRepository } from '#/adapters/sqlite/wake-requests-repository.js';
import { runMigrations } from '#/migrations/run-migrations.js';
import { mapDbError } from '#/shared/db-errors.js';
import { createMutex } from '#/shared/mutex.js';
import type { Mutex } from '#/types/mutex.types.js';
import type { SqliteBackend } from '#/types/sqlite-backend.types.js';
import type { SqlDriver, SqliteStorageOptions } from '#/types/storage-driver.types.js';

/**
 * Wrap an already-open, already-migrated driver as a StorageAdapter. Pass the `mutex`
 * to share the writer queue with other users of the same connection (the receipt log).
 */
export function createStorageOnDriver(
  driver: SqlDriver,
  mutex: Mutex = createMutex(),
): StorageAdapter {
  const tx: StorageTx = {
    tickets: createTicketRepository(driver),
    runs: createRunRepository(driver),
    runEvents: createRunEventRepository(driver),
    intakeEvents: createIntakeEventRepository(driver),
    interactions: createInteractionRepository(driver),
    runTokens: createRunTokenRepository(driver),
    runInbox: createRunInboxRepository(driver),
    wakeRequests: createWakeRequestRepository(driver),
    gateResults: createGateResultRepository(driver),
    projects: createProjectRepository(driver),
    ticketRelations: createTicketRelationRepository(driver),
  };

  return {
    transaction: (fn) => mutex.run(() => runImmediate(driver, () => fn(tx))),
    // Queue behind in-flight transactions so close never cuts one off.
    close: () => mutex.run(async () => driver.close()),
  };
}

function openMigrated(path: string, opts: SqliteStorageOptions): SqlDriver {
  const driver = openSqliteDriver(path, opts);
  try {
    runMigrations(driver);
  } catch (error) {
    driver.close();
    throw mapDbError(error);
  }

  return driver;
}

/** Open (or create) a SQLite database at `path`, apply migrations and return the adapter. */
export function createSqliteStorage(
  path: string,
  opts: SqliteStorageOptions = {},
): StorageAdapter {
  return createStorageOnDriver(openMigrated(path, opts));
}

/**
 * Open (or create) a SQLite database and return storage and the tool receipt log on one
 * connection and one writer queue. Closing `storage` closes the connection.
 */
export function openSqlite(path: string, opts: SqliteStorageOptions = {}): SqliteBackend {
  const driver = openMigrated(path, opts);
  const mutex = createMutex();

  return {
    storage: createStorageOnDriver(driver, mutex),
    receipts: createSqliteReceiptLog(driver, mutex),
  };
}
