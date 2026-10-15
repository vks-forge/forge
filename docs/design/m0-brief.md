# M0 brief — walking skeleton

> **Status (2026-10-15).** Historical build plan for the walking skeleton.
> Superseded by the product-shape decisions and `build-plan.md` (B0 to B14):
>
> - `profile: ts | generic` and `project.yaml` (slice 1): replaced by
>   role-tagged checks and ecosystems found at onboarding, held as versioned
>   database settings (d-0095 supersedes d-0034; d-0085).
> - `.forge/data/`, `.forge/memory/`, `.worktrees/` and the `.gitignore`
>   entries for them (P2, P3, slices 1 to 2): the data home
>   `%LOCALAPPDATA%\Forge` holds the database, secrets, per-project memory
>   repos, runs and worktrees; customer repos hold no Forge files (d-0098,
>   d-0086, d-0085).
> - Signed catalogue verified from the main checkout (slice 1): a versioned
>   catalogue in the database, no signing (d-0085, B7).
> - Registering this repo as project `forge` through `project.yaml` (slice 4):
>   done through the project API and onboarding flow instead (d-0083, d-0095).
> - "Restart kills runs" (d-0054) and the pinned CLI (d-0053): resume after
>   restart (d-0092, d-0100) and the user's installed harness with a per-install
>   compatibility check (d-0087, d-0088, d-0101).
> - The `forge new | doctor | run | answer` commands: not built; the UI is the
>   control surface (d-0090).

Status: finalized 2026-10-12 (d-0020..d-0039; grill + enhance pass)
Exit criterion (d-0037): **one dogfood ticket on this repo goes Inbox → Done
through the Claude driver with G1 green**, visible on the Board, with
receipts, a PR merged by the factory bot, and an `outcomes/` record.

## 0. Preconditions

| # | Item | Owner | Status |
|---|---|---|---|
| P1 | Private GitHub remote `https://github.com/vks-forge/forge` (org `vks-forge`) (d-0021) | user | done 2026-10-13 |
| P2 | `git init -b main`, first commit `56e0551` pushed, `.gitignore` with `.worktrees/`, `.forge/data/`, `.forge/memory/*/.index/`, `research/raw/`, `.hyperresearch/` | orchestrator | done 2026-10-13 |
| P3 | GitHub App `forge-software-factory-bot` (ids in `.forge/data/secrets/`, not in docs; Contents/PRs/Checks/Statuses RW, Metadata R) installed on the repo; private key at `.forge/data/secrets/github-app.pem` (ignored). Dispatcher mints installation tokens; DPAPI wrap of the key in slice 2. Rulesets unenforced on free org → dispatcher merge policy is the control. | user created, orchestrator wires | key saved; wiring pending |
| P4 | Claude Code ≥ 2.1.295 logged in on subscription (have 2.1.296) | done | ok |
| P5 | Node 24, pnpm 12 | done | ok |

## 1. Repo layout (d-0009, x-0003, d-0052, d-0044)

```
apps/server         engine tick, drivers, HTTP + SSE, receipt-hook ingress
apps/mcp            standalone stdio process hosting the Forge MCP server; wires SQLite into @forge/mcp (d-0052)
apps/web            React control room (assistant-ui threads)
apps/cli            thin client: forge new | doctor | run | answer   (after the HTTP API)
packages/core       ticket state machine, lane rules, schemas, admission function (pure)
packages/db         StorageAdapter on raw portable SQL (SqlDriver seam, no ORM); sqlite driver first (d-0047)
packages/drivers    claude (ACP + CLI fallback); others M0.5
packages/gates      G1 (receipts, claim matcher, test-diff, TDD-order, lint, types), G3 (existing suite)
packages/memory     reader/writer for .forge/memory/<slug>/, decisions/rejected slice
packages/tools      catalogue loader, floors, grants, renderers, receipt hooks
.forge/           skills/ agents/ tools/ rules/ (committed) · memory/<slug>/ data/ (ignored)
.worktrees/         per-ticket worktrees (ignored)
```

Test stack: vitest, eslint, tsc, prettier; `pnpm test | lint | typecheck |
format:check` at root; line-coverage floors per package (70% core and db, 80% tools, mcp, hooks,
drivers and apps/mcp) are set in `vitest.config.ts`.

## 2. Slices (d-0036)

Each slice: red-green TDD (d-0015), gates green, commit report to the user,
user says go. Orchestrator dispatches builder subagents per package; gates run
by the orchestrator, never trusted from a subagent's report.

### Slice 1 — core + db

- `packages/core`: `Ticket`, `Run`, `Lane`, `Tier`, `IntakeEvent`,
  `WorkerDriver` / `RunRequest` / `RunHandle` / `RunResult` types; ticket
  state machine as pure `(ticket, event) → ticket'` with `status_version`
  CAS; lane triage rule (deterministic pre-check part); ids `<PROJECT>-<n>`;
  branch name builder `<type>/<id>-<slug>`; `project.yaml` schema with
  `profile: ts | generic` (d-0034).
