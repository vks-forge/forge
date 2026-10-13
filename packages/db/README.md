# @forge/db

`StorageAdapter` and `ReceiptLog` implementations for `@forge/core` and `@forge/tools`: SQLite (WAL, single writer) and in-memory.

## Why it exists

The Director's state (tickets, runs, run events, interactions, intake events) must survive crashes and restarts, be readable by the UI and CLI while the engine writes, and never be half-updated. A ticket moved without its run row, a redelivered chat message creating two tickets, or two actors both winning a status race would leave work that no later tick can recover or that is dispatched twice. This package is the durable store behind the engine: atomic serial transactions, compare-and-swap on ticket status, constraint-based dedupe and an append-only run log whose `seq` it alone allocates (the driver and the MCP server both write to one run, so neither may pick numbers). It also holds the tool-receipt chain and the per-run token hashes, so verdicts and evidence outlive a run.

A Worker runs on the same machine and may be able to read the database file. So only the SHA-256 hash of a run's bearer token is stored (`run_tokens`), and the per-run HMAC secret that signs receipts is never persisted: it stays in the Forge server's memory and reaches the hook through its `credentials()` callback. Reading the file therefore gives neither a usable token nor the means to forge a receipt.

## What it does

Public API (`src/index.ts`):

- `openSqlite(path, { busyTimeoutMs? })` opens a file or `:memory:`, applies migrations and returns `{ storage, receipts }` on one connection and one writer queue. Use this when you need the receipt log. `storage.close()` closes the connection.
- `createSqliteStorage(path, { busyTimeoutMs? })` the same without the receipt log; returns a `StorageAdapter`.
- `createSqliteReceiptLog(driver, mutex)` a `ReceiptLog` on an open driver. The `mutex` must be the one passed to `createStorageOnDriver(driver, mutex)` (`createMutex()`), or receipt appends could interleave with Director transactions.
- `createMemoryStorage()` Maps-backed adapter; transactions snapshot and roll back on throw. `createMemoryReceiptLog()` the in-memory `ReceiptLog` (test double and reference).
- `RunTokenRepository` on every transaction: `runTokens.put(runId, sha256, issuedAt)` (re-issue replaces and clears revocation; non-digests are refused), `getHash(runId)` (null if absent or revoked), `revoke(runId, at)`.
- `runMigrations(driver)` forward-only, numbered, checksummed, applied idempotently via `schema_migrations`. `MIGRATIONS` is the registry.
- `openSqliteDriver`, `createStorageOnDriver` and the `SqlDriver` type, for building another SQL-backed adapter.

All mutations go through `adapter.transaction(fn)`: serialized by an in-process mutex (single writer) and `BEGIN IMMEDIATE`; a throw rolls everything back and is rethrown. `updateTicketCas` is one `UPDATE ... WHERE id=? AND status_version=?` (`changes === 1`); a patch without `status_version` bumps it by one. Intake dedupe is `UNIQUE(source, dedupe_key)` + `ON CONFLICT DO NOTHING`. `run_events` is append-only with `(run_id, seq)` as primary key; `append` reads `MAX(seq)+1` inside the writer's transaction and returns the stored event. Rows are re-parsed with the core zod schemas on read.

Migrations: 0001 state tables (`projects`, `tickets`, `ticket_relations`, `intake_events`, `wake_requests`, `runs`, `run_events`, `run_inbox`, `interactions`); 0002 verification tables (`gate_results`, `tool_decisions`, `tool_effects`, `skills_registry`, `skill_usage`); 0003 receipt-chain columns (decision `reason` and `parent_call_id`, effect `run_id` and `chain_seq`, final chain hash on `runs`); 0004 `run_tokens` and `tool_decisions.chain_seq`, with partial unique indexes on `(run_id, chain_seq)` for decisions and effects. There are no foreign keys: rows arrive from independent writers and the Director validates references itself.

## Why this approach

