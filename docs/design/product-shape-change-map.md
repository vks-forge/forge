# Product shape — change map

What has to change in the code and docs so Forge matches the product-shape
decisions of 2026-10-14 (d-0082 … d-0099). Built from a read-only survey of
the repo at `6d2379e`. Each workstream lists the decisions behind it, what
the code does today (with paths), what changes, what it depends on, and a
rough size (S ≤ 3 files, M ≤ 10, L > 10 or new package/schema).

This is a map, not a brief: each phase still gets its own brief before any
code is written.

## 1. Target in one picture

```
npm i -g vks-forge  →  forge start  (background daemon, 127.0.0.1, install token)
                              │
     %LOCALAPPDATA%\Forge     │  data home (choosable on first run)
       forge.db  ─────────────┤  company settings + per-project overrides (versioned rows)
       secrets\  (DPAPI)      │  GitHub App keys, API keys, OAuth tokens
       memory\<slug>\ (git)   │  per-project memory, Director-only writer
       worktrees\<slug>\<id>  │  one worktree per run
       runs\  backups\  logs\ │
                              │
     Web UI  ── the only control surface (settings, projects, agents, approvals)
                              │
     Company ─ GitHub connections (1 App per org, manifest flow)
             ─ Harnesses (user-installed claude / codex …, own login | API key | OAuth token)
             ─ Projects (repo + chosen local folder + role-tagged checks, any language)
                   └─ Tickets ← intake adapters (chat; GitHub Issues next)
```

Today: one server = one repo = one project, config from `<repo>/.forge/*.yaml`,
worktrees in `<repo>/.worktrees`, pinned bundled harness, restart kills runs,
no UI, no CI, not publishable.

## 2. What stays as is

State machine and `transition()`, `admit()` + receipts chain, G1 core logic,
`GitHost` port and the GitHub App adapter (token minting, push env, merge
pinned to gated sha), worktree-per-run (d-0059, only the path moves), DPAPI
store, HTTP server core (node:http, SSE, Host guard, JSON-only bodies), the
`#/` layering and code rules. The local-bare git host stays as a test adapter.

## 3. Workstreams

### W1 Data home and layout — L
Decisions: d-0085, d-0086, d-0098, d-0059 (path).
Today: `apps/server/src/config/paths.ts:24-44` builds every path from the repo
root (`.forge/data/forge.db`, `runs`, `secrets`, `.forge/memory`,
`.forge/tools/catalog.yaml`); `apps/cli/src/main.ts:20-36` walks up to `.forge`;
`paths.ts:105-107` `MCP_ENTRY` is a source-tree-relative path; floors protect
`**/.forge/data` (`packages/tools/src/domain/floors.ts:38-80`,
`argv-paths.ts:111`, `shared/path.ts:11,139`).
Change:
- New data-home resolver: `%LOCALAPPDATA%\Forge` default, chosen on first run,
  stored in a tiny bootstrap file; `FORGE_HOME` env for dev/test only.
- Layout: `forge.db`, `secrets/`, `memory/<slug>/`, `worktrees/<slug>/<ticket>`,
  `runs/<id>/`, `backups/`, `logs/`, `server.json` (pid, port).
- `MCP_ENTRY` and hook bin resolved relative to the installed package.
- Floors: protect the data home by absolute path (Workers' cwd is a worktree
  inside it); drop the repo-relative `.forge/data` rules for customer repos.
Depends on: nothing. Tests: `apps/server/__tests__/helpers/fixture-repo.ts`,
`config/load-settings.test.ts`, tools floor invariants.

### W2 Config in the database — L
Decisions: d-0085, d-0090, code rule 9.
Today: `ForgeConfig` (`packages/core/src/schemas/forge-config.ts`) from
`.forge/config/forge.yaml`, `ProjectConfig` (`core/schemas/project.ts:56-73`)
from `.forge/project.yaml`, loaded once at start by `load-settings.ts:39-65`.
Lanes, lane tools, Worker contract and Director prompts are hard-coded
(`core/domain/lane-triage.ts`, `tools/domain/lane-defaults.ts:152-181`,
`engine/domain/worker-contract.ts`, `drivers/domain/director-step-prompts.ts`).
Change:
- Migration: `config_versions(scope company|project, project, version, doc_json,
  author, reason, created_at)`; the newest row is current; rows are immutable.
