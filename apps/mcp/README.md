# @forge/mcp-server

The `forge-mcp` process: reads env, opens the existing SQLite database, and serves `@forge/mcp` over stdio for one run.

## Why it exists

The Forge MCP server must run as its own process, launched by a driver with a per-run
token, and talk to the harness over stdin/stdout. `@forge/mcp` is a library of ports
and must not read env vars or open databases; something has to wire the real SQLite
storage and token lookup to it. This is that composition root. Without it there is no
process for a harness to connect to, and nothing that refuses to start when the token
does not match the run.

## What it does

- `src/main.ts`: entry; calls `start(process.env, io)` with real exit, stderr and
  stdio. No logic.
- `src/services/start.ts`: `parseEnv()`, `depsFromEnv()` (opens the database through `services/open-database.ts`, adds the real network ports with `withDefaultNetwork`; the run-token hash is read by `@forge/mcp` through
  that storage), `start()` (serve, or print to stderr and exit 1 on any startup failure).
- Bin: `forge-mcp` -> `dist/main.js`.

## Why this approach

Composition lives in `apps/` so the adapter package stays testable and free of
environment access (code.md rule 1). Process effects are injected (`StartIo`) so
"wrong token exits 1" is a unit test, not a subprocess test. Rejected: a bin inside
`packages/mcp` (it would need `@forge/db`, an adapter-to-adapter import).

## Requirements

- Node 24; `pnpm build` first, then `node apps/mcp/dist/main.js`.
- Env: `FORGE_RUN_ID`, `FORGE_RUN_TOKEN`, `FORGE_DB_PATH` (required);
  `FORGE_SEARXNG_URL`, `FORGE_SEARXNG_ALLOW_HOSTS`, `FORGE_FETCH_ALLOW_HOSTS`,
  `FORGE_DOCS_DIRS` (optional; docs dirs use the OS path delimiter, hosts are
  comma-separated).
- An existing Forge SQLite DB, already migrated to the current schema by the Forge server, with the run row and the run's token hash registered by the driver
  (`tx.runTokens.put(runId, sha256(token), now)`). A missing file, a missing `schema_migrations` table or a schema behind the registry exits 1; the process never creates or migrates the file. With no token registration it exits 1.
- A run row that is active (`starting` or `running`, no `ended_at`); anything else exits 1.
- Tests: `pnpm test` at the root.

## Extending

New settings go in `src/schemas/env.ts`, are mapped in `depsFromEnv()`, and need a
matching field in `ForgeMcpDeps` in `@forge/mcp`. Keep `main.ts` thin.

## Limits

- Opens one SQLite connection for the process lifetime and never closes it
  explicitly; the process is per run.
- Never migrates and never registers tokens: the server owns migrations, the driver registers tokens. A revoked or missing token exits 1.
