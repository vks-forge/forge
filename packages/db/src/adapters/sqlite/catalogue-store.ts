/**
 * SQLite CatalogueStore: the versioned tool catalogue in `catalogue_versions`.
 *
 * Why: the server builds every run's tool policy from this and the owner changes it from
 *   Settings, from different processes on one database file (the MCP server and the hook
 *   process open it too). Saving is read-current-version, compare, insert inside one
 *   `BEGIN IMMEDIATE` on the shared writer mutex, so two saves from the same stale screen
 *   cannot both win: the second gets `ConfigVersionConflictError` and the UI reloads. A
 *   document that does not load as a catalogue (bad entry, duplicate id) is refused before
 *   it is stored, so a stored version is always usable. Rows are only inserted (triggers
 *   refuse update and delete), so the catalogue hash a run recorded always maps back to
 *   one document. Opening writes the built-in catalogue as version 1 when the table is
 *   empty (`INSERT OR IGNORE`, so processes opening together cannot collide).
 *
 * Exports: createSqliteCatalogueStore().
 * Depends on: @forge/core, @forge/tools, adapters/sqlite/immediate-tx, shared/catalogue-rows,
 *   shared/db-errors, types/mutex.types, types/storage-driver.types.
 */

import { ConfigVersionConflictError, InvalidInputError, type Clock } from '@forge/core';
import { BUILT_IN_CATALOGUE, SEED_AUTHOR, SEED_REASON } from '@forge/tools';
import type { CatalogueStore, CatalogueVersion } from '@forge/tools';
import { runImmediate } from '#/adapters/sqlite/immediate-tx.js';
import { checkAppend, toCatalogueVersion } from '#/shared/catalogue-rows.js';
import { mapDbError } from '#/shared/db-errors.js';
import type { Mutex } from '#/types/mutex.types.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

const COLUMNS = 'version, doc_json, author, reason, created_at';

/** Catalogue store over `driver`; `mutex` must be the one the storage on this connection uses. */
export function createSqliteCatalogueStore(
  driver: SqlDriver,
  mutex: Mutex,
  clock: Pick<Clock, 'now'> = Date,
): CatalogueStore {
  driver.run(
    `INSERT OR IGNORE INTO catalogue_versions (${COLUMNS}) VALUES (1, ?, ?, ?, ?)`,
    [JSON.stringify(BUILT_IN_CATALOGUE), SEED_AUTHOR, SEED_REASON, clock.now()],
  );

  const latest = (): CatalogueVersion => {
    const row = driver.get(
      `SELECT ${COLUMNS} FROM catalogue_versions ORDER BY version DESC LIMIT 1`,
    );

    if (!row) {
      throw new InvalidInputError('the tool catalogue has no saved version');
    }

    return toCatalogueVersion(row);
  };

  const read = <T>(body: () => T): Promise<T> =>
    mutex.run(async () => {
      try {
        return body();
      } catch (error) {
        throw mapDbError(error);
      }
    });

  return {
    current: () => read(latest),

    history: () =>
      read(() =>
        driver
          .all(`SELECT ${COLUMNS} FROM catalogue_versions ORDER BY version`)
          .map(toCatalogueVersion),
      ),

    append: async (input) => {
      const req = checkAppend(input);

      return mutex.run(() =>
        runImmediate(driver, async () => {
          const current = latest().version;
          if (current !== req.expectedVersion) {
            throw new ConfigVersionConflictError(req.expectedVersion, current);
          }

          driver.run(
            `INSERT INTO catalogue_versions (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
            [current + 1, JSON.stringify(req.doc), req.author, req.reason, clock.now()],
          );

          return latest();
        }),
      );
    },
  };
}
