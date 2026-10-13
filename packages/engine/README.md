# @forge/engine

The Director's engine: tick, dispatch, settle and the model steps, as pure orchestration over ports.

## Why it exists

The Director is the one writer that turns "someone asked for something" into "a Worker ran in a
worktree and the ticket moved". Its guarantee is that no ticket is silently lost and no run is
started twice, and that guarantee only holds if the sequence is decided in one place: intake
becomes a ticket, triage names its lane, dispatch starts a Worker run, the run pump stores the
Worker's events, and when the run ends the ticket moves on or is retried or is handed to a human.
Without this package that logic would sit in `apps/server` (which must only compose) or in `core`
(which must stay types and pure rules), and could not be tested against fakes (d-0058).

Actors: the app (`apps/server`) owns the clock and the HTTP side and calls the engine; the engine
talks to storage, the Worker driver (Claude Code today), the Director's own model (`DirectorLLM`),
git worktrees, project memory and the receipt chain, all through ports.

## What it does

Public API from `src/index.ts`:

- `createEngine(deps)` returns an `Engine`:
  - `tick()`: reconcile, refresh, verify, dispatch, then the invariant sweep; single-flight (a call during
    a tick returns that tick's `TickReport`). The engine has no timers; the app calls `tick()` every
    `engine.tick_interval_ms` (30 s) and whenever `deps.onTickRequested` fires.
  - `requestTick()`: coalesced "tick soon" request; also made by intake, every run event and every
    finished run.
  - `ingest(event)`: stores an intake event (deduped) and maps it: `new_request` to an `inbox`
    ticket (`<PROJECT>-<n>`), `reply` to the answer of the one pending question or to a queued
    steering message for the live run.
  - `answerInteraction(id, answer)`: CAS answer, queues the `response_wake`.
  - `cancelTicket(id)`: `cancelled` through `transition()`, cancels the live run, removes the worktree.
  - `liveRunIds()`.
- Per tick: restart reconcile on the first tick (runs owned by another server are crash-settled,
  tokens revoked, retry wake queued, d-0054); settle finished runs; cancel runs silent for
  `stall_ms` and settle them as `stall`; expire overdue questions (ticket to `blocked`); deliver
  steering replies (`steer_reply` step, then `run_inbox`, then `driver.steer`); triage `inbox`
  tickets (pre-check, `triage` step, lane rule); verify finished work (below); dispatch ready tickets (worktree, `dispatch_prompt`
  step, run row and token hash, `driver.start`, ticket `in_progress`).
- Verify phase (`tick/verify*.ts`, up to `max_concurrent_by_state.verifying` tickets per tick), for a
  `verifying` ticket whose current run succeeded and whose project `deps.project(slug)` resolves:
  `commitAll` (Forge author), `GitHost.push`, `openPr` once (the number is stored on the ticket by CAS
  before any gate runs), then every gate of the project's `ProjectRuntime` with a `GateContext`
  (claims come from the run's `finish` run event). Each report goes through `deps.reports.put`, each
  verdict is a `gate_results` row. All `passed`/`skipped`: `gate_passed` with `tier_actual` (C when
  the diff touches the project's `tier_c_globs`, else the predicted tier), tier A then `prStatus`,
  `merge(squash)`, `merged` (which makes the ticket `done`), worktree removed and branch deleted
  (failures logged only); tier B/C stop in `review` / `needs_signoff`. Any `failed`: `gate_failed`
  (rework run with `retry_of`, the findings carried by a `continuation` wake into the
  `dispatch_prompt` input as `wake.gate_findings`), and at the rework cap the ticket parks naming the
  gate. A gate that cannot run or a git host fault is classified by `ForgeError` family: transient
  ones retry after the failure-policy backoff (counted by the hourly re-wake cap), the rest park.
  `TickReport.verified` lists each outcome.
- Pure rules, also exported: `decideLane`, `decideFailure`, `findViolations`, `nextTicketNumber`,
  `requestWake`.
- Run settle records status, usage, cost, error family, the files git says changed, the receipt
  chain's last hash and revokes the token; the worktree is kept for the PR step.

## Why this approach

- Inner ring (d-0058): imports `@forge/core` and `@forge/tools` only; every effect is a port. The
  same code runs on SQLite and the real harness in the app and on in-memory fakes in tests.
- One door for ticket state (code.md rule 6): every change is a plan of events run through
  `transition()` and stored by CAS on `status_version` (`tick/ticket-moves.ts`). "Park for a human"
  is one `parked` event (reason becomes `blocked_reason`), not a status write and not a fake
  `dispatched` + `asked`. A property test pins it.
- Resume is a new run (d-0055): a run with `ended_at` is never reopened; `retry_of` links the chain.
- Failure policy by error family (`domain/failure-policy.ts`, config `engine.retry`):
  `auth`, `policy_denied`, `refusal`, `budget`, `invalid_input` never retry; `rate_limit` waits for
  the harness's reset time, else exponential backoff (`base_ms * 2^(n-1)`, capped by `max_ms`, up to
  `max_attempts`); `crash` and `unknown` retry after `delay_ms` up to `max_attempts` (1 each);
  `stall` retries after `delay_ms` up to `max_attempts` (2). Past a cap the ticket parks in
  `waiting_human` with the family in `blocked_reason`. At most `rewake_cap.max` (3) recovery wakes per
  ticket per `window_ms` (1 h), then it parks.
- M0 dispatches Express only (d-0059, brief E1): a ticket triage puts in another lane parks in
  `waiting_human` with "lane not enabled in M0".
- Director steps (`triage`, `dispatch_prompt`, `steer_reply`) use the model matrix and
  `step_budget_usd`; off-schema output is retried once with `previous_error`, then rejected (logged,
  held off one tick interval, no state written).
- One merge door (code.md rule 6): `tick/verify-merge.ts` is the only caller of `GitHost.merge`, and
  only for a ticket in `verifying` with `tier_actual = A` (set only by `gate_passed`) and an open PR.
  Verify is resumable from stored facts (PR number, `gate_results`, `tier_actual`, `prStatus`).
  Parking from `verifying` has no legal event, so it goes through `gate_failed` (+ `parked`): the
  state machine stays the only door.
- Alternatives rejected: engine in `apps/server` (breaks "apps compose only"); timers inside the
  engine (the app owns the clock, so tests move a fake one).

## Requirements

- Node 24, pnpm. Runtime deps: `@forge/core`, `@forge/tools`, `zod`.
- `EngineDeps` (see `src/types/engine.types.ts`): storage, driver, llm, worktrees, memory, receipts,
  `reports` (a `ReportStore`), `project(slug)` (a `ProjectRuntime`: config, `GitHost`, gates; null = the
  project's tickets stay in Verifying), clock, `config` (a parsed `ForgeConfig`, from `.forge/config/forge.yaml`), `ids`, `owner`
  (this server's name), `baseRef`, `catalogueHash`, optional `mcpIdentity`, `onTickRequested`, `log`.
- No env, files or processes are touched here. Tests: `pnpm test` (scenarios in
  `__tests__/scenarios`, pure rules in `__tests__/domain`, the status-write property in
  `__tests__/property`); coverage floor 80% lines.

## Extending

- A new Director step: add its name and output schema in `@forge/core` (`schemas/steps.ts`), add the
  model to the matrix, then call `runStep` from the phase that needs it (see `tick/triage.ts`).
- A new lane: change `triage.ts` (the Express-only park) and `dispatch-run.ts` (model per lane
  already comes from the matrix); the lane rule itself is in `domain/lane-rules.ts`.
- A new failure family rule: `domain/failure-policy.ts` plus its config in `engine.retry`.
- Never write ticket status elsewhere; add events to `core`'s state machine and plan them through
  `ticket-moves.ts`.

## Limits

- Process-local by design: live run pumps, step/dispatch holds and queued steering replies. After a
  restart pumps are gone (runs are crash-settled) and holds reset. The requester's hint, type and
  title are read from the stored intake event (`intakeEvents.get`), so they survive a restart.
- Ticket numbers come from listing every ticket id of the project (no counter); fine at M0 scale.
- Failure attempts count failed runs of the same family for the ticket, with no decay.
- `driver_version` on run rows is the constant `unversioned` until the driver exposes it cheaply.
- Parking a verify fault burns one automatic rework (`gate_failed` increments `rework_count`), and a
  human release restarts the Worker (`unparked` goes to `planned`); a dedicated Verifying-to-WaitingHuman
  event in `core` would fix both. Verify retry backoff is a process-local hold (a restart retries at
  once, the re-wake cap still counts). A PR opened but not stored (a crash in between) is not found
  again. Gate findings reach the rework prompt through the wake's `reason` text (4,000 chars max).
- Not in the engine: `apps/server` (HTTP, SSE, clock), in-run
  escalation signals, the `clarify`, `plan`, `rework_brief` and `epic_summary` steps, `command`
  intake, `delegated`/`monitor` wakes (consumed and dropped; `continuation` is the gate-failed rework).
