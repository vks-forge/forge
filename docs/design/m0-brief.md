# M0 brief — walking skeleton

Status: finalized 2026-10-12 (d-0020..d-0039; grill + enhance pass)
Exit criterion (d-0037): **one dogfood ticket on this repo goes Inbox → Done
through the Claude driver with G1 green**, visible on the Board, with
receipts, a PR merged by the factory bot, and an `outcomes/` record.

## 0. Preconditions

| # | Item | Owner | Status |
|---|---|---|---|
| P1 | Private GitHub remote `https://github.com/vks-forge/forge` (org `vks-forge`) (d-0021) | user | done 2026-10-13 |
| P2 | `git init -b main`, first commit `56e0551` pushed, `.gitignore` with `.worktrees/`, `.factory/data/`, `.factory/memory/*/.index/`, `research/raw/`, `.hyperresearch/` | orchestrator | done 2026-10-13 |
| P3 | GitHub App `forge-software-factory-bot` (App ID 5290233, Installation 170713738; Contents/PRs/Checks/Statuses RW, Metadata R) installed on the repo; private key at `.factory/data/secrets/github-app.pem` (ignored). Dispatcher mints installation tokens; DPAPI wrap of the key in slice 2. Rulesets unenforced on free org → dispatcher merge policy is the control. | user created, orchestrator wires | key saved; wiring pending |
| P4 | Claude Code ≥ 2.1.295 logged in on subscription (have 2.1.296) | done | ok |
| P5 | Node 24, pnpm 12 | done | ok |

## 1. Repo layout (d-0009, x-0003, d-0039)

```
apps/server         engine tick, drivers, Factory MCP server, HTTP + SSE, hooks runtime
apps/web            React control room (assistant-ui threads)
apps/cli            thin client: factory new | doctor | run | answer   (after the HTTP API)
packages/core       ticket state machine, lane rules, schemas, admission function (pure)
packages/db         StorageAdapter + Drizzle; sqlite driver first
packages/drivers    claude (ACP + CLI fallback); others M0.5
packages/gates      G1 (receipts, claim matcher, test-diff, TDD-order, lint, types), G3 (existing suite)
packages/memory     reader/writer for .factory/memory/<slug>/, decisions/rejected slice
packages/tools      catalogue loader, floors, grants, renderers, receipt hooks
.factory/           skills/ agents/ tools/ rules/ (committed) · memory/<slug>/ data/ (ignored)
.worktrees/         per-ticket worktrees (ignored)
```

Test stack: vitest, eslint, tsc, prettier; `pnpm test | lint | typecheck |
format:check` at root; coverage 70% on `packages/core`.

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
2. Receipt hooks (`node hook.js`, exec form) + Factory MCP server
   (`get_ticket`, `add_comment`, `ask_director`, `report_blocked`,
   `finish`, `web_search` over SearXNG, `docs_lookup`) with per-run token.
3. `packages/drivers/claude`: ACP engine + CLI fallback, per-run files under
   `.factory/data/runs/<id>/`, resume matrix, stall/kill/retry by
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
- Bind `127.0.0.1` only, no auth, refuse other binds (d-0030).
- Standard/Full lanes open; `apps/cli` thin client.
- Exit: a Standard ticket with one `ask` is answered from Needs-you and
  completes.

### Slice 4 — dogfood

- Register this repo as project `SF` (`project.yaml`, `profile: ts`), move
  `.factory/memory/` → `.factory/memory/software-factory/` as its own git
  repo (d-0039).
- First ticket: a small real change to the factory (e.g. a `factory doctor`
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
