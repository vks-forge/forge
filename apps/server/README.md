# @forge/server

The Forge server process: wires config and adapters into the Director engine, runs its tick, hosts the hook ingress and serves a small HTTP and SSE API on 127.0.0.1.

## Why it exists

Forge turns requests into merged changes: the Director engine triages an intake event, dispatches a Worker in a git worktree, and verifies and merges what comes back. Something has to be the running process that holds the tick clock, opens the database, starts the Worker harness, answers the Worker's hook calls with signed receipts, and lets a person or the CLI see and steer tickets. Without it the packages are libraries and nothing runs a ticket. It also holds the one secret that must never be on disk: each run's HMAC key for its receipt chain (d-0054). This app is composition only (code.md rule 1): it picks adapters from config, hands them to the engine and the routes, and holds no business rules.

Actors: the Director (the engine), Workers (Claude Code today, through the Claude driver), the user or CLI (HTTP), and the per-run `forge-mcp` process (`apps/mcp`), which shares the SQLite file.

## What it does

- `src/main.ts` (entry, no logic) calls `runServer`. `src/config/` is the only code that reads `process.env` and the yaml files. `src/services/assemble.ts` is the composition root. `src/routes/` holds the endpoints, `src/services/http/` the in-repo router, body reader, SSE and bind guard.
- Startup: validate env, load and validate `.forge/config/forge.yaml` (`ForgeConfig`) and `.forge/project.yaml` (`ProjectConfig`), open SQLite at `.forge/data/forge.db` and run migrations (the server owns them), verify the signed tool catalogue (refuses to start if it does not verify), upsert the project row, start the Worker driver's preflight (its harness build decides whether the native tool pins are trusted, below), build worktrees, memory, report store, the project's `GitHost` (`local` bare repo or GitHub App key from the DPAPI store), the G1 gate (claims also count receipts of the ticket's earlier runs, so a rework run can claim edits a previous run made), the hook handler and the engine, then bind and start the tick.
- Run preparation (`prepareRun`): the engine issues the run token (hash in the database); the app registers the same raw token with a fresh HMAC secret in memory, creates `.forge/data/runs/<runId>/`, and returns the `forge` MCP entry (`node apps/mcp/dist/main.js` with `FORGE_RUN_ID`, `FORGE_RUN_TOKEN`, `FORGE_DB_PATH`) and the hook base URL. The Claude driver writes `hook.json`, `settings.json` and `mcp.json` there.
- Tick: every `engine.tick_interval_ms`, plus a coalesced immediate tick on intake, answered interactions, run events and the first `SessionStart` of a run.
- HTTP, loopback only (any other `FORGE_HOST` is refused with `BindRefusedError`), no auth, no CORS, 1 MiB JSON bodies (hook route 2 MiB: the hook client caps a tool output at 1 MiB), `Host` header must be loopback, keep-alive 65 s (above what pooled clients reuse):
  - `POST /intake`: a core `IntakeEvent`; `202` with the engine's result.
  - `GET /tickets/:id`: ticket, runs, gate results, pending interactions; `404` unknown.
  - `POST /interactions/:id/answer`: `{answer}`; compare-and-swap; `409` when not pending, `404` unknown.
  - `GET /runs/:id/events`: SSE. `id:` is the event `seq`, `event:` its type. Replays after `Last-Event-ID` (or `?after=`), then follows by polling storage (so events written by the MCP process show up), heartbeat comment every 15 s, an `end` event and close once the run has ended and everything was sent; a reconnect after that (cursor at the last event of an ended run) gets `204`, which makes `EventSource` stop.
  - `POST /runs/:id/hook`: the harness hook. `Authorization: Bearer <run token>`; always `200` with the handler's verdict (deny included); the handler fails closed.
  - `GET /health`: status, owner, uptime, live runs, gate jobs in flight; `503` if the database does not answer.
- Errors: `HttpError` and `ForgeError` families map to 400/401/403/404/409/413/415/429. Only an `HttpError` (written for the client) echoes its message; any other 4xx `ForgeError` answers with its family's fixed text, and anything else is a bare `500`, because such messages carry paths, refs and secret names.
- Shutdown on SIGINT/SIGTERM: ask the tick to stop, cancel live runs at once (a tick may be waiting on a run, so it is not awaited first), give the tick and the gate jobs what is left of one `FORGE_SHUTDOWN_GRACE_MS` window, cancel runs a late tick started, end streams, close the port, remove the Director's temp directory, close the database. A second signal exits `130` immediately. Interrupted runs are crash-settled by the next start (d-0054).
- Liveness (d-0033): the first `SessionStart` of a run stores `hook_registered_at` and a `hook_liveness` event (resume, compact and clear do not move it); a `PreToolUse` from a run whose hook never registered is denied `fail_closed_no_liveness` and leaves no receipt.
- Harness isolation: Worker and Director children get an allowlisted environment, not the server's (`FORGE_CATALOGUE_KEY`, `FORGE_GH_*`, API keys and cloud credentials stay out). `FORGE_HARNESS_ENV_PASSTHROUGH` names extra variables (default none; `ANTHROPIC_API_KEY` only for api_key credential mode, d-0031). On Windows a `claude` that resolves to a `.cmd` shim, or is missing, stops startup with the variable to set.

Public API: none; it is an app.

## Why this approach

- `node:http` with a small router and hand-written SSE, no framework (d-0061). Rejected: Hono, Fastify.
- Hook auth is the run's bearer token compared in constant time in `@forge/hooks`; the route only extracts it. The HMAC secret and token live in an in-memory registry and are never persisted (d-0054); a restart kills in-flight runs.
- SSE reads storage, not an in-process emitter, because `apps/mcp` is a separate process that also appends events.
- The Worker driver and the Director model arrive as ports (`ExternalPorts`): production passes the Claude adapters (`createClaudePorts`), the end-to-end test passes a fake harness that still goes through the real hook route, receipts, MCP tools and G1.
- Tool schema hashes: Forge MCP tools are hashed from the real MCP server. Harness-native tools have no live schema source, so the catalogue pin counts only when the driver's `preflight().harnessVersion` equals the entry's `support[harness].harness_version` (the build whose tools were reviewed, 2.1.293 today); on any other build the native hashes are left out, `admit()` denies those tools as `schema_changed`, and the log says "harness version X not reviewed; re-probe and re-sign (d-0053)". After a re-probe, update `harness_version` and re-sign with `node scripts/sign-catalogue.mjs`.
- Tier C globs come from `tier_c_globs` in `project.yaml` (default `.forge/**`, `.claude/**`, `.github/**`), matched ignoring case.
- Port implementations live in adapter packages, not here: the report store in `@forge/gates`, the run secret registry and liveness recorder in `@forge/hooks`, the receipt lookup in `@forge/drivers`, the id source and JSON logger in `@forge/engine`. What stays is wiring, plus `prepareRun`, which is this app's own port to the driver.
- Dependencies: workspace packages, `yaml@2.9.1` (config), `zod@4.6.7`. Dev: `@modelcontextprotocol/sdk@1.32.1` (the fake Worker calls the real MCP server in memory).

## Requirements

- Node 24, pnpm; `pnpm build` at the root, then `node apps/server/dist/main.js` from the repository root (or set `FORGE_ROOT`). The hook client and the MCP server run from `dist/`.
- Env: `FORGE_ROOT` (default: current directory), `FORGE_HOST` (only `127.0.0.1`), `FORGE_PORT` (default 4310, `0` = any), `FORGE_PROJECT_CONFIG` (default `.forge/project.yaml`), `FORGE_CATALOGUE_KEY` and `FORGE_ALLOW_DEV_CATALOGUE_KEY=1` (the committed catalogue is signed with the public dev key), `FORGE_CLAUDE_BINARY` (a real `claude.exe` on Windows), `FORGE_ENGINE` (`acp` or `cli`), `FORGE_SHUTDOWN_GRACE_MS`, `FORGE_HARNESS_ENV_PASSTHROUGH` (comma-separated host variable names a harness child may inherit). `NODE_ENV=test` also allows the dev key.
- Files: `.forge/config/forge.yaml`, `.forge/project.yaml` (with `git_host`; no host means tickets stop in Verifying), `.forge/tools/catalog.yaml`, `.forge/memory/`; written: `.forge/data/forge.db`, `runs/`, `secrets/` (DPAPI blobs for a GitHub App key). The repository must have a `main` (or the host's base) branch and `git` on PATH.
- A logged-in `claude` for live runs. Tests: `pnpm test` (unit and the in-process end-to-end under `__tests__/e2e`, real git, SQLite and `npm`, no model; spawn-heavy files run in the `heavy` vitest project, two at a time, and temp directories are removed when each file ends). Live: `pnpm probes` runs `__tests__/probes/probe8-express-e2e.test.ts` (billable, `FORGE_PROBES=1`). The probe fails at once when the ticket parks (`waiting_human`, `blocked`, `cancelled`), printing the blocked reason, each run's end, the last events and the denied decisions; it always writes its artefacts (ticket, runs, events, receipts, gate results and reports, interactions, server log) to `.forge/data/probes/8/` and keeps the temp fixture on failure.

## Extending

Add a route as `src/routes/<name>.ts` returning a `Route`, list it in `routes/routes.ts`, parse its body with a schema in `src/schemas/`. Add a harness by writing a driver package and a ports factory next to `claude-ports.ts`; `assemble.ts` does not change. New settings go in `src/schemas/env.ts` and `config/load-settings.ts`.

## Limits

- No auth: safe only because it binds loopback and checks `Host`. A shared machine is out of scope (d-0036).
- One project per server process (`project.yaml`); tickets of any other project slug are ignored at intake.
- Only the Express lane runs (engine limit); G1 is the only gate.
- A restart kills in-flight runs and forgets all receipt secrets, so chains of earlier runs can no longer be verified and G1 fails them ("receipt chain unverifiable after restart") so the ticket is reworked on a fresh run.
- Liveness is enforced at the hook route (tool calls denied until `SessionStart` registered), not by killing the run; a Worker that never calls a tool is caught by the stall timer. The fingerprint is derived from run id and session id, not from the hook script.
- The run secret registry keeps the newest 5000 runs; an older run's chain can no longer be verified (G1 fails it).
- A tool call whose input alone exceeds the hook route's 2 MiB (a huge `Write`) is rejected with 413 and so blocked; only outputs are truncated by the hook client.
- Gate reports are written as `.md` under `.forge/data/runs/<runId>/gates/<gate>-<head sha>.md` and never overwritten; nothing prunes old runs. The Director's `forge-director-*` working directory is one per process and removed at shutdown (a crash leaves it in the OS temp directory).
- GitHub App host: wired from config but its live check is probe 9 (not part of this app's tests).
- `GET /runs/:id/events` polls storage every 500 ms per open stream.
