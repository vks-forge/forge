# Build plan — realign the existing code to the product shape

Goal: before any new feature, bring everything already built (M0 slices 1–2,
E2) in line with the product-shape decisions d-0082 … d-0099. No new product
surface in this plan: no web UI, no onboarding wizard, no GitHub manifest
flow, no packaging, no GitHub Issues, no pipelines engine. Those follow in
P2–P5 of `product-shape-change-map.md`.

Each batch below is one builder dispatch (or two when marked), red-green per
d-0015, ends with the orchestrator running the gates itself and one commit.
Workstream ids (W1 …) refer to the change map.

## Ground rules for every batch

- Read `.claude/rules/code.md` first; layers point inward; new ports get a
  contract test run against every adapter.
- Migrations are additive and numbered after 0008; no destructive change to
  existing tables without a data-carrying migration.
- Every touched package README and file header is updated in the same commit.
- Gates run by the orchestrator: `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test` (unit + heavy). Probes where the batch says so.
- Anything that needs a user setting gets an HTTP API now; its screen comes
  in P3 (d-0090). Env vars only for dev/test.
- One commit per batch, pushed to `main` (d-0046).

## Batches

### B0 CI matrix (W18) — S
- `.github/workflows/ci.yml`: windows-latest, macos-latest, ubuntu-latest;
  pnpm 12.6 + Node 24; typecheck, lint, format:check, test.
- Windows-only tests (DPAPI, PowerShell) skip with a reason elsewhere.
- Probes never run in CI.
Accept: workflow green on all three; any Windows-only assumption it surfaces
is fixed in this batch or listed for the batch that owns it.

### B1 Data home and layout (W1) — M
- New data-home resolver (`apps/server/src/config/`, shared with `apps/cli`):
  `%LOCALAPPDATA%\Forge` (macOS/Linux equivalents for later), no user
  override (d-0170); `FORGE_HOME` env for dev/test only.
- Layout: `forge.db`, `secrets/`, `memory/<slug>/`, `worktrees/<slug>/<ticket>`,
  `runs/<id>/`, `backups/`, `logs/`, `server.json`.
- `MCP_ENTRY` and the hook bin resolved from the installed package location,
  not the source tree.
- Floors (`packages/tools/src/domain/floors.ts`, `argv-paths.ts`,
  `shared/path.ts`): protect the data home by absolute path; repo-relative
  `.forge/data` rules removed.
- CLI no longer walks up to `.forge`.
- Dev helper: one-off script that moves this repo's `.forge/data` into a dev
  data home.
Accept: server and CLI start with an empty data home; no code reads
`<repo>/.forge/data`.

### B2 SecretStore extension (W6) — S
- Port gains `delete(name)` and `list(prefix)`; DPAPI + memory adapters;
  contract test covers both.
- Namespaced names: `github/<connection>/key`, `harness/<id>/api-key`,
  `harness/<id>/oauth-token`.
Accept: contract test green on both adapters (DPAPI on Windows).

### B3 Config in the database (W2) — L, two dispatches
Dispatch a — core + db:
- Migration 0009 `config_versions(scope, project, version, doc_json, author,
  reason, created_at)`, immutable rows, newest = current.
- Core: `ConfigSource` port, deep-partial override schemas for `ForgeConfig`
  and `ProjectConfig`, pure `mergeConfig()` (property tests).
- SQLite + memory adapters, contract test.
- Built-in defaults = today's `.forge/config/forge.yaml` values, seeded as
  company version 1.
Dispatch b — engine + server:
- Engine reads effective config through the port each tick; `runs.config_version`
  recorded (migration 0010).
- Server: `GET/PUT /settings/company`, `GET/PUT /projects/:slug/settings`
  (zod-validated, author + reason required, returns the new version).
- Server stops reading `forge.yaml` / `project.yaml`.
Accept: changing a setting through the API changes the next tick's behaviour
without a restart; every run row names the config version it used.

### B4 Many projects per server + manual GitHub connection (W3, W5 manual) — L, two dispatches
Dispatch a — data:
- Migration 0011: `projects` gains `local_path`, `connection_id`,
  `repo_full_name`, `status`, `ecosystems_json`; `runs.project`;
  `github_connections(id, account, app_id, app_slug, key_secret_name, status,
  created_at)`.
