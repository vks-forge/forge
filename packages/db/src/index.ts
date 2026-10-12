/**
 * Public API of @forge/db: re-exports only.
 *
 * Why: apps compose the factory by choosing a storage backend from config. A single
 *   entry point means they never reach into repositories or SQL, and a new backend is a
 *   new folder plus one export with no change to the Director. Importing it has no side
 *   effects, so no database is opened until an app asks for one (d-0023).
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
