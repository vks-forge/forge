# Brief — E1: engine, DirectorLLM, worktrees (slice 2, items 4–5)

Status: approved 2026-10-13 ("go"). Decisions: d-0025, d-0032, d-0052,
d-0054, d-0055, d-0058 (engine package), d-0059 (always worktree), d-0060
(models). Design: `director-core.md` §2–§8, `execution-plane.md` §7–§8.
E2 (apps/server, HTTP/SSE, G1 claim matcher, GitHost push/PR, end-to-end
Express on a fixture repo) follows after E1 is committed.

## Goal

Everything the Director does between "an intake event exists" and "a run
settled and the ticket moved", as pure orchestration over ports, proven with
fakes; plus the two real adapters it needs (Claude DirectorLLM, git worktrees).

## 1. Core ports and config (packages/core)

- `DirectorLLM` port: `step(name, input, outputSchema: ZodType<T>, opts{model,
  budgetUsd}) → Promise<Result<T, StepError>>` plus `capabilities()`.
- `WorktreeManager` port: `create(ticketId, branch, baseRef) → {path, baseSha}`,
  `remove(path)`, `changedFiles(path, baseSha)`, `commitAll(path, message) →
  sha | null`, `head(path)`.
- `MemorySource` port: `slice(projectSlug) → {decisions[], rejected[]}` (active
  records only, id + statement).
- `Clock` port (now, after) if not already shared; reuse an existing one.
- Config schemas: `ModelMatrix` (role `director|worker` × lane → model; director
  per step), `EngineConfig` (tick interval 30 s, min 10 s; global slots; per-state
  limits; stall ms; re-wake cap 3/h; step retry once). Default
  `.forge/config/forge.yaml` matching d-0060, parsed in a test. No loader IO here.

## 2. @forge/engine (new, inner ring: imports core + tools only)

Skeleton per rule 10, README per rule 10, eslint layer entry, tsconfig refs,
vitest coverage floor 80%.

- **Tick** `tick(deps)`: reconcile → refresh → dispatch, all ticket writes via
  `transition()` + `toTicketPatch` + CAS; `requestTick()` coalesces immediate
  ticks (intake event, run event). No timers inside; the app drives the clock.
- **Intake → ticket**: intake event → ticket (`<PROJECT>-<n>`) → deterministic
  pre-check (`preCheckLane`) → `triage` step (always, d-0025) → lane rule
  (§6: pre-check wins; "quick" hint → Express; confidence < 0.7 → one lane up)
  → `triaged`/`planned`. M0 dispatches **Express only**; other lanes park in
  WaitingHuman with a clear `blocked_reason` (`lane not enabled in M0`).
- **Dispatch**: ready = planned, no unresolved blockers, slot free, per-state
  limit ok → worktree create (`.worktrees/<id>`, branch `<type>/<id>-<slug>`) →
  run row (`starting`, owner, prompt_hash, catalogue_hash) → token issue →
  `dispatch_prompt` step (ticket + memory slice + wake delta) → `driver.start`
  → ticket `in_progress` with assignee/branch/worktree.
- **Run pump**: consumes `driver.events(handle)` → `runEvents.append`, updates
  `last_event_at`, requests a tick on each event; one pump per live run.
- **Reconcile**: stall (no event for stallMs) → `driver.cancel` → settle as
  `stall`; settle finished runs: `driver.result` → run row (`settling` →
  `settled`, usage, cost, error_family, filesTouched from WorktreeManager),
  `final_chain_hash` from `ReceiptLog.list`, token revoke, worktree kept for
  E2 (PR) then removed on Done/Cancelled.
- **Refresh** (result → events): success → `verifying`; `paused` → `asked`
  (WaitingHuman); answered interaction → `response_wake` → new run row with
  `retry_of` (resume = new run); error families → retry wake with backoff
  (`rate_limit` honours `retryNotBefore`) or WaitingHuman for `auth`,
  `policy_denied`, `refused`.
- **Wakes**: idempotent `(ticket, reason, key)` with coalescing; re-wake cap
  3 recovery wakes / ticket / hour; a run that reported done is never re-woken.
- **Restart (d-0054)**: on first tick, `running`/`starting` runs whose owner is
  not this server → crash settle, revoke token, retry wake.
- **Invariant check** each tick: every open assigned ticket has a live run, a
  pending interaction / future wake, or a blocking status; violations are
  returned and logged as events, never silently retried.
- **Steps**: `triage`, `dispatch_prompt`, `steer_reply` with zod output
  schemas; invalid output → retried once with the validation error, then a
  rejected step (logged, no state write). Deterministic overrides around
  `triage` per §5. Models from `ModelMatrix`.
- **Steering**: a `reply` intake on a ticket with a live run → `steer_reply`
  → `runInbox.append` → `driver.steer(handle, text, mode, inboxSeq)`.

## 3. Adapters

- **packages/drivers**: `createClaudeDirectorLLM(deps)` — `claude -p
  --output-format json --json-schema <z.toJSONSchema> --tools ""
  --setting-sources "" --no-session-persistence --permission-prompts none
  --max-budget-usd <n> --model <m>` (verify every flag against `claude --help`
  first; drop or replace any that do not exist and report). Prompt on stdin,
  env stripped like the Worker driver, classify by `subtype` (d-0057), parse
  `structured_output`/`result` with the step schema. One gated live probe.
- **packages/git** (new adapter package): git CLI `WorktreeManager`
  (`git worktree add -b`, `worktree remove --force` + `prune`, diff + untracked,
  commit-all with a Forge author). No shell; args arrays.
- **packages/memory**: `createFileMemorySource(rootDir)` reading
  `.forge/memory/<slug>/decisions|rejected/*.md` front matter (active only).

## 4. Tests

- Contracts: `describeDirectorLLMContract` (fake + Claude adapter on a fake
  `claude` script), `describeWorktreeContract` (fake + git adapter on temp repos).
- Engine scenario tests with fakes (in-memory storage, fake driver, fake LLM,
  fake worktrees, fake clock): intake → triage → dispatch → events → settle →
  verifying; paused → answered → resume as new run; stall → cancel → capped
  retries; rate_limit backoff; restart reconcile; wake coalescing; invariant
  violation surfaced; non-Express lane parked; invalid step output retried once.
- Property test: engine never writes ticket status except via `transition()`.

## Out of scope (E2)

apps/server, HTTP + SSE, G1 claim matcher, GitHost push + PR + bot merge,
end-to-end Express on a fixture repo, escalation signals during a run,
`clarify` / `plan` / `rework_brief` / `epic_summary` steps.
