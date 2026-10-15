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
    steering message for the live run. The engine does not know ticket sources: which sources may
    reach `ingest` is decided by the app's trigger registry (`apps/server`), so unregistered
    sources never get here.
  - `answerInteraction(id, answer)`: CAS answer, queues the `response_wake`.
  - `cancelTicket(id)`: `cancelled` through `transition()`, cancels the live run, removes the worktree.
  - `liveRunIds()`, `gateJobsInFlight()` (gate runs executing beside the tick).
- Per tick: restart reconcile on the first tick (runs owned by another server are crash-settled,
  tokens revoked, retry wake queued, d-0054); settle finished runs; cancel runs silent for
  `stall_ms` and settle them as `stall`; expire overdue questions (ticket to `blocked`); deliver
  steering replies (`steer_reply` step, then `run_inbox`, then `driver.steer`); triage `inbox`
  tickets (pre-check, `triage` step, lane rule); verify finished work (below); dispatch ready tickets (worktree, `dispatch_prompt`
  step, run row and token hash, `driver.start`, ticket `in_progress`).
- Verify phase (`tick/verify*.ts`, up to `max_concurrent_by_state.verifying` tickets per tick), for a
  `verifying` ticket whose current run succeeded and whose project `deps.project(slug)` resolves:
  `commitAll` (Forge author), `GitHost.push`, `openPr` once (after `findPr` finds no open PR for the branch; the number is stored on the ticket by CAS
  before any gate runs), then the project's gates as a background job (below) on exactly the pushed
  commit (`worktrees.head`, stored as `gate_results.head_sha`), with a `GateContext` (claims come from the run's `finish` run event). Each report goes through
  `deps.reports.put` (named `<gate>-<head sha>.txt`, so a re-gate of a new head never replaces an earlier report), each verdict is a `gate_results` row. All `passed`/`skipped`: the PR head must equal
  the judged sha, else nothing merges and the new head is gated again (at most 3 re-gates per run, then
  a park); then `gate_passed` with `tier_actual` (C when the diff touches the project's `tier_c_globs`,
  else the predicted tier; the diff tier must still equal it at merge), tier A then `merge(squash, judgedSha)`
  (`HeadMovedError` = re-gate, not a park; `mergeable: null` waits under the rate-limit backoff, never merges blind),
  `merged` (which makes the ticket `done`), worktree removed and branch deleted
  (failures logged only); tier B/C stop in `review` / `needs_signoff`. Any `failed`: `gate_failed`
  (rework run with `retry_of`, the findings carried by a `continuation` wake into the
  `dispatch_prompt` input as `wake.gate_findings`), and at the rework cap the ticket parks naming the
  gate. A gate that cannot run or a git host fault is classified by `ForgeError` family: transient
  ones retry after the failure-policy backoff (counted by the hourly re-wake cap), the rest park.
  `TickReport.verified` lists each outcome.
- Gate jobs (`tick/gate-jobs.ts`): the gates can run for half an hour, so the tick that publishes
  starts a job (in-memory, keyed by ticket and run, one per key) and returns; the job writes only
  `gate_results` rows, then calls `requestTick()`; the next tick consumes it and applies the outcome
  (rework, merge, retry, park) through the usual CAS moves. A restart loses in-flight jobs; with no rows
  for the run the next tick gates again. Tickets with a job in flight count toward `max_concurrent_by_state.verifying`.
- Settings snapshot (`tick/tick-config.ts`, d-0085): each tick starts with one read of `deps.config`
  (`company()` plus `project(slug)` for every registered project) and every phase reads that snapshot
  (`ctx.config`), never the source, so an edit saved between ticks applies to the next tick as a whole
  with no restart and never half-applies inside one. Company dials (limits, retries, models) come
  from `ctx.config.forge`; project settings (commands, profile, git host, `tier_c_globs`) overlay the
  `ProjectRuntime.config` the app built and drive triage, tier computation, the Worker contract and the gates.
  Each run row stores `config_version` (`c<company>:p<project>`). If the source cannot be read or a stored
  override no longer validates, the tick is skipped with a `load config` error in its report and nothing
  starts. `requestWake` outside a tick reads the current company settings for the re-wake cap.
- Many projects (d-0082): every step takes its project's runtime (`runtimeFor`), never a shared one: worktrees are
  created, diffed, committed and removed through `runtime.worktrees` of the ticket's project, gates and the git host
  likewise, and a run row records its `project`. Ticket numbers count per prefix (`nextTicketNumber(ids, prefix)`).
  Only a `ready` project runs work: intake for an `archived` project is ignored, and tickets of archived or onboarding
  projects never spend a run slot. The harness is chosen per ticket from the project's effective `default_harness`
  (`driverFor`); the run keeps its driver (`Pump.driver`) for steering, cancelling and results. A harness with no
  registered driver is a typed `invalid_input` error and the ticket is parked with the reason (`tick/dispatch-park.ts`),
  never run on another harness.
- One base branch per project (`tick/project-runtime.ts`): `git_host.base_branch` drives the worktree base, the
  diff base and the PR target; the runtime's `baseRef` only serves projects without a host. A runtime
  whose `config.slug` is another project is refused (logged as a tick error, nothing published).
- The `dispatch_prompt` input carries `worker_contract` (`domain/worker-contract.ts`), and the same rules are appended to the returned prompt verbatim under `## Rules of this run` so a paraphrase cannot drop them: the cwd is already the worktree (never `cd`), one shell command per call (compound lines are denied unattended), the project's exact test command, and the Worker must end
  with `finish` and a typed claim for every file it edited (G1 fails a finish without; a later `finish` replaces an earlier one), plus a rework
  note after a failed gate.
- Pure rules, also exported: `decideLane`, `decideFailure`, `findViolations`, `nextTicketNumber`,
  `requestWake`.
- Process-edge helpers the app plugs in, kept here so `apps/server` holds no port implementation: `createIdSource()` (the `IdSource`: random `run-`/`wake-`/`int-` ids and 256-bit base64url run tokens from the OS random source), `createOwnerId()`, and `createJsonLogger(write, min?, now?)` (one JSON line per log call, never throws, redacts fields whose names look like credentials).
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
  A verify fault no retry fixes (auth, merge conflict, retry cap, no gates) is a `parked` event from
  `verifying`: `rework_count` is untouched and `parked_from = verifying` makes a human `unparked`
  return the ticket to `verifying`, so publish, gates and merge re-run on the same run with no new
  Worker. Gate findings still go through `gate_failed` (rework, or park at the cap, which releases
  to `planned`). A ticket with no stored PR number asks the host (`findPr`) before `openPr`, so a
  crash between opening and storing the PR adopts it instead of opening a duplicate.
- Alternatives rejected: engine in `apps/server` (breaks "apps compose only"); timers inside the
  engine (the app owns the clock, so tests move a fake one).

## Requirements

- Node 24, pnpm. Runtime deps: `@forge/core`, `@forge/tools`, `zod`.
- `EngineDeps` (see `src/types/engine.types.ts`): storage, `drivers` (a core `DriverRegistry`), llm, memory, receipts,
  `reports` (a `ReportStore`), `project(slug, settings)` (the project's `ProjectRuntime`: config, `GitHost` or null,
  gates, `worktrees` of its own clone and `baseRef`; null = unknown or archived project; `settings` is the project's
  `ProjectConfigView` of this tick so the app can rebuild a runtime whose git host settings changed), clock, `config`
  (a `ConfigSource`: the settings in the database, read once at the start of each tick, see below), `ids`, `owner`
  (this server's name), `catalogueHash`, optional `mcpIdentity`, `onTickRequested`, `log`.
- No env, files or processes are touched here (the id source reads only OS entropy). Tests: `pnpm test` (scenarios in
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
- A running Worker keeps the limits it was started with (budget, stall time); a settings edit reaches runs started on the next tick. The stall scan itself uses the current `stall_ms`. Run rows predating migration 0010 have no `config_version`.
- Ticket numbers come from listing every ticket id (no counter); fine at M0 scale. Candidates of different projects are ordered by ticket number only, so projects are not yet scheduled round-robin (per-project limits come later, d-0097).
- A project with no git host has a runtime (worktrees, base) but its tickets wait in Verifying: there is nowhere to publish.
- Failure attempts count failed runs of the same family for the ticket, with no decay.
- `driver_version` on run rows is the constant `unversioned` until the driver exposes it cheaply.
- Gate jobs, the re-gate counter and verify holds are process-local. A job that finishes after its ticket was
  cancelled leaves its rows behind (harmless) and is pruned on a later tick. The re-gate publishes the worktree
  head: a head someone else pushed to the branch is overwritten or the push is refused (the push fails
  the verify, which retries or parks); the engine never merges a head it did not gate.
- Verify retry backoff is a process-local hold (a restart retries at
  once, the re-wake cap still counts). Gate findings reach the rework prompt through the wake's `reason` text (4,000 chars max).
- Not in the engine: `apps/server` (HTTP, SSE, clock), in-run
  escalation signals, the `clarify`, `plan`, `rework_brief` and `epic_summary` steps, `command`
  intake, `delegated`/`monitor` wakes (consumed and dropped; `continuation` is the gate-failed rework).
