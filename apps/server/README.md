# @forge/server

The Forge server process: wires config, adapters and the Director engine, and exposes HTTP and SSE. Not implemented yet; this app has only a `package.json`.

## Why it exists

Forge is an autonomous development org: the Director engine turns intake into tickets and dispatches them to Workers running in harnesses like Claude Code. Something has to be the running process that holds the engine tick, opens storage, starts drivers, hosts the Factory MCP server and receipt hooks Workers talk to, and serves the control room and CLI. Without it the packages are libraries with nothing running tickets. This app is composition only: it wires `@forge/core`, `@forge/db`, `@forge/drivers`, `@forge/tools` and the rest, and holds no business logic.

## What it does

Intended role, from `docs/design/m0-brief.md` and `control-room-and-platform.md` (none of it exists yet):

- Engine tick: reconcile, refresh, dispatch, with wake requests and an invariant check.
- Minimal HTTP: `POST /intake`, `GET /tickets/:id`, `POST /interactions/:id/answer`, and SSE `/runs/:id/events` replaying from `Last-Event-ID` using the `run_events` sequence number.
- Hosts the Factory MCP server and the hook runtime that Workers use, with a per-run token.
- Binds `127.0.0.1` only, with no auth, and refuses other binds (`docs/design/m0-brief.md`; the decision record d-0030 that set it is superseded, so confirm before relying on it).
- Entry point will be `src/main.ts`, the only place with side effects.

Public API: none; it is an app.

## Why this approach

- Apps are composition only; adapters are picked by config, never by `if` (one interface, many adapters).
- Stack: TypeScript pnpm monorepo, SQLite WAL, Bifrost gateway, Phoenix traces (d-0009). Resumable SSE is built here because no surveyed library provides it.
- Director is a deterministic engine plus finite LLM steps, not a long-lived LLM session (d-0003, r-0003).
- Workers never push or hold git credentials; the dispatcher pushes and the factory bot merges by policy (d-0012).
- Dependencies: none yet.

## Requirements

- Node 24.20 and pnpm. Nothing is required today: no source, no tests, no env vars.
- Intended: a logged-in `claude` CLI, a private GitHub remote and the GitHub App key kept under gitignored `.forge/data/secrets/` (never committed), the tool catalogue under `.forge/tools/`, and project config under `.forge/`.
- Build and test follow the root scripts once source exists.

## Extending

Add routes under `src/routes/`, wiring under `src/services/` and config loading under `src/config/`, with `main.ts` as the only entry. Add behaviour by wiring a new adapter, not by branching on a harness name.

## Limits

- Not implemented yet: no source, no HTTP API, no engine tick, no tests.
- `none yet` for dependencies, env vars and configuration.
