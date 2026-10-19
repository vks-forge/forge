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
  - `tick()`: reconcile, refresh, release lane holds, verify, advance stages, dispatch, then the invariant sweep; single-flight (a call during
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
  - Card planning (`tick/card-planning.ts` and `planning-*.ts`, d-0130 to d-0150): a card of a planned type (not Discussion, not a fast-path type) in `grilling`, `verifying` or `plan_ready` is planned instead of chatted with. When planning starts the card snapshots the effective flow (`flow_json`, cursor, config revision); each tick the runner claims the card's queued turns and walks the flow from the cursor, one Director call per step, each step recorded in one transaction (`step_started`, `step_finished` with files read and config version, the grill state, the cursor), until a step needs the owner or the flow ends. Default flow: `survey` (read rounds), `grill` (one question per turn, options, one recommended, `open_points`, limits per round), `verify` (read rounds, pins HEAD), `enhance` (standard and full lanes; its owner questions are asked one at a time, even though the grill step has already finished, before the plan is written), `write_plan` (versioned plan, decisions and verification filled by the engine, diff from the previous version), `approve`. Reads: the survey and verify steps answer `read_requests`; the engine runs each through `admit()` (`admitDirectorRead`, `@forge/tools`) and `deps.repoReader` (git-tracked files at HEAD only), under `read_caps`, and calls the step again with `read_results`, two rounds at most. The approval floor (`checkFloor`, facts from other approved cards' plans and git) runs first; only a passing plan with approval mode `director_or_user` reaches the tool-less `approve_plan` step, which sees the plan, the typed findings and the floor result only. Otherwise the card goes to Needs you with `approve_plan` and `request_changes`. Director step spend counts on the card (`director_spend_usd` in the grill state, `budget_warning` once per level, never a block). A failing step writes a note and leaves its queued turn claimed, so it is retried when the claim goes stale (10 minutes); `planning sweep` (`tick/planning-sweep.ts`) queues the first turn of planned cards with no flow (a converted Discussion) or with queued owner questions but none open and no turn owed (so a card left that way by an older build asks its next question by itself), and nudges an unanswered question after 24 hours (never answers it). A planning turn that took an owner chat message always writes a Director event after it: when no question, step or note followed, a plain `director_message` says the message was kept and nothing ran, and the engine logs a warning.
  - Planning doors (all return typed `status` results, never throw for a wrong moment; `retryPlanningStep(cardId, author)` answers `retried`, `not_found` or `phase_mismatch` when the card is not stopped on a budget failure): `answerGrill(cardId, {question_id, option_id | text}, author)` (`answered`, `question_not_open` 409, `invalid_answer`), `grillShortcut(cardId, 'use_recommendations' | 'write_plan_now', author)` (`applied`, `phase_mismatch` 409), `approvePlan(cardId, version, author)` (`approved` with `ticket_ids`, idempotent per version; `stale_plan` and `phase_mismatch` 409; `plan_not_found`), `requestPlanChanges(cardId, version, comment, author)` (`requested`, `invalid_comment`, `stale_plan`, `phase_mismatch`), `editPlanTickets(cardId, version, {tickets, order?}, author)` (`edited` with the new owner version, `ticket_has_dependents` 409, `unknown_ticket`, `invalid_order`, `empty_plan`, `stale_plan`, `phase_mismatch`), `startPlanning(cardId, author)` (`started`, `phase_mismatch`, `not_plannable`), `runAsExpress(ticketId, author)` (`released`, `not_held` 409), and the reads `cardPlans(cardId)` (versions, current plan, floor computed now) and `cardPlan(cardId, version)`. Approval (`tick/plan-to-tickets.ts`) files the plan's tickets dependencies first (priority urgent 3, high 2, normal 1, low 0; `blocked_by` from the plan keys), moves the card through `transitionCard()`, and gives each ticket `triaged` with the stricter of the plan lane and `preCheckLane` (Tier C files make it Tier C); a planned ticket whose lane is not live (`LIVE_LANES` is all three lanes now, so this only holds a lane a later build adds) is parked with the wait reason `pipeline_pending` and a lane-hold escalation offering `run_as_express`, and the engine releases the hold itself once the lane is live (`tick/lane-hold-release.ts`).
  - `answerInteraction(id, answer)`: CAS answer, queues the `response_wake`.
  - `cancelTicket(id)`: `cancelled` through `transition()`, cancels the live run, removes the worktree.
  - `interruptRun(runId)`: shutdown path (`tick/interrupt.ts`). Marks a live run `interrupted`
    with its harness session (`resumable_session`, from the `session_ref` the pump stores as the
    harness reports it) and `interrupted_at`, flags its pump so no tick settles the stream that
    ends because of the stop, then `driver.cancel`s the harness. Token, worktree and receipts are
    kept; a run whose result already arrived is left to settle normally.
  - `explainWait(ticketId)`: why a ticket has not started, as one line (`quota: claude-code until 14:20 UTC`,
    `cap: per-project 1/1`, `deps: PAY-231`), or null; read-only, from the same decision dispatch makes.
  - `liveRunIds()`, `gateJobsInFlight()` (gate runs and script jobs executing beside the tick).