- `packages/db`: `StorageAdapter` interface; sqlite driver (WAL, single
  writer); migrations for `projects, tickets, ticket_relations,
  intake_events, wake_requests, runs, run_events, run_inbox, interactions,
  gate_results, tool_decisions, tool_effects, skills_registry, skill_usage`.
- Exit: state machine property tests pass; adapter contract test runs against
  sqlite; a second in-memory driver proves the seam.
- Commit requires P1 + P2.

### Slice 2 — preflight probes, then engine + Claude driver

**Probes first** (each a vitest that shells out; any failure changes the
driver's shape before engine code is written):

1. `claude -p` with `--setting-sources` excluding `user` and `project` still
   authenticates on the subscription (d-0031).
2. A `--settings` file with a `SessionStart` + `PreToolUse` hook
   (`onFailure: "block"`, `timeout`) fires inside `-p` and blocks a denied
   call (d-0033).
3. `@agentclientprotocol/claude-agent-acp` starts, reports `account` auth,
   honours `allowDangerouslySkipPermissions: false`, `strictMcpConfig`, and
   `settings` via `_meta.claudeCode.options`; `session/request_permission`
   reaches our client (d-0035).

**Then build**, in order:

1. `packages/tools`: catalogue loader (signed yaml, verified from main
   checkout HEAD), floors, lane grants, capability gate, call-time rules with
   the simple tokenizer (d-0038), one `admit()` function, decision + effect
   receipts (HMAC, `prev_hash` chain), checkpoint-before-mutate via the
   worktree manager.
2. Receipt hooks (`node hook.js`, exec form) + Forge MCP server, a separate
   stdio process composed in `apps/mcp`, not hosted by `apps/server` (d-0052)
   (`get_ticket`, `add_comment`, `ask_director`, `report_blocked`,
   `finish`, `web_search` over SearXNG, `docs_lookup`) with per-run token.
3. `packages/drivers/claude`: ACP engine + CLI fallback, per-run files under
   `.forge/data/runs/<id>/`, resume matrix, stall/kill/retry by
   `errorFamily`, refusal detection from result text.
4. `DirectorLLM` adapter (d-0032) + `triage` and `dispatch_prompt` and
   `steer_reply` steps with schema validation.
5. Engine tick (reconcile → refresh → dispatch), wake requests, re-wake cap,
   invariant check; S0 registry rows written from the per-run HOME build.
6. Minimal HTTP: `POST /intake`, `GET /tickets/:id`, `POST
   /interactions/:id/answer`, SSE `/runs/:id/events` with `Last-Event-ID`.
   Express-only dispatch until slice 3 (unattended `deny`).
- Exit: a scripted Express ticket runs end to end on a fixture repo; hook
  liveness preflight passes; every tool call has a chained receipt; G1
  claim matcher catches a planted false claim.

### Slice 3 — control room

- `apps/web`: Board (columns from `director-core.md` §4, cards with id, lane,
  tier, type, harness, cost est.), Ticket (assistant-ui thread, gate strip,
  diff, memory slice, tools exposed, run list), Needs-you (interactions, Tier
  B/C approvals, timeouts), Settings (default harness, per-agent credential
  mode and config dir, model matrix `role × lane`). Hallmark + Nielsen pass
  per screen before build. Lift Paperclip board / thread / approval card
  (x-0004).
- Bind `127.0.0.1` only, no auth, refuse other binds (d-0036).
- Standard/Full lanes open; `apps/cli` thin client.
- Exit: a Standard ticket with one `ask` is answered from Needs-you and
  completes.

### Slice 4 — dogfood

- Register this repo as project `forge`, ticket prefix `FG` (`project.yaml`,
  `profile: ts`; x-0010), move `.forge/memory/` → `.forge/memory/forge/` as
  its own git repo (d-0044).
- First ticket: a small real change to the factory (e.g. a `forge doctor`
  check), Express lane, PR opened and merged by the bot, `outcomes/` written.
- Exit = M0 exit.

## 3. M0.5 — driver wave (d-0037)

Codex (`codex-acp`, native Windows sandbox), OpenCode (ACP), Pi (`pi-acp`),
generic ACP. One PR each; `preflight()` reports `missing binary` until the
harness is installed; Claude installs each with user confirmation after the
Claude loop works.

## 4. Metrics from day one

Lane distribution and escalation rate; prompt-to-merged per lane vs raw Claude
Code on the same task; re-proposal rate (memory §11); triage calls that
changed the pre-check lane (d-0025); subscription turns per window
(d-0032); receipts per run and `enforced_by` mix; rollback count.

## 5. Open items carried into M0

- Probe outcomes (slice 2) may change the driver shape; budget a day.
- `LongPathsEnabled=0` on this host: setup check warns; keep ticket ids
  short.
- `--permission-prompt-tool` bridge on the CLI lane unverified; CLI fallback
  is Express-only until then.
- G3 = existing suite only; hidden intent tests deferred.
- `claude-agent-acp` Windows login flow unverified until probe 3.
