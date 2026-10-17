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
  - `postCardMessage(cardId, text, author)`: stores a `user_message` on an open card (`stored` with the event, `not_found`, `closed`) and stores the owed reply in the durable `card_reply_queue` (same transaction) for the next tick's `card_chat` Director step (d-0109, d-0134); `cardDirector(cardId)` is `thinking` while queued or running, `error` after a failed reply until the next message, else `idle` (process-local). The step (`tick/card-chat.ts`, before triage) is given the card, its last 30 events, tickets with run state, pending questions, spend against the budget cap, the allowed actions and the project memory slice, all as one JSON input the driver fences as data. Its `{reply, actions}` output is parsed against `CardChatOutput`; each action runs only through an existing door (`tick/card-chat-actions.ts`): `create_ticket` through the intake inserter (`tick/ticket-insert.ts`, so it is numbered, `inbox`, linked and triaged the same tick), `steer_run` through `steerRun` on the live run of one of the card's own tickets (author `director`), `change_type` by the PATCH rule, `suggest_close` as a `close_suggested` event only. An executed action writes `director_action` in the same transaction; a refusal (type forbids it, closed card, the card is still grilling, verifying or awaiting plan approval, ticket of another card, no live Worker, same or unknown type) writes a `note`; the reply is then written as `director_message` with `actions_taken`. Invalid output or a model failure sets `error` and writes a plain `note`; the tick never crashes.
  - `ingest(event)`: stores an intake event (deduped) and maps it: `new_request` to a card
    (`<PROJECT>-C<n>`, type from the payload's `card_type`, default `issue`, checked against the
    card type registry and its allowed sources; unknown or refused is `ignored`) in phase
    `grilling` with a `user_message` event and a queued Director reply (`card_created`), and no
    ticket. Only a type that starts tickets at intake (`pr_issue`, the PR fast path) also makes an
    `inbox` ticket (`<PROJECT>-<n>`) linked by `card_id` with a `ticket_created` event; its card
    starts `queued` and no Director turn is queued. `reply` goes to the answer of the one pending
    question or to a queued steering message for the live run. The engine does not know ticket
    sources: which sources may reach `ingest` is decided by the app's trigger registry
    (`apps/server`), so unregistered sources never get here.
  - `createCard(input)` (`tick/card-create.ts`, the create-card form): validates the type (it must
    take chat) and the dependencies, creates the card in `grilling` with the title and description as
    the first `user_message`, and queues the Director's reply, in one transaction; a repeated
    `dedupe_key` returns the first card (`duplicate`). Refusals are typed results, not throws:
    `project_not_found`, `project_archived`, `invalid_type`, `card_not_found` (a dependency id that
    is no card), `cross_project_dependency`, `dependency_cycle` with the loop (`findCycle`). No ticket.
  - `setCardRelations(cardId, {depends_on, blocks, actor})`: replaces the card's dependency edges
    (the set is complete: an edge left out is removed) after the same checks, and writes a `note`.
  - Card planning (`tick/card-planning.ts` and `planning-*.ts`, d-0130 to d-0150): a card of a planned type (not Discussion, not a fast-path type) in `grilling`, `verifying` or `plan_ready` is planned instead of chatted with. When planning starts the card snapshots the effective flow (`flow_json`, cursor, config revision); each tick the runner claims the card's queued turns and walks the flow from the cursor, one Director call per step, each step recorded in one transaction (`step_started`, `step_finished` with files read and config version, the grill state, the cursor), until a step needs the owner or the flow ends. Default flow: `survey` (read rounds), `grill` (one question per turn, options, one recommended, `open_points`, limits per round), `verify` (read rounds, pins HEAD), `enhance` (standard and full lanes; its owner questions are asked one at a time), `write_plan` (versioned plan, decisions and verification filled by the engine, diff from the previous version), `approve`. Reads: the survey and verify steps answer `read_requests`; the engine runs each through `admit()` (`admitDirectorRead`, `@forge/tools`) and `deps.repoReader` (git-tracked files at HEAD only), under `read_caps`, and calls the step again with `read_results`, two rounds at most. The approval floor (`checkFloor`, facts from other approved cards' plans and git) runs first; only a passing plan with approval mode `director_or_user` reaches the tool-less `approve_plan` step, which sees the plan, the typed findings and the floor result only. Otherwise the card goes to Needs you with `approve_plan` and `request_changes`. Director step spend counts on the card (`director_spend_usd` in the grill state, `budget_warning` once per level, never a block). A failing step writes a note and leaves its queued turn claimed, so it is retried when the claim goes stale (10 minutes); `planning sweep` (`tick/planning-sweep.ts`) queues the first turn of planned cards with no flow (a converted Discussion) and nudges an unanswered question after 24 hours (never answers it).
  - Planning doors (all return typed `status` results, never throw for a wrong moment; `retryPlanningStep(cardId, author)` answers `retried`, `not_found` or `phase_mismatch` when the card is not stopped on a budget failure): `answerGrill(cardId, {question_id, option_id | text}, author)` (`answered`, `question_not_open` 409, `invalid_answer`), `grillShortcut(cardId, 'use_recommendations' | 'write_plan_now', author)` (`applied`, `phase_mismatch` 409), `approvePlan(cardId, version, author)` (`approved` with `ticket_ids`, idempotent per version; `stale_plan` and `phase_mismatch` 409; `plan_not_found`), `requestPlanChanges(cardId, version, comment, author)` (`requested`, `invalid_comment`, `stale_plan`, `phase_mismatch`), `editPlanTickets(cardId, version, {tickets, order?}, author)` (`edited` with the new owner version, `ticket_has_dependents` 409, `unknown_ticket`, `invalid_order`, `empty_plan`, `stale_plan`, `phase_mismatch`), `startPlanning(cardId, author)` (`started`, `phase_mismatch`, `not_plannable`), `runAsExpress(ticketId, author)` (`released`, `not_held` 409), and the reads `cardPlans(cardId)` (versions, current plan, floor computed now) and `cardPlan(cardId, version)`. Approval (`tick/plan-to-tickets.ts`) files the plan's tickets dependencies first (priority urgent 3, high 2, normal 1, low 0; `blocked_by` from the plan keys), moves the card through `transitionCard()`, and gives each ticket `triaged` with the stricter of the plan lane and `preCheckLane` (Tier C files make it Tier C); a planned Standard or Full ticket is parked with the wait reason `pipeline_pending` and a `needs_you` event offering `run_as_express`.
  - `answerInteraction(id, answer)`: CAS answer, queues the `response_wake`.
  - `cancelTicket(id)`: `cancelled` through `transition()`, cancels the live run, removes the worktree.
  - `interruptRun(runId)`: shutdown path (`tick/interrupt.ts`). Marks a live run `interrupted`
    with its harness session (`resumable_session`, from the `session_ref` the pump stores as the
    harness reports it) and `interrupted_at`, flags its pump so no tick settles the stream that
    ends because of the stop, then `driver.cancel`s the harness. Token, worktree and receipts are
    kept; a run whose result already arrived is left to settle normally.
  - `explainWait(ticketId)`: why a ticket has not started, as one line (`quota: claude-code until 14:20 UTC`,
    `cap: per-project 1/1`, `deps: PAY-231`), or null; read-only, from the same decision dispatch makes.
  - `liveRunIds()`, `gateJobsInFlight()` (gate runs executing beside the tick).
