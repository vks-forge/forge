# @forge/mcp

The `forge` MCP server: the only tools a Worker gets from Forge itself, built from ports so any process can host it.

## Why it exists

A Worker runs inside a third-party harness (Claude Code first) and has no business
touching Forge's database, the git host or the open web directly. It still needs to
read its ticket, leave a note, ask a human, say it is stuck, declare itself done, and
look things up. Without one governed door for that, each harness would get ad-hoc
access, none of it would pass through the admission hooks, and a prompt-injected web
page could aim the Forge host at its own network.

This package is that door. Every call is `mcp__forge__<tool>`, so it goes through the
same hooks and `admit()` chokepoint as native tools. The Director reads what the
tools store (questions, blockers, claims); the driver starts one server per run with a
per-run token; the harness's own web tools stay denied so web access exists only here.

## What it does

Public API (`src/index.ts`): `createForgeMcpServer(deps)` (verifies the run token and
that the run is active (`isRunActive` from `@forge/core`: `starting` or `running`, no `ended_at`), returns an unconnected `McpServer`), `serveStdio(server)`,
`withDefaultNetwork(deps)` (fills in the production DNS resolver, address-pinned transport and `fetch`; only the composition root calls it),
`verifyRunToken(storage, runId, token)`, `hashToken()` (re-exported from `@forge/tools`, as is the constant-time compare),
`toolSchemaHash()`, `computeToolSchemaHashes()`, `FORGE_TOOLS`,
`Claim` (re-exported from `@forge/core`, where the schema now lives so the gates share it), and the dependency type `ForgeMcpDeps`.

| Tool             | Risk      | What it stores or does                                                                                                                                                                                                  |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_ticket`     | read      | Own ticket (with relations and own runs), or its parent or a blocker alone (no relations). Others are refused.                                                                                                          |
| `add_comment`    | write-cwd | `text` run event on the run (own ticket only).                                                                                                                                                                          |
| `ask_director`   | write-cwd | Pending `interactions` row (kind `question`) plus an `ask` event; Worker must stop. Refused while the run already has a pending interaction.                                                                            |
| `report_blocked` | write-cwd | Same, with interaction kind `blocked` (and the `ask` event kind `blocked`); the Director escalates the lane on it.                                                                                                      |
| `finish`         | write-cwd | One `finish` event per call: summary plus `claims` (`ran_tests`, `edited`, `added_test`, `read`). A later call supersedes an earlier one (the last event wins) until the run settles; after that every tool is refused. |
| `web_search`     | network   | Nothing. SearXNG JSON search (1 MB capped stream), base URL must be loopback or allow-listed; result wrapped in the untrusted-content envelope.                                                                         |
| `docs_lookup`    | read      | Nothing. Markdown under configured docs dirs by path or glob (at most 8 wildcards, runs collapsed, walk capped), size-capped, no network.                                                                               |
| `web_fetch`      | network   | Nothing. SSRF-guarded GET to text, 2 MB, 10 s, wrapped in an untrusted-content envelope.                                                                                                                                |

"write-cwd" is the closest declared risk class for state writes; they touch Forge
state, not the working directory (resource `forge-state`). Every call re-checks that
the run is still active; failures return MCP tool errors and never throw out of the
process. The process that hosts it is `apps/mcp` (`forge-mcp`).

## Why this approach

- `@modelcontextprotocol/sdk` 1.32.1 (exact pin, latest stable). Its zod peer range is
  `^3.25 || ^4.0`, so the workspace's zod 4.6.7 works unchanged. Rejected:
  hand-rolled JSON-RPC (protocol drift, no schema generation).
- SearXNG on localhost: keyless, no fees, no rate limits, and the base URL check means
  a mis-set env var cannot send queries to a third party. Rejected: hosted search APIs
  (keys, cost, data leaving the box); the harness's built-in WebSearch (denied, and
  returns nothing here).
- SSRF guard: resolve DNS first (inside the call's time box), refuse if any answer is private, dial the vetted IP
  (defeats rebinding), re-validate every redirect (max 5), refuse an https to http redirect, and reach only ports 80/443
  (8080/8443 when the host is in `FORGE_FETCH_ALLOW_HOSTS`). Rejected: validating the
  hostname string only, and letting the HTTP client resolve again.
- Catalogue in the database (built-in seed `BUILT_IN_CATALOGUE` in `@forge/tools`, d-0085): each tool's `schema_hash` is
  taken from the schema the server advertises, so a silently widened tool is
  quarantined. A test fails on drift. This package never reads the catalogue itself; the
  server builds each run's policy from the database and the MCP process only serves tools.
- Token hashes live in `StorageAdapter` (`tx.runTokens.getHash(runId)`, a core port), so this
  package needs no database of its own (code.md rule 1) and no private token port. The check
  is a constant-time compare (`@forge/tools` `constantTimeEqual`) of `sha256(token)`; a missing, revoked or unreadable hash is a
  refusal. Only the hash is stored: the receipt HMAC secret is not known to this process.

## Requirements

- Node 24; `pnpm build` before any live run (`apps/mcp/dist/main.js` is the entry).
- Env, read only by `apps/mcp`: `FORGE_RUN_ID`, `FORGE_RUN_TOKEN`, `FORGE_DB_PATH`,
  `FORGE_SEARXNG_URL` (optional), plus optional `FORGE_SEARXNG_ALLOW_HOSTS`,
  `FORGE_FETCH_ALLOW_HOSTS`, `FORGE_DOCS_DIRS`.
- SearXNG at `http://localhost:8888` for `web_search` (docker container
  `searxng-openclaw`).
- Catalogue: no signing step. After a change to a tool's schema, copy the hash the catalogue test prints into the seed (`packages/tools/src/domain/catalogue-seed-forge.ts`) and the mirror `.forge/tools/catalog.yaml`.
- Tests: `pnpm test` at the root (coverage floor 80% lines).

## Extending

1. Add `src/domain/tools/<name>.ts` with `defineTool({...})`, its input shape in
   `schemas/tool-inputs.ts`, and append it to `FORGE_TOOLS`.
2. Add a `mcp__forge__<name>` entry to the built-in catalogue (`@forge/tools` `catalogue-seed-forge.ts` and the mirror `.forge/tools/catalog.yaml`: declared `risk`,
   `exposure`, `resources`, `support`), and add the id to the lane in `@forge/tools`
   `lane-defaults`. The catalogue test fails until the hashes match; an existing database
   keeps its saved catalogue, so add the entry there with `PUT /settings/catalogue` too.

## Limits

- The domain never selects real network code: `web_fetch` and `web_search` refuse to run unless `resolve`/`transport`/`searchFetch` are in the deps, which `apps/mcp` fills via `withDefaultNetwork`. Tests inject stubs.
- The driver must register `hashToken(token)` with `tx.runTokens.put(...)` before launching
  `forge-mcp`; with no (or a revoked) registration the process refuses to start.
- Run-event `seq` is allocated by storage (`runEvents.append` takes the event without `seq`),
  so tool events and driver events share one gap-free sequence.
- `report_blocked` is stored with the `blocked` interaction kind (it used to be a `question` tagged `payload.subtype`).
- No blocking wait for answers, no per-project fetch allow-list source yet (env only),
  no query logging beyond the harness's own tool receipts.
