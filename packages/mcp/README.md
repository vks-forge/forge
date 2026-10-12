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
that the run is `running`, returns an unconnected `McpServer`), `serveStdio(server)`,
`createRunTokenAuthority(store)`, `createMemoryTokenStore()`, `hashToken()`,
`toolSchemaHash()`, `computeToolSchemaHashes()`, `DEV_CATALOGUE_KEY`, `FORGE_TOOLS`,
`Claim`, and the port types (`RunTokenStore`, `RunTokenAuthority`, `ForgeMcpDeps`).

| Tool             | Risk      | What it stores or does                                                                   |
| ---------------- | --------- | ---------------------------------------------------------------------------------------- |
| `get_ticket`     | read      | Own ticket, parent, blockers, own runs. Other tickets are refused.                       |
| `add_comment`    | write-cwd | `text` run event on the run (own ticket only).                                           |
| `ask_director`   | write-cwd | Pending `interactions` row (kind `question`) plus an `ask` event; Worker must stop.      |
| `report_blocked` | write-cwd | Same, tagged `payload.subtype = "blocked"`; the Director escalates the lane on it.       |
| `finish`         | write-cwd | One `finish` event: summary plus `claims` (`ran_tests`, `edited`, `added_test`, `read`). |
| `web_search`     | network   | Nothing. SearXNG JSON search, base URL must be loopback or allow-listed.                 |
| `docs_lookup`    | read      | Nothing. Markdown under configured docs dirs by path or glob, size-capped, no network.   |
| `web_fetch`      | network   | Nothing. SSRF-guarded GET to text, 2 MB, 10 s, wrapped in an untrusted-content envelope. |

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
- SSRF guard: resolve DNS first, refuse if any answer is private, dial the vetted IP
  (defeats rebinding), re-validate every redirect (max 5). Rejected: validating the
  hostname string only, and letting the HTTP client resolve again.
- Signed catalogue (`.forge/tools/catalog.yaml`, d-0038): each tool's `schema_hash` is
  taken from the schema the server advertises, so a silently widened tool is
  quarantined. A test fails on drift.
- Token hashes live behind a `RunTokenStore` port because this package may not open
  databases (code.md rule 1) and `runs` has no token column.

## Requirements

- Node 24; `pnpm build` before any live run (`apps/mcp/dist/main.js` is the entry).
- Env, read only by `apps/mcp`: `FORGE_RUN_ID`, `FORGE_RUN_TOKEN`, `FORGE_DB_PATH`,
  `FORGE_SEARXNG_URL` (optional), plus optional `FORGE_SEARXNG_ALLOW_HOSTS`,
  `FORGE_FETCH_ALLOW_HOSTS`, `FORGE_DOCS_DIRS`. `FORGE_CATALOGUE_KEY` is read by the
  signer script only.
- SearXNG at `http://localhost:8888` for `web_search` (docker container
  `searxng-openclaw`).
- Catalogue: `pnpm build && node scripts/sign-catalogue.mjs` refreshes hashes and
  signs; without `FORGE_CATALOGUE_KEY` it uses the public INSECURE dev key and warns.
- Tests: `pnpm test` at the root (coverage floor 80% lines).

## Extending

1. Add `src/domain/tools/<name>.ts` with `defineTool({...})`, its input shape in
   `schemas/tool-inputs.ts`, and append it to `FORGE_TOOLS`.
2. Add a `mcp__forge__<name>` entry to `.forge/tools/catalog.yaml` (declared `risk`,
   `exposure`, `resources`, `support`), add the id to the lane in `@forge/tools`
   `lane-defaults`, then run the sign script. The catalogue test fails until hashes
   and signature match.

## Limits

- `@forge/db` must add a `run_tokens(run_id, token_sha256)` table (migration) and the
  driver must insert `hashToken(token)` before launch; `apps/mcp` fails closed
  without it.
- Run-event `seq` is allocated as max+1 inside a transaction; it can collide with a
  driver that numbers events itself (the append then fails with a tool error).
- `report_blocked` is stored as a `question` interaction because core's interaction
  kinds are closed; a `blocked` kind in core would remove the tag.
- No blocking wait for answers, no per-project fetch allow-list source yet (env only),
  no query logging beyond the harness's own tool receipts.