- Per tick: restart reconcile on the first tick (`tick/restart.ts`, d-0092): a run lost without a
  shutdown (foreign owner, still `starting` / `running` / `settling`) that had reported a session
  is recorded as `interrupted`, one with none is crash-settled. Then, every tick, interrupted runs
  are resumed within the scheduler's limits (`pickNext` with the global, per-project and
  per-harness caps and any quota pause, d-0097; a run that does not fit stays `interrupted` and the
  invariant sweep counts it as explained). A resume is done on the same row: generation + 1,
  a new token (`runTokens.reissue`, the old hash dies), `hook_registered_at` cleared, then
  `driver.start({ ...req, resume: session, generation })` with a continue prompt (`RESUME_PROMPT`).
  A run that cannot be resumed (no session, a harness that cannot resume, worktree moved, ticket
  ended, `start` throws, or the resumed harness ends before reporting anything) is settled
  `interrupted -> settled` with error family `crash` and a `retry` wake with reason `resume_failed`,
  so the ticket continues as a new run in the same worktree. A lost run with no session is
  crash-settled as before (wake reason `crash`). Resumes queue at their ticket's priority on the same
  rotation cursor as new starts and read the schedule without consuming wakes or pauses (dispatch does
  that once per tick). A start that fails before the app wrote the chain's `resumed` link gives the
  generation back (the receipt chain must read 1, 2, 3 without a gap for G1); a link that was written
  keeps it. Each run is resumed on its own: a throw while resuming one (a project runtime that cannot be built, a store error) is recorded as a tick error `resume <runId>` and logged, the run stays `interrupted` for the next tick, and the other runs still resume; runs of an unservable project are skipped before that. The continue prompt tells the Worker that a tool call refused as `server_draining` (the server was stopping) is to be made again. The report lists `resumed`, `resumeFailed` and `crashed`. Then settle finished runs (skipping interrupted pumps); cancel runs silent for
  `stall_ms` and settle them as `stall`; expire overdue questions (ticket to `blocked`); deliver
  steering replies (`steer_reply` step, then `run_inbox`, then `driver.steer`); triage `inbox`
  tickets (pre-check, `triage` step, lane rule); verify finished work (below); dispatch ready tickets (worktree, `dispatch_prompt`
  step, run row and token hash, `driver.start`, ticket `in_progress`). A `driver.start` that throws
  `HarnessChangedError` (the installed harness build is not the one whose approvals were loaded,
  family `policy_denied`) settles the run and parks the ticket with the error's own text, which starts
  with `harness_changed:`, instead of the generic family reason.
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
  (`company()` plus `project(slug)` for every registered, non-archived project; archived projects are
  never read) and every phase reads that snapshot
  (`ctx.config`), never the source, so an edit saved between ticks applies to the next tick as a whole
  with no restart and never half-applies inside one. Company dials (limits, retries, models) come
  from `ctx.config.forge`; project settings (checks, ecosystems, git host, `tier_c_globs`) overlay the
  `ProjectRuntime.config` the app built and drive triage, tier computation, the Worker contract and the gates.
  Each run row stores `config_version` (`c<company>:p<project>`); a company save that lands between the
  company read and the project reads is detected (each project view names the company version it was
  merged from) and the read is repeated, so the recorded version is exact, and a read that never settles
  marks the mismatched projects unservable for that tick. If the company settings cannot be read the tick is
  skipped with a `load config` error and nothing starts. A project whose stored override no longer validates
  is only that project's problem: it lands in `TickConfig.unservable` (slug to reason), is reported in the
  tick `errors` as `project config <slug>` with the reason and through `engine.unservableProjects()` (the
  server shows it as `config_error` on `GET /projects`), and is skipped by triage, verify, dispatch and resume
  while every other project is reconciled, settled and dispatched as usual.
  `requestWake` outside a tick reads the current company settings for the re-wake cap.
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
- The `dispatch_prompt` input carries `worker_contract` (`domain/worker-contract.ts`), and the same rules are appended to the returned prompt verbatim under `## Rules of this run` so a paraphrase cannot drop them: the cwd is already the worktree (never `cd`), one shell command per call (compound lines are denied unattended), the project's exact test command (or the several test-role commands, any of which counts), the other checks listed by role (lint, typecheck, build, ...; the gates re-run all of them), and the Worker must end
  with `finish` and a typed claim for every file it edited (G1 fails a finish without; a later `finish` replaces an earlier one), plus a rework
  note after a failed gate.
