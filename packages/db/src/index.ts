/**
 * Public API of @forge/db: re-exports only.
 *
 * Why: the package boundary is one file so apps wire storage by importing `@forge/db`
 *   and nothing deeper (code.md rule 10); adding a backend means a new folder under
 *   adapters/ and one export here.
 *
 * Exports: createSqliteStorage, createStorageOnDriver, openSqliteDriver, createMemoryStorage,
 *   runMigrations, MIGRATIONS, and the SqlDriver / Migration types.
 * Depends on: adapters/sqlite, adapters/memory, migrations. No IO on import.
 */

export { createMemoryStorage } from '#/adapters/memory/memory-storage.js';
export { openSqliteDriver } from '#/adapters/sqlite/better-sqlite-driver.js';
export {
  createSqliteStorage,
  createStorageOnDriver,
} from '#/adapters/sqlite/sqlite-storage.js';
export { MIGRATIONS } from '#/migrations/registry.js';
export { runMigrations } from '#/migrations/run-migrations.js';
export type * from '#/types/migrations.types.js';
export type * from '#/types/mutex.types.js';
export type * from '#/types/storage-driver.types.js';
