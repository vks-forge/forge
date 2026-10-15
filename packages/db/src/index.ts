/**
 * Public API of @forge/db: re-exports only.
 *
 * Why: apps compose the factory by choosing a storage backend from config. A single
 *   entry point means they never reach into repositories or SQL, and a new backend is a
 *   new folder plus one export with no change to the Director. Importing it has no side
 *   effects, so no database is opened until an app asks for one. Storage and the tool
 *   receipt log are exported together because on SQLite they must share one connection
 *   and one writer queue, or a receipt append could interleave with a Director
 *   transaction (d-0023).
 *
 * Exports: openSqlite, createSqliteStorage, createStorageOnDriver, createSqliteReceiptLog,
 *   createSqliteConfigSource, createMemoryConfigSource, createSqliteCatalogueStore,
 *   createMemoryCatalogueStore,
 *   openSqliteDriver, createMutex, createMemoryStorage, createMemoryReceiptLog,
 *   runMigrations, checkSchemaCurrent, MIGRATIONS, and the SqlDriver / Migration /
 *   SchemaReport / SqliteBackend types.
 * Depends on: adapters/sqlite, adapters/memory, migrations, shared/mutex. No IO on import.
 */

export { createMemoryCatalogueStore } from '#/adapters/memory/catalogue-store.js';
export { createMemoryConfigSource } from '#/adapters/memory/config-source.js';
export { createSqliteCatalogueStore } from '#/adapters/sqlite/catalogue-store.js';
export { createSqliteConfigSource } from '#/adapters/sqlite/config-source.js';
export { createMemoryReceiptLog } from '#/adapters/memory/receipt-log.js';
export { createMemoryStorage } from '#/adapters/memory/memory-storage.js';
export { openSqliteDriver } from '#/adapters/sqlite/better-sqlite-driver.js';
export { createSqliteReceiptLog } from '#/adapters/sqlite/receipt-log.js';
export {
  createSqliteStorage,
  createStorageOnDriver,
  openSqlite,
} from '#/adapters/sqlite/sqlite-storage.js';
export { MIGRATIONS } from '#/migrations/registry.js';
export { runMigrations } from '#/migrations/run-migrations.js';
export { checkSchemaCurrent } from '#/migrations/schema-status.js';
export { createMutex } from '#/shared/mutex.js';
export type * from '#/types/migrations.types.js';
export type * from '#/types/mutex.types.js';
export type * from '#/types/sqlite-backend.types.js';
export type * from '#/types/storage-driver.types.js';