- Scheduling across projects (d-0097; `domain/pick-next.ts`, `tick/schedule.ts`, `tick/dispatch.ts`): dispatch reads
  one plan (waiting tickets, due wakes, live runs, parked harnesses, the tick's settings) and `pickNext` chooses.
  Rules: due wakes (retry, resume, rework) go before new tickets; inside each group projects take turns in id
  order, starting after the project that got the last slot (`state.schedulerCursor`), so with any slot at all every
  project with work reaches the front within as many ticks as there are projects; inside a project the highest
  `priority` goes first, then the lowest ticket number. A candidate is skipped, with a stated reason, when it has
  unfinished blockers, its harness is parked, or starting it would pass a limit: global (`max_concurrent_global`,
  default 2), per project (`max_concurrent_per_project`, default 1; a project's own `max_concurrent` can only lower
  it), per harness (`max_concurrent_per_harness`, `by_id` over `default` 2), or `max_concurrent_by_state.in_progress`.
  Blocked and parked tickets sit out of the rotation so they never spend a project's turn. A ticket held by a
  failing step (`dispatch:` / `dispatch_prompt:` holds) is removed before the choice.
- Quota waits (`tick/quota.ts`, `domain/harness-choice.ts`): a run that ends with the `quota` error family (the
  drivers classify "no available quota" and a rejected rate-limit report as `quota`, a plain 429 stays `rate_limit`)
  parks `run.harness` in `harness_state` until the reset the harness named, else `quota_default_pause_ms` (1 h);
  the ticket gets a `retry` wake with reason `quota_wait` at that time (not counted by the re-wake cap) and is not
  parked. Every other ticket on that harness waits too. If the project's `harness_fallbacks` (else the company's)
  lists an installed, unparked harness, the wake is due at once and dispatch runs the ticket there (a session is
  only resumed on the harness that made it). Expired pauses are cleared by the first dispatch that sees them.