- **Stage runner (S5b, `tick/stage-*.ts`).** A ticket's lane pipeline is snapshotted at its first dispatch (`stage-snapshot.ts`, `ticket_pipelines`: effective list, roles, hash, settings version, routed stages) after `pipelineProblems` is run again against today's roster; later edits never change a started ticket, a heavier lane re-snapshots at the next boundary. Nothing stores a cursor: `stageCursor` (core) runs over the `stage_runs` rows (`stage-state.ts`) and answers run a writer, run the red proof, start G1, start checks, wait, or merge (with `hold` when a human stage is open). Writers run while the ticket is `in_progress` (`dispatch-stage.ts` picks the stage's agent; `launch-run.ts` writes the run row and the attempt together); a writer that passes either asks for the next writer by a `stage` wake or moves the ticket to `verifying` (`stage-outcome.ts`, `stage-advance.ts`), and a tester's red proof runs as a background script job (`stage-script-jobs.ts`). While `verifying`, `stage-runner.ts` drives the rest through hooks `verify.ts` supplies (G1 gate job, gate rows, the merge door): check agents start by a `stage` wake that dispatch serves under the normal limits (`dispatch-check.ts`: a read-only run in the ticket's worktree, never the assignee, never a resumed session, prompt rendered by `stage-prompt.ts` from typed artifacts with `narrative` stripped, `stage-artifacts.ts`), script gates as jobs (`stage-gates.ts`). A settled check applies its `submit_review` (`stage-outcome.ts`): blocking findings send the work back through `gate_failed` (`stage-send-back.ts`, the same bounded road as a failed G1, restarting at the stage's `rework_to`) or hold the ticket for the owner; no review at all parks it. Routing rules add checks on the plan's files at snapshot and the real diff when verifying starts, never remove. `tick/lane-hold-release.ts` runs before triage and settles a lane hold `pipeline_ready` when its lane is live.
- **Full lane (S5c-A).** `LIVE_LANES` is all three lanes; held Full tickets resume by themselves (`pipeline_ready`). _Findings route_ (`blockingRoute`, `stage-send-back.ts`): a gate (G1, a script) reworks to the cap and then raises the `rework_cap` failure, never Merge anyway (a script gate set to hold parks as a plain failure); a reviewer or the Director check reworks to the cap and then **holds**; a stage set to hold (the built-in critic, the Director check) holds at once. A hold parks the ticket from verifying with `findings_hold: ...` and one `decision` item at the owner stage (`escalation-finished.ts`). The default Standard behaviour is unchanged up to the cap; at the cap a reviewer's findings end in `findings_hold` instead of `rework_cap`. _Director check_ (`stage-director-check.ts`, `domain/director-check.ts`): a tool-less `ticket_check` step over typed artifacts only (ticket, plan, diff, gate and test reports, findings; **never** `narrative` or `finish_claims`), run as an in-memory job (`ticket:run:stage:cycle`), row kind `director`, restart-safe; the engine computes the files outside the plan, an unmet criterion becomes a high finding and an unclear one a medium finding, `out_of_plan` with unplanned files raises a `scope_drift` decision, and a ticket with no plan entry gets the stage `skipped` (and so an owner sign-off); an erroring step is retried by its family and then parks with a failure, never a pass; cost is added to the card's Director spend (a warning only). _Sign-off_ (`stage-sign-off.ts`, `signOffDecision`): the Director records a `director` row and the merge door finishes (tier A merges; tier B goes through `mergeReviewed(..., 'director')` with a card note); otherwise the owner gets one `sign_off` item (`sign-off-raise.ts`) with the reason the Director declined. Every ticket that `passAndMerge` leaves in review or needs sign-off gets that item; `escalation-backfill.ts` raises it (and decisions for `findings_hold:` and `scope_drift:` parks) at start. `actOnEscalation` takes `merge_anyway` and `continue` (owner only, five characters of reason, recorded on the interaction, the card event and the held stage row, which reads passed with `outcome.override`, `escalation-override.ts`), `rework` (also from a hold: held rows fail, no rework spent, the comment and the findings ride in the continuation wake) and `approve` / `sign_off` on a sign-off item; `actOnTicket` settles the pending item too. _Parallel writers and placement:_ a writer `group` runs its members side by side in the ticket worktree; each member (and each agent member of a check group) is its own scheduler candidate (`Candidate.member`, `candidateKey`), started by its own `stage` or rework wake (`stage#member` in the key, `rework-wakes.ts`), so a per-project limit of two starts both and a limit of one runs them in turn; a member's settle is kept while a sibling is the ticket's current run (`outcome.ts`), a crashed member is retried by its own stage row, and a rework of a writer group sends every member back.
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
  `pickNext`, `orderCandidates`, `chooseHarness`, `describeWait`, `requestWake`, `LIVE_LANES` / `isLive`.
- Process-edge helpers the app plugs in, kept here so `apps/server` holds no port implementation: `createIdSource()` (the `IdSource`: random `run-`/`wake-`/`int-` ids and 256-bit base64url run tokens from the OS random source), `createOwnerId()`, and `createJsonLogger(write, min?, now?)` (one JSON line per log call, never throws, redacts fields whose names look like credentials).
- Run start stores the Worker brief (dispatch prompt plus the appended Worker contract, as the driver receives it, passed through `scrubSecrets`) as the run's first `prompt` event, in the same transaction as the run row.
- Run settle records status, usage, cost, error family, the files git says changed, the receipt
  chain's last hash and revokes the token; the worktree is kept for the PR step.

Dispatch parks a ticket (WaitingHuman, "Needs you") when the worktree manager raises `InvalidInputError`, for example a project whose repository has no commit yet (init-only, d-0124); releasing it after the user's first commit dispatches normally.

- **Escalations (S4a).** Every owner wait is one interaction: a Worker's question (typed by `tick/outcome-escalate`), a failure (retry cap, rework cap, lane hold, question timeout, ...) or a setup (login, tool approval, changed harness build, read from the run's receipts). Producers (`outcome`, `triage`, `plan-to-tickets`, `verify-outcomes`, `interactions`, `dispatch-park`) call `raiseEscalation` in the transaction that parks the ticket. A wait starts in the Director's stage (`escalated_at` unset, hidden from the owner): `sweepEscalations` runs once per tick (and again after verify), never inside the settle transaction, and gives each its first look: `ticket_answer` (with the planning-style read rounds through `admit()`) may answer a Worker alone only when `canAutoAnswer` allows it (confident enough, cited grounds, not Tier C by prediction or planned file, not `always_ask`); `ticket_recover` may retry once per cause (`max_director_retries`) with a note. Any error, parse failure or timeout hands the wait to the owner at once; a lane hold, a timed-out question and every setup skip the look. `Engine.actOnEscalation(id, body, author)` and `Engine.actOnTicket` settle by compare-and-swap and act through `transition()` / `transitionCard()`: answer, retry (a rework-cap retry gives exactly one more attempt), cancel (refused with dependents unless `cascade`), run as Express, recheck (`still_broken` otherwise), re-plan (the card goes back to grilling; the not-started tickets of the old plan are held, and cancelled when v(N+1) is approved) and rework. `resumeFixedSetups` resumes a fixed setup by itself; `backfillEscalations` gives tickets parked before this release an escalation at start; the invariant sweep reports a waiting or blocked ticket with none.

