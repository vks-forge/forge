/**
 * One BEGIN IMMEDIATE ... COMMIT/ROLLBACK around an async body, with typed errors.
 *
 * Why: the storage adapter and the receipt log both need "take the write lock first,
 *   commit or roll back whole, surface a typed error". Written twice they drift: one
 *   would let a failed COMMIT mask the real error with a ROLLBACK failure, the other
 *   would leak a raw SqliteError for a busy database. This is the one place that does
 *   it. The body's own exceptions are rethrown unchanged (callers see the real error);
 *   only backend errors are classified (shared/db-errors).
 *
 * Exports: runImmediate().
 * Depends on: shared/db-errors, types/storage-driver.types. IO: the database connection.
 */

import { mapDbError } from '#/shared/db-errors.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

/** Run `body` inside one immediate transaction on `driver`; the caller must already hold the writer mutex. */
export async function runImmediate<T>(
  driver: SqlDriver,
  body: () => Promise<T>,
): Promise<T> {
  try {
    driver.exec('BEGIN IMMEDIATE');
  } catch (error) {
    throw mapDbError(error);
  }

  try {
    const result = await body();
    driver.exec('COMMIT');

    return result;
  } catch (error) {
    try {
      driver.exec('ROLLBACK');
    } catch {
      // The transaction may already be gone (failed COMMIT); the original error matters.
    }

    throw mapDbError(error);
  }
}