- `better-sqlite3@13.0.3` (types: `@types/better-sqlite3@9.6.0`): synchronous, no server to run on a single Windows box, and its package ships a prebuilt `win32-x64.node`, so it loads on Node 24.20 without a compiler. Its `install` script (`node-gyp rebuild`) fails on this host, so `pnpm-workspace.yaml` sets `allowBuilds: better-sqlite3: false`. `node:sqlite` remains the fallback behind `SqlDriver`.
- WAL with `busy_timeout` set first: readers and a second process wait on the writer instead of failing.
- Raw portable SQL on a `SqlDriver` seam, no ORM (d-0047, superseding d-0023). Zod in core is already the schema source of truth and an ORM schema would duplicate it; dialect differences are handled per adapter, not by a query builder. The memory adapter does not share SQL code; it implements `StorageAdapter` directly and shares only the contract test.
- Checksummed forward-only migrations, so an edited old migration is detected.
- Constraints rather than read-then-write for dedupe and CAS, so concurrent writers cannot both succeed.
- Tables with no core schema (`projects`, `wake_requests`, `run_inbox`, `gate_results`, the skills tables) follow the design docs literally and may change.
- Receipt chain storage: decisions go to `tool_decisions`, effects to `tool_effects`. `chain_seq` is the 1-based position in the run's chain across both tables, so `list()` rebuilds the interleaving without walking hashes; rows from before 0004 have position 0 and are skipped. Column map: `rule_id` = matched rule, `finding_ids_json` = JSON array, `reason` = reason code, `parent_call_id` has no receipt field and stays NULL. `append` is one `BEGIN IMMEDIATE` on the storage mutex: read head, run `build`, insert, commit; a throw or any rejected receipt (other run, reused decision id or seq, effect without its decision) rolls back the whole batch. Each receipt is re-parsed with the tools schema on read.

## Requirements

- Node 24.20 and pnpm. The `better-sqlite3` native binary must be present; the win32-x64 prebuilt ships in the package, so do not enable its build script on this host.
- Depends on `@forge/core` and `@forge/tools` (receipt schemas and the `ReceiptLog` port; tests also use them for real chains). No env vars and no `.forge/` files; the caller chooses the database path.
- `pnpm build` at the root produces `dist/`; the `development` export condition resolves `src/` in tests and typecheck.
- Tests: `pnpm test` at the root. The contract tests are `__tests__/contract/storage.contract.ts` (`describeStorageContract`) and `__tests__/contract/receipt-log.contract.ts` (`describeReceiptLogContract`: 25 parallel appends give seq 1..N and a chain `verifyChain` accepts, rollback when `build` throws, run isolation), each run against SQLite and memory. Coverage floor is 70% lines.

## Extending

Create `src/adapters/<name>/`, implement `StorageAdapter` and `ReceiptLog` (import only `@forge/core` and `@forge/tools`), export a `create<Name>Storage` from `src/index.ts`, and add `__tests__/adapters/<name>.test.ts` calling `describeStorageContract(name, makeAdapter)`. Pass the contract before writing adapter-specific tests. A SQL engine can instead implement `SqlDriver` and reuse `createStorageOnDriver`. New tables go in a new numbered migration registered in `migrations/registry.ts`; never edit an applied one.

## Limits

- Only SQLite and memory adapters exist. There is no Postgres or libsql adapter; the seam is kept open for them (d-0047).
- `ticket_relations` has no repository. `projects`, `wake_requests`, `run_inbox`, `gate_results` and the skills tables have no repository yet; `tool_decisions` and `tool_effects` are reached only through `ReceiptLog`.
- The receipt log does not update `runs.final_chain_hash`; whoever finalises a run must record it (without it a truncated tail is undetectable).
- The memory receipt log is per instance and not transactional with `createMemoryStorage()`.
- One writer process at a time; no cross-machine replication.
- No foreign keys by design; referential checks are the caller's job.