- Ticket numbers scoped by prefix (fix `engine/domain/ticket-numbers.ts`).
Dispatch b — runtime:
- `ProjectRegistry` in apps/server builds a per-project runtime
  `{config, gitHost, worktrees, gates, memory, baseRef}`; projects added or
  archived at runtime.
- `EngineDeps.project(slug)` carries worktrees and baseRef; `WorktreeManager`
  takes repo path + worktree root under the data home.
- `DriverRegistry` keyed by harness id (one Claude harness for now).
- API: `POST /projects` (register an existing local clone + git host),
  `GET /projects`, `POST /github/connections` (manual app id + key → SecretStore),
  `GET /github/connections`.
Accept: two projects registered via the API run tickets side by side, each in
its own worktree root, with their own ticket prefixes.

### B5 Any-language checks (W4, gates part only) — M
- Project schema: `checks: [{name, role, command, cwd}]` and `ecosystems`
  replace `profile` + `commands` (supersedes d-0034); config migration of
  existing project docs.
- Gates: run checks by role in list order; `ran_tests` claim matches any
  test-role command; config-guard lists, test-file patterns and test-diff
  rules come from per-ecosystem data (seed: Node/TS, Python, Go, Rust,
  JVM, .NET), overridable per project.
- Lane shell allow-list derived from project checks + ecosystem defaults.
- Worker contract lists checks by role.
Accept: G1 passes/fails correctly on fixture repos for Node, Python and Go
(planted false claim caught in each).

### B6 User-installed harness and auth modes (W7) — L
Starts with probe P-A (below).
- Migration: `harnesses(id, kind, binary_path, version, auth_mode, status,
  last_checked_at)`.
- Resolve `claude` / `claude-agent-acp` from PATH or an override path; drop the
  bundled ACP dependency if P-A allows; clear "not installed" error with the
  install command.
- Auth modes: login (default), API key, OAuth token — key/token read from the
  SecretStore and injected into the allowlisted child env per run.
- Director LLM uses the same resolution and auth.
- API: `GET/PUT /harnesses`, `POST /harnesses/:id/test` (binary, version,
  auth mode, live hello probe). Token entry by paste for now; the
  `setup-token` flow comes with the UI.
Accept: probes 1, 3, 6, 7 green against the installed harness; a run works in
each auth mode that is configured on the dev machine.

### B7 Catalogue in the database + compatibility check (W8) — L
- Catalogue becomes seeded DB data with versions; HMAC signing, the dev key,
  `FORGE_CATALOGUE_KEY` and `scripts/sign-catalogue.mjs` removed;
  `catalogue_hash` stays on runs.
- Migration: `harness_versions`, `harness_tool_schemas` (approved / pending /
  denied).
- `packages/drivers/src/compat/`: compat runner (hooks before first tool, ACP
  event order, permission requests, receipt timing, built-in tool schema
  capture + diff); known-good versions list shipped in code.
- New version seen → compat run; changed tools pending until approved via
  `POST /harnesses/:id/tools/:tool/approve`; failed run pauses the harness.
- Project and ticket grants come from config (fixes `tool-policy.ts:80`).
Accept: the host Claude 2.1.296 passes the compat run and native tools are
admitted again (closes the known limit); a hand-edited schema shows as pending.

### B8 Install token and daemon (W10, no UI yet) — M
- Install token generated on first run (user-only file in the data home),
  required on every route except `/runs/:id/hook` (own run secret) and
  `/health`.
- `forge start` (detached, single-instance lock, `server.json`), `forge status`,
  `forge stop`; `forge` CLI calls the API with the token.
- 127.0.0.1 only stays (d-0093).
Accept: API calls without the token get 401; closing the terminal leaves the
server running; `forge stop` shuts it down cleanly.

### B9 Resume runs across restarts (W11) — L
Needs decision D-1 (below).
- Shutdown marks live runs `interrupted` (session_ref and worktree kept)
  instead of cancelling them into a crash.