- Core: `ConfigSource` port (`company()`, `project(slug)` → effective config +
  version id), override schema (deep-partial of the zod schemas), pure
  `mergeConfig()`.
- Seed: today's `forge.yaml` values become built-in defaults, seeded as
  company version 1.
- Engine reads config through the port each tick (edits apply without a
  restart); `runs` records the config version used (beside `catalogue_hash`).
- Remove yaml loading from the server (yaml export/import comes later, d-0085).
Depends on: W1. Tests: core schema tests, engine rigs (`packages/engine/__tests__/helpers`).

### W3 Many projects in one server — L
Decisions: d-0082, d-0094.
Today: `apps/server/src/services/assemble.ts:50-61,81,88,136,154,159` builds
exactly one project, one `WorktreeManager`, one git host and one `baseRef`;
`EngineDeps` (`packages/engine/src/types/engine.types.ts:50-75`) has single
`worktrees`/`config`/`baseRef`; `runs` has no project column;
`ticket-numbers.ts:14-36` sorts by number and ignores the prefix; one driver
per server (`dispatch-run.ts:157`; `default_harness` never read).
Change:
- `ProjectRegistry` service: loads every active project from the DB and builds a
  per-project runtime `{config, gitHost, worktrees, gates, memory, baseRef}`;
  projects are added or archived at runtime.
- `EngineDeps.project(slug)` returns that runtime; `worktrees`/`baseRef` move
  into it. `WorktreeManager` takes the project's repo path + worktree root.
- Migration: `runs.project`, `projects` gets `local_path`, `connection_id`,
  `repo_full_name`, `status (onboarding|ready|archived)`, `ecosystems_json`;
  prefix stays unique.
- Fix next-ticket-number to scope by prefix.
- `DriverRegistry`: harness picked per agent/lane from config, not one global driver.
Depends on: W1, W2. Tests: engine rigs, worktree contract, server e2e.

### W4 Project onboarding and any-language checks — L
Decisions: d-0083, d-0095 (supersedes d-0034).
Today: `Profile = ts|generic` and fixed `ProjectCommands {test,lint,typecheck,build}`
(`core/schemas/project.ts:21-30`); `gates/domain/project-checks.ts:29,80-83`
runs lint→typecheck→test and skips typecheck on generic, never build;
`claim-check.ts`/`shell-match.ts` match `ran_tests` to `commands.test`;
`config-guard.ts:31-119` and `test-files.ts`/`test-diff.ts` are JS-centred;
`tools/domain/lane-defaults.ts:42-80` hard-codes a shell allow-list;
`worker-contract.ts:29-46` injects the test command.
Change:
- Schema: `checks: [{name, role: test|lint|typecheck|build|format|custom,
  command, cwd}]` replaces `profile` + `commands`; `ecosystems: [...]`.
- New package `packages/onboarding` (adapter ring): ecosystem detectors (Node,
  Python, Go, Rust, Maven/Gradle, .NET, Ruby, PHP, CMake/Make), CI-file reader,
  Director fallback step for unknown repos; verify run of each check on a clean
  checkout.
- Gates: run checks by role in list order; `ran_tests` matches any test-role
  command; config-guard file lists, test-file patterns and test-diff rules come
  from per-ecosystem data (seeded, editable in the UI).
- Lane shell allow-list built from project checks + ecosystem defaults.
- Worker contract lists the project's checks by role.
- Flow: connection + repo (or from scratch) → local folder → clone/create →
  detect → verify → Director onboarding chat → first memory records.
  From scratch: chat picks the stack, scaffold is ticket #1.
Depends on: W3, W5, W9. Tests: gates domain tests, core project schema tests.

### W5 GitHub connections — M
Decisions: d-0083, d-0084, d-0094, d-0096 (Issues permission).
Today: one `GitHostConfig` per project with `app_id`, `installation_id`,
`owner`, `repo`, `key_secret` in `project.yaml` (`core/schemas/project.ts:37-52`,
`apps/server/src/services/git-host.ts:23-58`); `FORGE_GH_*` only in probe 9.
Change:
- Migration: `github_connections(id, account, app_id, app_slug, client_id,
  key_secret_name, webhook_secret_name, created_at, status)`.
