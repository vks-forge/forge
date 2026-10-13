# @forge/db

`StorageAdapter` and `ReceiptLog` implementations for `@forge/core` and `@forge/tools`: SQLite (WAL, writers from several processes serialised by `BEGIN IMMEDIATE`) and in-memory.

## Why it exists

The Director's state (tickets, runs, run events, interactions, intake events) must survive crashes and restarts, be readable by the UI and CLI while the engine writes, and never be half-updated. A ticket moved without its run row, a redelivered chat message creating two tickets, or two actors both winning a status race would leave work that no later tick can recover or that is dispatched twice. This package is the durable store behind the engine: atomic serial transactions, compare-and-swap on ticket status, constraint-based dedupe and an append-only run log whose `seq` it alone allocates (the driver and the MCP server both write to one run, so neither may pick numbers). It also holds the tool-receipt chain and the per-run token hashes, so verdicts and evidence outlive a run.

A Worker runs on the same machine and may be able to read the database file. So only the SHA-256 hash of a run's bearer token is stored (`run_tokens`), and the per-run HMAC secret that signs receipts is never persisted: it stays in the Forge server's memory and reaches the hook through its `credentials()` callback. Reading the file therefore gives neither a usable token nor the means to forge a receipt.

## What it does

Public API (`src/index.ts`):