- **Card close, review merge, settle guard, live planning.** `Engine.closeCardWork(cardId)` (called by `PATCH /cards/:id` after a close commits) and the every-tick `sweepClosedCards` cancel the unfinished tickets of a closed card through `transition()`, close their waits, stop live runs and remove worktrees, with one card note; no escalation is raised for a closed card (`raiseEscalation` returns null, backfill and the first look skip it) and a reopened card does not revive cancelled tickets. `actOnTicket` accepts `approve` (tier B, `review`) and `sign_off` (tier C, `needs_signoff`, signer named or the owner): `tick/review-merge` resolves the verify target, requires a passing G1 row set and calls `mergeReviewed()` in `verify-merge.ts` (still the only caller of `GitHost.merge`), which merges exactly the gated sha; a moved head merges nothing, sends the ticket back to verifying (state machine event `regate`) and answers `head_moved`; a refusal answers `merge_refused`. `Engine.reviewOf(ticketId)` reads the diff stat and gated commit for the ticket page. Each run settles in isolation (`tick/settle-guard`): a throw is logged with the run id and counted, and a run that fails three ticks in a row is closed as an error and its ticket parked with a failure escalation. The receipt chain is read before the settle transaction (the receipt log shares the writer lock). A ticket filed on a `done` card moves it back to `in_progress` (`resume_work`). Planning writes are stamped with the clock at the write (`stamp()`), after `step_started` was committed before the model call.
- Debug trace (d-0163): `EngineDeps.trace` is an optional `TraceSink`. The engine emits one `run_event` per normalised event at the single place events enter it (the run pump), a `run` entry for the start request, the end result and the settle, one `engine` entry per dispatch pick, per rejected Director step (error kind and message) and per step retry, and an `error` entry when a tick phase throws (with its family). Never one entry per idle tick. Absent means nothing is traced; the sink is passed through `emitTrace()` so a failing sink cannot break a tick.
- **Agents (S5a).** `tick/run-agent.ts` resolves the agent behind a ticket's next run from the tick's settings (`resolveAgent` for work that names no stage: the agent an earlier run used while it is still usable, else the implementer; `resolveStageAgent` for a pipeline stage, null when its agent is missing, disabled or archived, which parks the ticket instead of running another agent) and maps its `runs_on` to a harness and model (`modelFor`: `project_default` is the project's harness, `forge_default` the lane model matrix, `harness_default` sends no model, a fallback harness uses its own entry's model). `dispatch-run.ts` starts the run on that harness (unless the scheduler moved it to a fallback), puts the agent's instructions between the brief and the rules (`tick/agent-prompt.ts`), passes the agent's memory view to the memory source and records `agent_id` and `agent_hash` on the run row. `run-request.ts` takes the budget keys the agent sets and falls back to `engine.run_budget` for the rest (a `minutes` budget is logged and not enforced: no driver has a wall-clock cap yet). `schedule.ts` and `quota.ts` use the agent's own harness and let a non-empty agent fallback list replace `harness_fallbacks` (quota and harness-down only); a restart resume continues on the run's agent. With built-ins only, an Express run request equals the pre-agent one (`__tests__/tick/express-parity.test.ts`, golden fixture captured before the change, also through the stage runner).
- Director pipelines (S5d): `tick/pipeline-adjust.ts` is the one door for a ticket's pipeline copy after its first snapshot: `adjustTicketPipelineTx` applies ops through core `applyAdjustments`, freezes every stage that is running or passed in the current cycle (`frozenStages`), stores the definition, hash, new roles and the full log in one write and leaves one card note; it never throws for a refused op, so a Director change can never park a ticket (`declineAdjustmentsTx` records ops as dropped when the owner switched `director.pipelines.adjust` off). `ensureSnapshotTx` sets `base_hash`, applies the plan entry's `pipeline.ops` at the first dispatch, re-applies the recorded `plan` then `fallback` ops on a lane raise (an op without its anchor is recorded dropped) and calls `maybeProposeTx` (`tick/pipeline-proposals.ts`: history from the project's recent tickets' copies, core `shouldPropose`, one pending `PipelineProposal` with up to three quoted reasons and the lane list with the op applied, skipped when routing changed the base list). `write_plan` gets `pipelines` (lanes, roster, locked ids, compact 90-day scorecards, the `adjust-pipeline` playbook); `composePlan` keeps only the ops that hold and lists the rest under the plan's risks, `computeFloor` passes `lighter` so a removal waits for the owner, and a plan edit may drop ops (`drop_pipeline_ops`). The fallback ladder: retry (unchanged `decideFailure`; attempts counted per `fallback_slot`), then `tick/agent-fallback.ts` `nextSlotTx` after `rate_limit` retries run out or at once for `model_unavailable` (the next usable entry of `[primary, ...runs_on.fallbacks]`, same-harness models count, parked or uninstalled harnesses and a critic's Worker family are skipped; the slot rides on the stage row `outcome.fallback`, a retry wake is queued, `peekAgent` / `chooseWriter` / `startChecks` read it so the run uses that entry's harness and model, and every run records `model` and `fallback_slot`), then `tick/no-agent.ts` parks the ticket as failure `no_agent_available` listing every try (owner-only when the agent says `on_exhausted: pause`), the Director's `tick/escalation-substitute-step.ts` runs the tool-less `pick_substitute` over candidates built by `substituteCandidates` with their scorecards and applies a valid pick as a `swap` of cause `fallback` through the door while settling the item with the engine-only action `substitute` (a pick outside the list, a pause, an error, a switch off or no candidate hands the item to the owner, whose Retry restarts at slot 0), and `tick/scorecards.ts` `loadScorecardInput` reads the scorecard rows in batches (cap 2000 tickets).
- Research (S6, d-0143, d-0144, d-0146): `tick/planning-research.ts` (`researchStep`, `runResearch`) is the research flow step and the loop it shares with the grill's research detour (`tick/planning-detour.ts`). The tool-less `research` step answers `research_requests` (at most `director.research.max_rounds` rounds, then it must answer, else it is a rejected step) or `findings`. `tick/research-run.ts` runs each request in the strictest order: the run's caps (a hit is a "cap reached" result row), fetch provenance (`fetchAllowed`: only URLs from this run's search results, the card or the owner's answers), `admitResearch` (`@forge/tools`), then the provider; pages are held in memory with their `S<n>` refs and every result is wrapped in an untrusted-content envelope; the owner may allow up to 100 pages a run (d-0171), so `fitResultsToPrompt` keeps at most 400 000 characters of page text in the step's input, newest pages first, older ones keep their ref but lose their text (the stored page is whole). `tick/research-store.ts` is the only writer of the Director's sources and evidence: in the transaction of the finished step it stores the pages, checks every quote against the stored text (`checkClaims`, so the model never sets a status), stores the claims and logs the `research` card event; a failed or restarted run leaves nothing and reruns from its first round with the same numbering. The step runs when the Director has not set `step_decisions.research = false`; a provider that is off, a project that switched research off, the per-card run limit or a server that does not answer is a note on the card, an empty result and the flow goes on. `write_plan` may name `outside_claims`; `composePlan` attaches the card's evidence and the engine marks each claim supported or unverified; the approval floor adds one reason per unverified claim, and the approval step sees claims, refs and statuses but never a quote or page text. Card spend counts research calls and the provider's price and only warns; a warning belongs to the cap it was written for, so a changed cap warns again. `EngineDeps.research` is the one provider (absent means provider none).
- Memory context (S7, d-0168): `tick/memory-context.ts` `buildMemoryContext(ctx, project, { question, rewrite, filter, cardId })` is the one way the six steps that read project memory (triage, planning, card chat, dispatch, `ticket_answer`, `ticket_recover`) get `{ decisions, rejected, note? }`. With `EngineDeps.memoryIndex` it shows pinned decisions (at most `director.memory.pinned_max`) plus the `top_k` most relevant (search actor `director`, scope from core `directorScope()` or the agent slice through `workerScope()`), with the note "Showing N of M active decisions: pinned and most relevant; all rejected approaches are listed"; a project with at most `pinned_max + top_k` active decisions is sent whole with no note, and every rejected approach is always listed (newest first up to `rejected_max`, past that the most relevant first, with its own note). Without `memoryIndex` the old `MemorySource.slice` is read unchanged. `tick/memory-rewrite.ts` `rewriteQuestion()` is the `memory_rewrite` step (card planning and card chat only; the other four steps use core `extractTerms` of ticket title and body, no model call): it runs only when something is left out, with `rewrite_budget_usd` and `rewrite_timeout_ms` (the call is also raced against the timeout), is cached per (project, sha256 of the question) for the life of the process, drops tags outside the project's own vocabulary, falls back to plain keywords on a timeout, an invalid answer, a budget stop or any error (it never throws), counts its cost in the card's Director spend, and leaves a `memory_retrieval` trace entry naming the source (`model`, `cache`, `fallback`). `tick/planning-rejected.ts` `planRejectedHits()` reads the full `MemoryIndex.rejected()` list when a plan is written and adds to `verification.rejected_hits` every rejected approach whose distinctive words (at least 60%, at least two) appear in the plan's goal, scope and tickets, so a rejected approach the search left out of the prompt still sends the plan to the owner. `loadChatContext` now takes the `EngineCtx`. Express keeps its pasted slice through the same function (the golden dispatch fixture is unchanged).

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
- Only a lane with a runner starts (`domain/live-lanes.ts`, d-0059, brief E1): Express and Standard run their pipelines; a ticket triage puts in Full parks in
  `waiting_human` with `pipeline_pending: ... goes live in the next update` until that lane is live.
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
  gates, optional `scriptGates` (a `ScriptGateRunner` for script gates and the red proof; absent means a script gate parks the ticket and the proof is skipped), `worktrees` of its own clone and `baseRef`; null = unknown or archived project; `settings` is the project's
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
- A lane goes live: add it to `LIVE_LANES` (`domain/live-lanes.ts`); triage and plan approval stop holding it and `releaseLaneHolds` lifts the holds already raised. The lane rule itself is in `domain/lane-rules.ts`.
- A new failure family rule: `domain/failure-policy.ts` plus its config in `engine.retry`.
- A new scheduling limit: add it to `PickCaps`, check it in `pickNext`'s `blocker`, name it in `describeWait`, fill it in
  `tick/schedule.ts` from the settings, and extend the limit property test.