- Manifest flow: server route renders the manifest form post to GitHub
  (permissions: contents rw, pull_requests rw, metadata r, issues rw,
  administration w; webhook inactive), callback route on 127.0.0.1 exchanges
  the code (`POST /app-manifests/{code}/conversions`) and stores the key in the
  SecretStore. Manual id + key entry as fallback.
- List installations (`GET /app/installations`) and repos
  (`GET /installation/repositories`); "install on more repos" links to the
  App's install page; rotate key; disconnect.
- Project git host = `{connection_id, installation_id, owner, repo, base_branch}`.
- Repo creation for from-scratch projects: org via `POST /orgs/{org}/repos`;
  personal account to be settled by a probe (fallback: user creates an empty repo).
Depends on: W2, W6. Tests: git github-app tests, probe 9 rewritten to use a connection.

### W6 Secrets — S
Decisions: d-0062, d-0089, d-0087.
Today: `SecretStore` has `get`/`put` only (`core/types/ports/secret-store.types.ts`);
DPAPI store in `.forge/data/secrets`; chosen by `git_host.kind` in `assemble.ts:82-86`.
Change: add `delete` and `list`; namespaced names (`github/<conn>/key`,
`harness/<id>/api-key`, `harness/<id>/oauth-token`); store lives in the data
home; DPAPI always on Windows. `forge secret wrap` stays as a script helper,
the UI is the normal path. macOS Keychain / Linux Secret Service adapters in
the next release.
Depends on: W1. Tests: secrets contract test.

### W7 User-installed harnesses — L
Decisions: d-0087, d-0088 (supersedes d-0053), amends d-0031/d-0032.
Today: ACP spawns the bundled npm dep `@agentclientprotocol/claude-agent-acp`
0.89.1 (`drivers/src/adapters/claude/acp/acp-engine.ts:25-29`, pins in
`drivers/src/schemas/claude-config.ts:22-28`); CLI engine and Director LLM use
host `claude` (`cli-engine.ts:59`, `director-llm.ts:48`); auth = the harness
login only, API key only via `FORGE_HARNESS_ENV_PASSTHROUGH`; no OAuth token
support; preflight drift is only a warning (`assemble.ts:123-128`).
Change:
- Migration: `harnesses(id, kind, binary_path, version, auth_mode
  login|api_key|oauth_token, status, last_checked_at)`.
- Resolve binaries from PATH (`claude`, `claude-agent-acp`, later `codex` …)
  with an override path; show the install command when missing; drop the
  bundled ACP dependency.
- Auth per harness: injects `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`
  from the SecretStore into the child env per run (still allowlisted);
  UI-driven `claude setup-token` flow.
- "Test environment": binary, version, active auth mode, live hello probe.
- Director LLM uses the same harness resolution and auth.
Depends on: W2, W6. Tests: drivers adapter tests, probes 1, 3, 6, 7.

### W8 Harness compatibility check and tool catalogue — M
Decisions: d-0088, d-0085.
Today: native tools in `.forge/tools/catalog.yaml` carry
`harness_version: "2.1.293"`; mismatch → denied as `schema_changed`
(`apps/server/src/services/tool-policy.ts:49-72`); the catalogue is HMAC-signed
(`tools/domain/catalogue.ts`, `scripts/sign-catalogue.mjs`, `FORGE_CATALOGUE_KEY`,
dev key); project/ticket grants never supplied (`tool-policy.ts:80`).
Change:
- Catalogue moves to DB seed data with versions; signing, the dev key and the
  sign script are removed (config is outside every worktree). `catalogue_hash`
  stays on runs.
- Migration: `harness_tool_schemas(harness_kind, version, tool, schema_hash,
  status approved|pending|denied)` and `harness_versions(kind, version, compat
  pass|fail, checked_at)`.
- Compat runner in `packages/drivers/src/compat/` (moved out of
  `__tests__/probes`): hooks fire before the first tool, ACP event order,
  permission requests, receipt timing, capture built-in tool schemas → diff.
  Known-good versions ship with each release and skip the run.
- Changed tools wait for approval in Settings; a failed check pauses the harness.
- Project and ticket grants come from config (W2).
Depends on: W2, W7. Tests: tools catalogue tests, tool-policy test.