- Pure rules, also exported: `decideLane`, `decideFailure`, `findViolations`, `nextTicketNumber`,
  `pickNext`, `orderCandidates`, `chooseHarness`, `describeWait`, `requestWake`.
- Process-edge helpers the app plugs in, kept here so `apps/server` holds no port implementation: `createIdSource()` (the `IdSource`: random `run-`/`wake-`/`int-` ids and 256-bit base64url run tokens from the OS random source), `createOwnerId()`, and `createJsonLogger(write, min?, now?)` (one JSON line per log call, never throws, redacts fields whose names look like credentials).
- Run settle records status, usage, cost, error family, the files git says changed, the receipt
  chain's last hash and revokes the token; the worktree is kept for the PR step.

Dispatch parks a ticket (WaitingHuman, "Needs you") when the worktree manager raises `InvalidInputError`, for example a project whose repository has no commit yet (init-only, d-0124); releasing it after the user's first commit dispatches normally.

- **Escalations (S4a).** Every owner wait is one interaction: a Worker's question (typed by `tick/outcome-escalate`), a failure (retry cap, rework cap, lane hold, question timeout, ...) or a setup (login, tool approval, changed harness build, read from the run's receipts). Producers (`outcome`, `triage`, `plan-to-tickets`, `verify-outcomes`, `interactions`, `dispatch-park`) call `raiseEscalation` in the transaction that parks the ticket. A wait starts in the Director's stage (`escalated_at` unset, hidden from the owner): `sweepEscalations` runs once per tick (and again after verify), never inside the settle transaction, and gives each its first look: `ticket_answer` (with the planning-style read rounds through `admit()`) may answer a Worker alone only when `canAutoAnswer` allows it (confident enough, cited grounds, not Tier C by prediction or planned file, not `always_ask`); `ticket_recover` may retry once per cause (`max_director_retries`) with a note. Any error, parse failure or timeout hands the wait to the owner at once; a lane hold, a timed-out question and every setup skip the look. `Engine.actOnEscalation(id, body, author)` and `Engine.actOnTicket` settle by compare-and-swap and act through `transition()` / `transitionCard()`: answer, retry (a rework-cap retry gives exactly one more attempt), cancel (refused with dependents unless `cascade`), run as Express, recheck (`still_broken` otherwise), re-plan (the card goes back to grilling; the not-started tickets of the old plan are held, and cancelled when v(N+1) is approved) and rework. `resumeFixedSetups` resumes a fixed setup by itself; `backfillEscalations` gives tickets parked before this release an escalation at start; the invariant sweep reports a waiting or blocked ticket with none.

## Why this approach