- Never write ticket status elsewhere; add events to `core`'s state machine and plan them through
  `ticket-moves.ts`.

## Limits

- `engine.steerRun(runId, message, author)` is the direct user-to-Worker message (d-0109): no model call, no tick wait, `steer` mode only. It writes the run inbox row and a `user_message` run event in one transaction, calls `driver.steer(handle, text, 'steer', inboxSeq)`, then marks the row delivered. Result: `delivered {inboxSeq}`, `not_live` (no live pump here, run not starting/running, or owned by another server) or `unsupported` (driver lacks `steer`, or the live session refused with `InvalidInputError`; the stored message stays undelivered). Any other driver failure throws and leaves the message undelivered. It never falls back to `follow_up`: that would change what the person asked for.
- Card chat: owed replies are rows in `card_reply_queue` (claimed per tick, completed with the reply; a claim older than 10 minutes, `STALE_CLAIM_MS`, is taken again), so a restart resumes them; the `thinking`/`error` flags are process-local (`thinking` is mirrored from the queue and set inside the posting transaction, and `deps.projectEvents` is told when it ends). Pause, stop, restart and re-plan of tickets are not offered to the Director yet: only `create_ticket`, `steer_run`, `change_type` and `suggest_close` exist. `create_ticket` is refused while the card is `grilling`, `verifying` or `plan_ready` (tickets come from the approved plan, d-0141), the ticket type is always `chore` (triage may refine it), and the budget cap never blocks anything: crossing 80 percent and 100 percent of it writes one `budget_warning` card event each (d-0143, `tick/card-budget.ts`, checked after a card reply and after a run settles). A `card_chat` turn's reported cost is added to the card's Director spend (`director_spend_usd`, via `addDirectorSpend`) like planning and escalation steps, so the card page's cost includes it; a turn that fails, and the triage and steering steps, add nothing (no card cost is recorded for them). Planned cards (not Discussion, not fast-path) do not use `card_chat` at all: their turns are planning turns.
- Process-local by design: live run pumps, step/dispatch holds and queued steering replies. After a
  restart pumps are gone (interrupted runs are resumed with new pumps, d-0092) and holds reset. The requester's hint, type and
  title are read from the stored intake event (`intakeEvents.get`), so they survive a restart.