### W9 Project memory in the data home — M
Decisions: d-0086, d-0007.
Today: `packages/memory/src/adapters/file-memory-source.ts:88-127` reads only,
from `.forge/memory`; no writer; `projects.memory_repo` unused.
Change: memory root = `memory/<slug>/` git repo per project (created at
onboarding); Director-only writer (record files, index rebuild, one commit per
change); proposals approved/rejected from the UI; opt-in mirror job that opens
a PR copying decisions to a chosen repo path (one-way).
Depends on: W1, W3. Tests: memory adapter tests.

### W10 Daemon, install token, serving the UI — M
Decisions: d-0092, d-0093, d-0091, d-0061.
Today: foreground `node apps/server/dist/main.js`; bind locked to 127.0.0.1
(`http/listen.ts:211-228`), Host guard (`http/router.ts:265-315`), no API auth,
no static route; CLI has only `secret wrap`.
Change:
- `forge start` (detached server, single-instance lock, `server.json`, opens the
  browser), `forge status`, `forge stop`, optional start-on-login; tray later.
- Install token: generated on first run, stored in the data home (user-only
  file), required on every non-hook route; the browser gets it through a
  one-time exchange when `forge start` opens the UI.
- Static route serving the built web UI.
- Keep 127.0.0.1-only, no network-bind setting.
Depends on: W1. Tests: run-server, router tests.

### W11 Resume runs across restarts — L
Decisions: d-0092 (supersedes d-0054).
Today: `engine/tick/reconcile.ts:25-39` crash-settles foreign-owner runs on
the first tick; `shutdown.ts:386-443` cancels every live run; run HMAC secrets
are memory-only (`hooks/src/server/run-secrets.ts`, register throws on
re-register); driver keeps runs in a process Map (`claude-driver.ts:69`), so
`resume()` fails after a restart; hook config file has a fixed server URL and
token (`drivers/src/adapters/claude/run-files.ts:45-46`).
Change:
- Shutdown marks live runs `interrupted` (keeps `session_ref`, worktree).
- Start: for each interrupted run, issue a new run token and secret generation,
  rewrite the hook config, `driver.start({resume: session_ref})`; old tokens refused.
- Receipt chain gets an explicit `resumed` link; G1 verifies across generations.
- Not resumable → retry with the same worktree and receipts.
- Open point: G1 needs the pre-restart HMAC secret to verify earlier receipts —
  persist it in the SecretStore, or seal the chain segment at shutdown.
Depends on: W1, W6. Tests: hooks run-secrets, engine reconcile, server e2e.

### W12 Scheduling: layered limits, fair queue, quota waits — M
Decisions: d-0097, d-0080.
Today: `engine/tick/dispatch.ts:91-146` picks wakes, then planned tickets by
number; caps = `global_slots` + `max_concurrent_by_state`; no priority, no
per-project or per-harness caps.
Change: `tickets.priority` migration; per-project and per-harness caps in
config; round-robin across projects by priority; `harness_state(paused_until,
reason)` from parsed quota errors; wait reasons shown in the UI; fallback list
(d-0080) when a harness is parked.
Depends on: W2, W3, W7. Tests: engine dispatch tests (property tests for fairness).

### W13 Intake adapters — S now, M later
Decisions: d-0096, amends d-0002.
Today: `POST /intake` with `IntakeEvent` (`core/schemas/intake.ts:41-51`); no
`TriggerAdapter` port.
Change now: `TriggerAdapter` port in core; chat becomes the first adapter.
Later (after first release): GitHub Issues adapter — poll per project, label
filter, author allow-list (others wait for approval), status comments, PR link.
Depends on: W3 (later: W5).

### W14 Notifications — S
Decisions: d-0079.
Today: none. Change: `Notifier` port, inbox table + UI badge (source of truth),
Windows toast adapter. Depends on: W10, W15.

### W15 Control room UI (slice 3, re-scoped) — L
Decisions: d-0090, d-0010, all of the above.
Today: `apps/web` is an empty stub.
Change: first-run wizard (data folder → harness check → GitHub connection →
first project); projects list + create/onboard; project board, ticket thread,
live run view; inbox; Settings (company: harnesses and auth, GitHub
connections, models, limits, catalogue approvals, notifications, backups and
updates; project: overrides, checks, memory mirror); memory view with
proposal approvals. Every setting has a screen. Hallmark + Nielsen applied.
Depends on: W2–W12 APIs (built screen by screen alongside them).

