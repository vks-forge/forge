/**
 * Opens the Forge database for the MCP process without creating or migrating it.
 *
 * Why: the Forge server owns the database and its migrations. A per-run MCP process that
 *   created a missing file (a typo in `FORGE_DB_PATH`) or upgraded the schema would
 *   silently fork state away from the server, or race its migration. So this opener
 *   refuses a missing file, refuses a file whose `schema_migrations` is absent or behind
 *   the registry, and never runs a migration. The caller gets a storage adapter only for
 *   a database the server has already brought to the current schema.
 *
 * Exports: openExistingStorage().
 * Depends on: node:fs, @forge/core, @forge/db (openSqliteDriver, createStorageOnDriver, MIGRATIONS).
 *   IO: stats and opens one SQLite file.
 */

import { statSync } from 'node:fs';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { MIGRATIONS, createStorageOnDriver, openSqliteDriver } from '@forge/db';

/** Opens `path` as storage; throws InvalidInputError if it is missing or not at the current schema. */
export function openExistingStorage(path: string): StorageAdapter {
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    isFile = false;
  }

  if (!isFile) {
    throw new InvalidInputError(`database not found: ${path}`);
  }

  const driver = openSqliteDriver(path);
  try {
    const latest = MIGRATIONS.at(-1)?.id ?? 0;
    let applied: number | null;
    try {
      applied =
        driver.get<{ max_id: number | null }>(
          'SELECT MAX(id) AS max_id FROM schema_migrations',
        )?.max_id ?? null;
    } catch {
      throw new InvalidInputError(
        'database has no schema_migrations table; the Forge server must migrate it first',
      );
    }

    if (applied === null || applied < latest) {
      throw new InvalidInputError(
        `database schema is behind (migration ${applied ?? 0} of ${latest}); start the Forge server to migrate it`,
      );
    }

    return createStorageOnDriver(driver);
  } catch (error) {
    driver.close();
    throw error;
  }
}