- A run lost in a crash can only be resumed if the harness had reported its session (stored on the
  run row as it arrives); one lost before that is crash-settled and retried. A Worker whose result
  had arrived but was not yet settled when the server stopped is resumed too, and told to continue.
- A running Worker keeps the limits it was started with (budget, stall time); a settings edit reaches runs started on the next tick. The stall scan itself uses the current `stall_ms`. Run rows predating migration 0010 have no `config_version`.
- Ticket numbers come from listing every ticket id (no counter); fine at M0 scale.
- Card phase changes only through `tick/card-phase.ts` (`moveCardTx` runs `transitionCard` and stores it with a CAS on `phase_version`); `syncCardWithTickets` runs inside `moveTicketTx` and makes the card agree with its tickets both ways: starts a `queued`/`approved` card with its first unfinished ticket past the inbox, completes it with its last live ticket done, reopens a `done` card (`resume_work`, with a "Reopened" note) when a live ticket is not done (also the only path for a new ticket on a done card: `insertInboxTicket` calls it), and keeps the stored `needs_you` flag in step with owner waits (set when every ticket of an in-progress card was cancelled, with a note). `sweepCardPhases` (`tick/card-sweep.ts`, every tick; the first tick checks every card) repairs cards that already disagree. A card is created only by `tick/card-create.ts`.
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
- Approve and merge reads the gate rows of the ticket's last successful run and its worktree; if the worktree is gone the review facts are null (the merge itself still works from the PR). The G1 report is shown by reference (`report_ref`), not served as a file. A settled run whose ticket was reassigned is not reopened.
- Not in the engine: `apps/server` (HTTP, SSE, clock), in-run
  escalation signals, the `clarify`, `plan`, `rework_brief` and `epic_summary` steps, `command`
  intake, `delegated`/`monitor` wakes (consumed and dropped; `continuation` is the gate-failed rework).