### W16 Packaging as `vks-forge` — M
Decisions: d-0091, d-0099.
Today: root `software-factory`, every package private `0.0.0`, build = `tsc -b`
only, bins `forge` (cli), `forge-mcp`, `forge-hook` resolved inside the monorepo;
native `better-sqlite3`.
Change: publishable package `vks-forge` with bin `forge`; bundle step (one new
dev dependency, bundler TBD in the brief) that inlines private `@forge/*`
packages and ships the web build, MCP entry and hook bin; `better-sqlite3`
stays an npm dependency (prebuilds); release workflow + version check source.
Depends on: W1, W10, W15.

### W17 Backups and safe updates — M
Decisions: d-0098.
Change: daily snapshot (SQLite online backup, memory repos, encrypted secrets;
no worktrees), keep 7, export/restore (UI + `forge restore`); npm version
check shown in the UI; first start of a new version: backup → pause/resume
runs → migrate → roll back on failure.
Depends on: W1, W10, W11.

### W18 CI matrix — S
Decisions: d-0089.
Today: no `.github/` at all.
Change: GitHub Actions on windows, macos, ubuntu: typecheck, lint,
format:check, unit + heavy tests; DPAPI/PowerShell tests run on Windows only
(skip with reason elsewhere); probes stay manual.
Depends on: nothing. Do first.

### W19 Agents and pipelines engine (x-0011) — L
Decisions: d-0066 … d-0081, now stored per d-0085.
Today: none; lanes and steps hard-coded.
Change: agent and pipeline rows in the DB, generic graph runner, typed
artifacts, reviewers, script gates, replay + canary, scorecards (separate brief).
Depends on: W2, W3, W7, W15.

### W20 Docs and memory
Rewrite or mark superseded the parts flagged by the survey:
`execution-plane.md` (signed `.forge/` tree, `.worktrees`), `memory-system.md`
(memory in repo), `self-improvement.md` (`.forge/skills`, `.forge/agents`,
signing), `tool-system.md` (signed catalogue, grants/floors yaml, project.yaml
MCPs), `verification-plane.md` (`profile: ts|generic`), `control-room-and-platform.md`
(`.forge/` tree, worktree path), `m0-brief.md`, `v1-scope-review.md`,
`briefs/engine-e1.md`, `briefs/server-e2.md`, `briefs/claude-driver.md`.
READMEs of every package touched (rule 10). Update x-0011 (its file-based parts
are superseded by d-0085).

## 4. Order

| Phase | Workstreams | Exit |
|---|---|---|
| P0 Foundations | W18, W1, W6, W2, W3 | CI green on 3 OSes; server runs N projects from DB config in the data home |
| P1 Harness and safety | W7, W8, W10, W11 | installed harness + auth modes + compat check; daemon with install token; a run survives a restart |
| P2 Onboarding | W5, W9, W4, W13 (port) | connect GitHub, onboard a repo of any language, Director chat seeds memory |
| P3 Control room | W15, W12, W14 | every setting and flow in the UI; fair queue; notifications |
| P4 First release (Windows) | W16, W17, W20 | `npm i -g vks-forge` → `forge start` → full ticket on a fresh machine |
| P5 After release | W13 GitHub Issues, W19, macOS/Linux adapters, exe | — |

Dogfood (old slice 4) moves to the end of P2: this repo is onboarded as a
project through the new flow. The old slice-3 plan is replaced by P3.

## 5. Open points to settle in the phase briefs

1. Resume and G1 (W11): persist per-run HMAC secrets encrypted, or seal the
   receipt chain at shutdown.
2. ACP on the installed harness (W7): whether `claude-agent-acp` can run the
   user's installed `claude` instead of its own bundled CLI — probe it.
3. `claude setup-token` (W7): PTY-driven like Paperclip (native PTY dependency)
   or "run it in your terminal and paste the token".
4. Install-token hand-off to the browser (W10).
5. W19 before or after the first release (first release could ship the fixed
   Express/Standard/Full flow).
6. Repo creation in a personal GitHub account (W5) — probe.
7. Bundler choice for `vks-forge` (W16).