- Start: interrupted runs get a new run token + secret generation, rewritten
  hook config, `driver.start({resume: session_ref})`; old tokens refused.
- Receipt chain gets a `resumed` link; G1 verifies across generations.
- Not resumable → retry keeping worktree and receipts.
- `reconcile.ts` crash path kept only for runs with no session_ref.
Accept: probe 8 variant — stop the server mid-run, start it, the run resumes
and the ticket merges with a G1 pass.

### B10 Project memory in the data home (W9 core) — M
- Memory root `memory/<slug>/` as a private git repo, created when a project
  is registered.
- Director-only writer: record files, index rebuild, one commit per change.
- API: list records, approve / reject proposals.
- This repo's `.forge/memory/` stays the dev team's memory (not read by the product).
Accept: triage and dispatch read the project's memory slice from the data
home; a written record appears as a commit in the project's memory repo.

### B11 Scheduling across projects (W12) — M
- Migration: `tickets.priority`, `harness_state(paused_until, reason)`.
- Per-project and per-harness caps in config; round-robin across projects by
  priority (property test: no project starves).
- Quota errors parsed to a reset time → harness parked; wait reason exposed
  on `GET /tickets/:id`.
Accept: with 3 projects and global cap 2, dispatch alternates fairly; a
simulated quota error parks the harness until the reset time.

### B12 TriggerAdapter port (W13 now part) — S
- `TriggerAdapter` port in core; chat intake becomes its first adapter;
  `POST /intake` goes through it. GitHub Issues adapter comes after release.
Accept: intake behaviour unchanged; port contract test green.

### B13 Hygiene and the open known limits — S
- Live rework probe (probe 10): a planted failing check sends the ticket to
  rework and the second run passes (the rework path was never run live).
- Test temp-dir cleanup: helper removes `forge-*` temp dirs; one-off cleanup
  of the ~16 000 leftovers in `%TEMP%`.
Accept: probe 10 green; a full test run leaves no `forge-*` dirs behind.

### B14 Docs realignment (W20) — M
- Rewrite or mark superseded: `execution-plane.md`, `memory-system.md`,
  `self-improvement.md`, `tool-system.md`, `verification-plane.md`,
  `control-room-and-platform.md`, `m0-brief.md`, `v1-scope-review.md`,
  `briefs/engine-e1.md`, `briefs/server-e2.md`, `briefs/claude-driver.md`.
- Update x-0011 (file-based parts superseded by d-0085).
- `PRODUCT.md` status updated.
Accept: no design doc describes `.forge/` files in customer repos, a TS
profile, signed config or restart-kills-runs as current.

## Order and checkpoints

```
B0 ─ B1 ─ B2 ─ B3 ─ B4 ─ B5 ──────────────┐
                    └─ B6 ─ B7 ─ B8 ─ B9 ─┼─ B10 ─ B11 ─ B12 ─ B13 ─ B14
```

| Checkpoint | After | Check |
|---|---|---|
| C1 | B4 | full gates; probe 8 on a project registered via the API in the data home |
| C2 | B9 | full gates; probes 1–9 + restart-resume probe; independent review (Fable) of B0–B9 |
| C3 | B14 | full gates; all probes incl. 10; second review; update PRODUCT.md and memory outcome |

## Probes and decisions needed

- **P-A (before B6):** can `claude-agent-acp` drive the user's installed
  `claude` instead of its own bundled CLI? If not: ACP keeps its pinned
  adapter (installed via npm by the user, found on PATH) and the compat check
  covers the adapter's bundled CLI version; CLI engine uses installed `claude`.
- **D-1 (before B9):** how G1 verifies receipts written before a restart.
  Recommended: store each run's HMAC secret encrypted in the SecretStore for
  the life of the run, delete at settle. Alternative: seal the chain segment
  at shutdown with a final hash signed by the old secret.
- **D-2 (before B8):** install-token hand-off to the browser — decided with the
  UI in P3; B8 only needs the CLI path.

## After this plan

P2 onboarding (manifest flow, detectors, Director chat), P3 control room,
P4 first release — per `product-shape-change-map.md` §4.