- Planning limits: the flow is walked in the process that claims the turn (a crash mid-step re-runs that step once the claim is stale, losing only that call's spend); `step_budget_usd` (default $2; the claude CLI alone costs about $0.50 a call) caps each planning call, and a step that fails with the `budget` family is not retried by the stale claim (it would spend the same money and fail again): the card gets a note, `needs_you` with actions `raise_step_budget` and `retry_step`, and its queued turn is completed; `retryPlanningStep` (`POST /cards/:id/planning/retry`) clears Needs you and queues a turn that resumes at the unfinished step (the Director's ticket-side `ticket_answer` / `ticket_recover` steps already hand any failure straight to the owner); chat messages during planning answer the open question or are kept as an owner note, they never start a second conversation; the Director's lane for a plan ticket is the plan lane raised by `preCheckLane`, `decideLane` is not involved (no triage model call for planned work, d-0141 item 9).
- Agents: an agent fallback list changes the harness on quota and harness-down only (rate-limit model swaps and the Director substitute wait for S5d); the scheduler reads the agent the ticket's next stage names (`tick/stage-agent.ts`), not the agent a retry will resume on.
- Stage runner (S5b): script gates, red proofs and routing evaluation caches (`stageJobs`, `diffRouted`) are process-local, so a restart runs a lost script or proof again (the rows are the truth). Check runs start through the scheduler's limits, but a check never takes the ticket's `assignee_run_id`, so a late result for work that already went back is recorded and changes nothing. Artifacts are stored only for pipelines that have a check agent (an Express ticket writes only its snapshot and stage rows). A lane raised while a writer is mid-run adopts the heavier lane's earlier writers instead of running them out of order. The red proof is advisory: it runs the project's `test`-role check, skips with a note when there is none or no runner, and never blocks.
- Memory (S7): the rewrite cache is per process and a rewrite call that outlives its timeout is abandoned, so its cost is not counted; the rejected-approach check is a word-overlap heuristic that only adds a reason for the owner to read, it cannot prove a plan repeats an approach; an index that cannot be read fails the step like any other port error (there is no silent fall back to the old slice mid-run); the note counts decisions inside the agent slice, not the whole project.