- Inner ring (d-0058): imports `@forge/core` and `@forge/tools` only; every effect is a port. The
  same code runs on SQLite and the real harness in the app and on in-memory fakes in tests.
- One door for ticket state (code.md rule 6): every change is a plan of events run through
  `transition()` and stored by CAS on `status_version` (`tick/ticket-moves.ts`). "Park for a human"
  is one `parked` event (reason becomes `blocked_reason`), not a status write and not a fake
  `dispatched` + `asked`. A property test pins it.
- A retry is a new run (d-0055): a run with `ended_at` is never reopened; `retry_of` links the chain.
  A run stopped by a restart is the exception (d-0092): it has no `ended_at`, and is resumed on its
  own row, so one run id carries the whole conversation and its receipts, with `generation` counting
  the secret generations (d-0100). `interrupted` moves only to `running` (resume) or `settled`
  (give up); the table is `RUN_TRANSITIONS` in core. A resume that fails falls back to the retry
  path above, keeping the worktree, rather than losing the ticket.
- Failure policy by error family (`domain/failure-policy.ts`, config `engine.retry`):
  `auth`, `policy_denied`, `refusal`, `budget`, `invalid_input` never retry; `quota` is handled before the table (above;
  the table's own answer is a retry at the reset, or after `rate_limit.max_ms`); `rate_limit` waits for
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
- Fairness is by project turns, not by global priority: a ticket's `priority` ranks it inside its own project only. A
  global priority would let one project's urgent tickets starve every other project (a property test pins no starvation).
- Alternatives rejected: engine in `apps/server` (breaks "apps compose only"); timers inside the
  engine (the app owns the clock, so tests move a fake one).

## Requirements

- Node 24, pnpm. Runtime deps: `@forge/core`, `@forge/tools` (`admit()` and the `director` read grant), `zod`.
- `EngineDeps` (see `src/types/engine.types.ts`): storage, `drivers` (a core `DriverRegistry`), llm, memory, receipts,
  `reports` (a `ReportStore`), `project(slug, settings)` (the project's `ProjectRuntime`: config, `GitHost` or null,
  gates, `worktrees` of its own clone and `baseRef`; null = unknown or archived project; `settings` is the project's
  `ProjectConfigView` of this tick so the app can rebuild a runtime whose git host settings changed), clock, `config`
  (a `ConfigSource`: the settings in the database, read once at the start of each tick, see below), `ids`, `owner`
  (this server's name), `catalogueHash`, `repoReader` (a core `RepoReader`: tracked files at HEAD for the planning steps' reads), optional `mcpIdentity`, `onTickRequested`, `log`.
- No env, files or processes are touched here (the id source reads only OS entropy). Tests: `pnpm test` (scenarios in
  `__tests__/scenarios`, pure rules in `__tests__/domain`, the status-write property in
  `__tests__/property`, including the scheduler's limit, fairness and priority properties); coverage floor 80% lines.

## Extending

- A new planning step kind: add it to `FLOW_STEP_KINDS` and `STEP_NAMES` in `@forge/core` with its output schema, a runner in `tick/planning-steps.ts` (or its own file), and a case in `runKind` of `tick/card-planning.ts`; it then appears in the flow editor's Add step menu. Research (S6) will be added this way.
- A new Director step: add its name and output schema in `@forge/core` (`schemas/steps.ts`), add the
  model to the matrix, then call `runStep` from the phase that needs it (see `tick/triage.ts`).
- A new lane: change `triage.ts` (the Express-only park) and `dispatch-run.ts` (model per lane
  already comes from the matrix); the lane rule itself is in `domain/lane-rules.ts`.
- A new failure family rule: `domain/failure-policy.ts` plus its config in `engine.retry`.
- A new scheduling limit: add it to `PickCaps`, check it in `pickNext`'s `blocker`, name it in `describeWait`, fill it in
  `tick/schedule.ts` from the settings, and extend the limit property test.
- Never write ticket status elsewhere; add events to `core`'s state machine and plan them through
  `ticket-moves.ts`.

## Limits

- `engine.steerRun(runId, message, author)` is the direct user-to-Worker message (d-0109): no model call, no tick wait, `steer` mode only. It writes the run inbox row and a `user_message` run event in one transaction, calls `driver.steer(handle, text, 'steer', inboxSeq)`, then marks the row delivered. Result: `delivered {inboxSeq}`, `not_live` (no live pump here, run not starting/running, or owned by another server) or `unsupported` (driver lacks `steer`, or the live session refused with `InvalidInputError`; the stored message stays undelivered). Any other driver failure throws and leaves the message undelivered. It never falls back to `follow_up`: that would change what the person asked for.
- Card chat: owed replies are rows in `card_reply_queue` (claimed per tick, completed with the reply; a claim older than 10 minutes, `STALE_CLAIM_MS`, is taken again), so a restart resumes them; the `thinking`/`error` flags are process-local (`thinking` is mirrored from the queue and set inside the posting transaction, and `deps.projectEvents` is told when it ends). Pause, stop, restart and re-plan of tickets are not offered to the Director yet: only `create_ticket`, `steer_run`, `change_type` and `suggest_close` exist. `create_ticket` is refused while the card is `grilling`, `verifying` or `plan_ready` (tickets come from the approved plan, d-0141), the ticket type is always `chore` (triage may refine it), and the budget cap never blocks anything: crossing 80 percent and 100 percent of it writes one `budget_warning` card event each (d-0143, `tick/card-budget.ts`, checked after a card reply and after a run settles). Planned cards (not Discussion, not fast-path) do not use `card_chat` at all: their turns are planning turns.
- Process-local by design: live run pumps, step/dispatch holds and queued steering replies. After a
  restart pumps are gone (interrupted runs are resumed with new pumps, d-0092) and holds reset. The requester's hint, type and
  title are read from the stored intake event (`intakeEvents.get`), so they survive a restart.
- A run lost in a crash can only be resumed if the harness had reported its session (stored on the
  run row as it arrives); one lost before that is crash-settled and retried. A Worker whose result
  had arrived but was not yet settled when the server stopped is resumed too, and told to continue.
- A running Worker keeps the limits it was started with (budget, stall time); a settings edit reaches runs started on the next tick. The stall scan itself uses the current `stall_ms`. Run rows predating migration 0010 have no `config_version`.
- Ticket numbers come from listing every ticket id (no counter); fine at M0 scale.
- Card phase changes only through `tick/card-phase.ts` (`moveCardTx` runs `transitionCard` and stores it with a CAS on `phase_version`); `syncCardWithTickets` runs inside `moveTicketTx` and starts a `queued`/`approved` card with its first ticket past the inbox and completes it with its last live ticket done. A card is created only by `tick/card-create.ts`.
- Card history is written by `tick/card-log.ts` inside the transaction of the change it describes: `ticket_state` from `moveTicketTx` (the one ticket door), `interaction_opened` when a pause is applied, `interaction_answered` when an answer wins. Steering and Director messages are not logged yet (no card chat); a ticket without a `card_id` is skipped, not failed.
- The rotation cursor is process-local: after a restart the first dispatch starts at the first project by id. Priority
  is set directly on the ticket row (no API to change it yet). A wait reason is computed on request and not stored.
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
- Planning limits: the flow is walked in the process that claims the turn (a crash mid-step re-runs that step once the claim is stale, losing only that call's spend); held tickets keep Express as their only way to run until the stage runner lands; `step_budget_usd` (default $2; the claude CLI alone costs about $0.50 a call) caps each planning call, and a step that fails with the `budget` family is not retried by the stale claim (it would spend the same money and fail again): the card gets a note, `needs_you` with actions `raise_step_budget` and `retry_step`, and its queued turn is completed; `retryPlanningStep` (`POST /cards/:id/planning/retry`) clears Needs you and queues a turn that resumes at the unfinished step (the Director's ticket-side `ticket_answer` / `ticket_recover` steps already hand any failure straight to the owner); chat messages during planning answer the open question or are kept as an owner note, they never start a second conversation; the Director's lane for a plan ticket is the plan lane raised by `preCheckLane`, `decideLane` is not involved (no triage model call for planned work, d-0141 item 9).