- `openSqlite(path, { busyTimeoutMs? })` opens a file or `:memory:`, applies migrations and returns `{ storage, receipts }` on one connection and one writer queue. Use this when you need the receipt log. `storage.close()` closes the connection.
- `createSqliteStorage(path, { busyTimeoutMs? })` the same without the receipt log; returns a `StorageAdapter`.
- `createSqliteReceiptLog(driver, mutex)` a `ReceiptLog` on an open driver. The `mutex` must be the one passed to `createStorageOnDriver(driver, mutex)` (`createMutex()`), or receipt appends could interleave with Director transactions.
- `createMemoryStorage()` Maps-backed adapter; transactions snapshot and roll back on throw. `createMemoryReceiptLog()` the in-memory `ReceiptLog` (test double and reference).
- `RunTokenRepository` on every transaction: `runTokens.issue(runId, sha256, issuedAt)` (replaces a live hash; throws `PolicyDeniedError` when the run's token was revoked, so a late or replayed issue cannot re-arm a dead token; non-digests are refused), `reissue(...)` (the explicit re-arm for a resumed run: replaces the hash and clears the revocation), `getHash(runId)` (null if absent or revoked), `revoke(runId, at)`. `put` is a deprecated alias of `issue` kept so existing callers compile.
- `runMigrations(driver)` forward-only, numbered, checksummed, applied idempotently via `schema_migrations`. `MIGRATIONS` is the registry. The whole run is one `BEGIN IMMEDIATE` transaction and the applied set is read after taking the lock, so two processes opening a fresh file at once do not collide: the second waits (`busy_timeout`), then finds nothing to apply. A database holding migrations this build does not know (a newer database, an older binary) is refused with an error naming the ids.
- `checkSchemaCurrent(driver)` reports `{ status, pending, unknown, edited }` without migrating or creating anything: `current`, `behind` (migrations pending), `ahead` (database newer than this build) or `edited` (an applied migration's SQL changed). Read-only processes (hooks, MCP) call it at start and refuse to run on anything but `current`; only the process that owns the database calls `runMigrations`.
- `openSqliteDriver`, `createStorageOnDriver` and the `SqlDriver` type, for building another SQL-backed adapter.

All mutations go through `adapter.transaction(fn)`: serialized by an in-process mutex (one writer per process) and `BEGIN IMMEDIATE` (one writer across processes, the others wait on `busy_timeout`); a throw rolls everything back and is rethrown. Calling `transaction()` (or `receipts.append`, or `close`) from inside a transaction callback on the same writer would wait for itself forever, so it is detected with `AsyncLocalStorage` and rejected at once with an `InvalidInputError`. `updateTicketCas` is one `UPDATE ... WHERE id=? AND status_version=?` (`changes === 1`) that always sets `status_version = expected + 1`; a patch that carries `status_version` is refused with `InvalidInputError`. A patch key present with value `undefined` clears an optional column (NULL in SQLite, key removed in memory), so `updateTicketCas(id, v, toTicketPatch(next))` leaves no stale `blocked_reason` or `tier_actual`; for a required column it is an `InvalidInputError`. Intake dedupe is `UNIQUE(source, dedupe_key)` + `ON CONFLICT DO NOTHING`. `run_events` is append-only with `(run_id, seq)` as primary key; `append` reads `MAX(seq)+1` inside the writer's transaction and returns the stored event. Rows are re-parsed with the core zod schemas on read. `tool_call.input` and `tool_result.output` are stored as `null` when the harness sent none, and events are JSON-normalised in both adapters, so `listByRun` returns what `append` returned.

Errors leave the adapters typed (code.md rule 7), never as raw `SqliteError` or `ZodError`: lock contention (`SQLITE_BUSY`, `SQLITE_LOCKED`, after `busy_timeout`) is `StallError` (family `stall`: the writer made no progress, retry later; `rate_limit` is reserved for providers); a constraint violation, a duplicate id, a rejected patch or a value that fails schema validation on write is `InvalidInputError` (family `invalid_input`); a stored row that fails validation on read, or any other engine error, is `UnknownForgeError` (family `unknown`, fail closed). The original error is always `cause`. Exceptions thrown by the caller's own transaction callback are rethrown unchanged.

Migrations: 0001 state tables (`projects`, `tickets`, `ticket_relations`, `intake_events`, `wake_requests`, `runs`, `run_events`, `run_inbox`, `interactions`); 0002 verification tables (`gate_results`, `tool_decisions`, `tool_effects`, `skills_registry`, `skill_usage`); 0003 receipt-chain columns (decision `reason` and `parent_call_id`, effect `run_id` and `chain_seq`, final chain hash on `runs`); 0004 `run_tokens` and `tool_decisions.chain_seq`, with partial unique indexes on `(run_id, chain_seq)` for decisions and effects. There are no foreign keys: rows arrive from independent writers and the Director validates references itself.

## Why this approach

- `better-sqlite3@13.0.3` (types: `@types/better-sqlite3@9.6.0`): synchronous, no server to run on a single Windows box, and its package ships a prebuilt `win32-x64.node`, so it loads on Node 24.20 without a compiler. Its `install` script (`node-gyp rebuild`) fails on this host, so `pnpm-workspace.yaml` sets `allowBuilds: better-sqlite3: false`. `node:sqlite` remains the fallback behind `SqlDriver`.
- WAL with `busy_timeout` set first: readers and a second process wait on the writer instead of failing. Several processes may write (the Forge server, the hook handler, the MCP server); `BEGIN IMMEDIATE` plus `busy_timeout` serialises them.
- `synchronous=FULL`: every commit is fsynced. Under WAL, `NORMAL` can lose the most recent acknowledged commits on an OS crash or power loss (the database stays consistent, but a Director that already acted on a lost commit would act twice), so durability wins over the small write-speed cost for a store this low-volume.
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
- Multiple writer processes are expected and safe on one machine (WAL, `BEGIN IMMEDIATE`, `busy_timeout`); writers beyond `busy_timeout` get a `StallError` to retry. No cross-machine replication, and SQLite files must not live on a network share.
- The two-openers-on-a-fresh-file migration test is an in-process simulation (a second connection migrates between the first one's read and write); a real second process is not used because the TypeScript sources cannot be run by plain node here.
- The memory receipt log is not tied to the memory storage's mutex, so it cannot deadlock against it; only the SQLite receipt log shares the storage mutex and rejects being called from inside a storage transaction.
- No foreign keys by design; referential checks are the caller's job.
