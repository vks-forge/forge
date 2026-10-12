# @forge/mcp-server

The `forge-mcp` process: reads env, opens SQLite, and serves `@forge/mcp` over stdio for one run.

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
- `src/services/start.ts`: `parseEnv()`, `depsFromEnv()` (opens SQLite through
  `@forge/db`, builds the token authority), `start()` (serve, or print to stderr and
  exit 1 on any startup failure).
- `src/services/sqlite-token-store.ts`: reads `run_tokens.token_sha256` for a run.
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
- A migrated Forge SQLite DB with the run row and a `run_tokens` table (see
  `packages/mcp/README.md`, Limits).
- Tests: `pnpm test` at the root.

## Extending

New settings go in `src/schemas/env.ts`, are mapped in `depsFromEnv()`, and need a
matching field in `ForgeMcpDeps` in `@forge/mcp`. Keep `main.ts` thin.

## Limits

- Opens one SQLite connection for the process lifetime and never closes it
  explicitly; the process is per run.
- Does not create or migrate the database, and does not register tokens (the driver
  does).
