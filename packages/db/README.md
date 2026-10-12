# @forge/db

`StorageAdapter` implementations for `@forge/core`: SQLite (WAL, single writer) and in-memory.
Depends on `@forge/core` and `better-sqlite3` only.

## Public API (`src/index.ts`)

- `createSqliteStorage(path, { busyTimeoutMs? })` opens a file or `:memory:`, applies migrations, returns a `StorageAdapter`.
- `createMemoryStorage()` Maps-backed adapter; transactions snapshot and roll back on throw.
- `runMigrations(driver)` forward-only, numbered, checksummed, applied idempotently via `schema_migrations`.
- `openSqliteDriver`, `createStorageOnDriver`, `SqlDriver` for building another SQL-backed adapter.

All mutations go through `adapter.transaction(fn)`: serialized by a mutex (single writer) and `BEGIN IMMEDIATE`; a throw rolls everything back. `updateTicketCas` is one `UPDATE ... WHERE id=? AND status_version=?` (`changes === 1`); a patch without `status_version` bumps it by one. Intake dedupe is `UNIQUE(source, dedupe_key)` + `ON CONFLICT DO NOTHING`. Rows are parsed with the core zod schemas at the boundary.

## Seam design

SQLite repositories are written against the internal `SqlDriver` (`src/types/storage-driver.types.ts`), so the engine can swap. The memory adapter does not share that code: it implements `StorageAdapter` directly and shares only the contract test (`__tests__/contract/storage.contract.ts`).

## Adding an adapter

Create `src/adapters/<name>/`, implement `StorageAdapter` (import only `@forge/core`), export a `create<Name>Storage` from `src/index.ts`, and add `__tests__/adapters/<name>.test.ts` calling `describeStorageContract(name, makeAdapter)`. Pass the contract before writing adapter-specific tests.

## Driver choice

`better-sqlite3@13.0.3`: its package ships a prebuilt `win32-x64.node`, so it loads on this host (Node 24.20) with no compiler. Its `install` script (`node-gyp rebuild`) fails here, so `pnpm-workspace.yaml` sets `allowBuilds: better-sqlite3: false`. Drizzle is **not** used (hand-written SQL migrations and repositories, deviating from d-0023's ORM choice); `node:sqlite` remains the fallback behind `SqlDriver`.

## Provisional tables

No core schema yet; columns follow the design docs literally and may change: `projects`, `wake_requests` (unique on `ticket_id, reason, idempotency_key`), `run_inbox`, `gate_results`, `tool_decisions`, `tool_effects`, `skills_registry`, `skill_usage`. `ticket_relations` exists but has no repository yet. No foreign keys anywhere.
