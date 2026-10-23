# Eval fix 5: Director steps off the tick, true run start times, Director plan quality

Source: `docs/reports/2026-10-20-forge-usefulness-eval.md` (Director blocks Workers, item 5; Director quality list),
`docs/reports/2026-10-20-eval/forge.json` bugs, `timeline-FR-C2.json`, `timeline-FR-C7.json`.
Binding: d-0003, d-0058 (engine has no IO), d-0092 (resume), d-0097 (Worker limits), d-0134 (durable reply queue),
d-0141 items 4/6/9/10, d-0143, d-0150 (Director settings as data). Code rules: `.claude/rules/code.md`.

## 1. Current flow (what the eval hit)

One single-flight tick runs every phase in order and awaits each (`packages/engine/src/tick/engine.ts:126-160`).
Director model calls are awaited inline in five of those phases:

| Phase (engine.ts) | Director call, awaited in the tick | Where |
|---|---|---|
| `deliver replies` :146 | `steer_reply` per reply | `tick/steering.ts:38` |
| `escalations first look` :147, :158 | `ticket_answer` / `ticket_recover` / `pick_substitute`, one interaction after another | `tick/escalation-director.ts:105-117` → `escalation-answer-step.ts:170`, `escalation-recover-step.ts:81`, `escalation-substitute-step.ts:198` |
| `card chat` :150 | claims ALL owed rows (`card-chat.ts:126`), then a `for` loop per card (`:135`): `card_chat`, or a whole planning turn (`:143`) that walks up to 40 flow steps, each one model call (`card-planning.ts`, `MAX_STEPS_PER_TURN`) with up to 3 read rounds per survey/verify (`planning-steps.ts:76`) | `card-chat.ts`, `card-planning.ts`, `planning-*.ts` |
| `triage` :153 | `triage` per inbox ticket, serial | `tick/triage.ts:163-176`, `:68` |
| `dispatch` :159 | per picked ticket, serial: worktree, `memory_rewrite`, `dispatch_prompt` (`dispatch-run.ts:156`), then `launchRun` | `tick/dispatch.ts:42-54` |

Precedent for the fix already exists: gates (`tick/gate-jobs.ts`), stage scripts/checks and the Director's
`ticket_check` (`tick/stage-director-check.ts:120`) run as tracked in-memory jobs beside the tick, the job computes, the
next tick applies, and `engine.gateJobsInFlight()` + `__tests__/helpers/rig.ts:104 tickToIdle` drain them in tests.

`EngineCtx.now` / `nowIso` are frozen at tick start (`engine.ts:96`, `:124`) and used as the stamp for almost every write
(238 uses in `packages/engine/src`). Only the planning code reads the live clock (`planning-state.ts stamp()`), and
`approvePlanTx` does too (`plan-to-tickets.ts:282`).

## 2. Root causes

1. **Tick blocks on the Director.** Every Director step above is `await`ed in the single-flight tick. A planning turn
   alone is several opus calls (survey 300 s timeout, verify, write_plan, approve_plan). While it runs, settle, the stall
   scan, verify, merges and dispatch of every other ticket wait; a tick requested meanwhile only sets `requested`.
2. **Serial Director across cards.** `runCardChats` answers cards one after another inside one tick (`card-chat.ts:135`).
   With 4 cards planning, card 4 waits for cards 1-3. FR-C5's queue row was claimed 166 s late because the claim itself
   only happens when the previous (blocked) tick ends. A second defect: `claim()` marks every open row claimed
   (`db/src/adapters/sqlite/card-reply-queue-repository.ts:42-57`); after a restart, rows claimed by the dead process
   wait the full `STALE_CLAIM_MS` (10 min) before anyone answers them.
3. **Run `started_at` too early, watchdog kills it.** `launchRun` writes `started_at: ctx.nowIso` (`launch-run.ts:59`),
   i.e. the tick's start, not the spawn. FR-C7: the tick started 06:36:14, the card's own approve step and the
   `dispatch_prompt` step then ran inside that same tick, the ticket was created 06:36:54, the harness spawned about
   06:41:39, and the next tick's stall scan (`reconcile.ts:76`, `last_event_at ?? started_at`, `stall_ms` 300 000)
   saw "silent for 324219 ms" and killed a run that had just started.
4. **Ticket `updated_at < created_at`.** Same stale clock: the ticket is inserted with the live clock (approval,
   `plan-to-tickets.ts:282`), and the same tick's dispatch then moves it with `ctx.nowIso` (`dispatch-run.ts:239` →
   `ticket-moves.ts:70 updated_at: nowIso`). The timeline shows `207s planned->in_progress` before `247s inbox->planned`.
5. **Lane ignored (T2).** Not the planner: plan v2 said `express`. `approvePlanTx` raises every ticket through
   `preCheckLane` (`plan-to-tickets.ts:216-224`), by design (d-0141 item 9: can only raise). Two accidents make it
   bite: the body-length input is `ticketBody()` (body plus acceptance list, file list and a footer,
   `plan-to-tickets.ts:94-107`) against a 2000-char cap meant for a raw intake body (`core/src/domain/lane-triage.ts:26`),
   and the `files > 3` raise. The raise reasons are thrown away, so the owner sees no why.
6. **Plan contradicts the owner (T6).** The engine copies the owner's answers into `decisions` (`planning-plan.ts:97`),
   but `scope` / `non_goals` are free model text and nothing checks them against those decisions; the approve step only
   sees the plan and floor (`planning-floor.ts`), and neither playbook says "owner answers outrank your defaults".
7. **Survey reads 0 files (T2).** The built-in `survey` flow step has no playbook (`core/src/domain/builtin-director.ts`
   flow entry `survey` has no `playbook_id`, unlike grill/verify), so the step runs on the one-line system prompt
   (`drivers/src/domain/director-step-prompts.ts:60-65`) and gets no file list. It may answer `findings` on round 0 with
   no reads; `readStep` accepts that (`planning-steps.ts:91`). The grill then asks what the code would answer.
8. **Duplicated risks.** `composePlan` unions survey, verify and plan risks with exact-string `mergeUnique`
   (`planning-plan.ts:108-111`, `planning-state.ts:223`); the planner rephrases them, so near-duplicates survive (T1: 11
   entries, 3-4 distinct).
9. **Director spend on trivial work.** Defaults put `dispatch_prompt`, `approve_plan`, `verify`, `triage`,
   `steer_reply` on opus (`core/src/domain/builtin-config.ts:24-50`); per the file's own note an opus CLI call costs
   about $0.50 before any work. T1 ran 5 Worker runs, so 5 opus `dispatch_prompt` calls, plus survey, verify, write and
   approve on opus.

## 3. Design

### 3.1 Job model (engine, no IO of its own)

New `tick/director-jobs.ts`: an in-memory tracker in `EngineState.directorJobs: Map<JobKey, DirectorJob>`, modelled
on `gate-jobs.ts`. A job is `{ key, kind, subject, startedAt, done: Promise<void>, outcome? }`. Starting a job never
awaits it; its `finally` calls `requestTick`. Keys give the ordering guarantees:

- `card:<id>` for `card_chat` and planning turns: **at most one in-flight job per card.** Rows for that card stay FIFO
  (claimed in `id` order, one turn reads the whole history, as today).
- `ticket:<id>` for triage, steer reply, escalation steps and the dispatch brief: **at most one per ticket.** Tick
  phases that move a ticket (triage, escalation sweep, dispatch, setup recheck) skip a ticket whose key is in flight.

Two kinds of job, by what they may write:

- **Card turns run whole in the job** (`runPlanningTurn` / `answerCard` unchanged in logic). They write only card,
  planning and card-event rows through `transitionCard()` with CAS, and the plan approval door `approvePlanTx`, which the
  HTTP approve already calls outside the tick. The single-writer-per-card rule is the per-card key.
- **Ticket steps compute in the job, apply in the tick** (gate-jobs pattern; keeps director-core.md §2 "ticket state
  moves only in the tick"). The job holds the parsed step output; the next tick re-reads the ticket, checks it still
  matches (status, wake id, interaction still pending) and applies through the existing door, else drops the output.

**Dispatch becomes two-phase.** Tick: `pickFrom` picks; for each pick it starts a `brief` job (worktree create,
memory slice, `dispatch_prompt`) and records a **slot reservation** `state.briefing: Map<ticketId, {project, harness}>`
that `planDispatch` counts as running (`schedule.ts:171-182`) and excludes from candidates, so limits (d-0097) hold.
Next tick: re-validate the candidate, then `launchRun` + `moveTicket` (fast, in the tick). A failed brief keeps today's
`rejectStep` + `hold('dispatch:<id>')`. Brief jobs do NOT take a Director slot (Worker limits already bound them), so
Workers never queue behind planning.

### 3.2 Concurrency (data, d-0150)

`DirectorConfig.max_concurrent_steps`: int 1..8, **default 3**, `.default(3)` in the zod schema so stored overrides
written before this change still validate (a failing override skips every tick, `engine.ts:104-113`). Edited on the
Director settings page with the other limits. One semaphore across card turns, triage, steer replies and escalation
steps. When slots are short, the tick starts work in this order: Worker-blocking steps (steer reply, ticket answer,
recover, substitute) → owner-waiting card turns (rows with `user_message`, oldest row first) → `start_planning` /
`card_created` turns → triage. A card turn holds its slot for the whole turn (one model call at a time inside it).

### 3.3 Claim and lease (crash-safe, d-0092, d-0134)

No new table. The durable debt is still `card_reply_queue`; ticket-step debt is the ticket / interaction state itself,
re-derived each tick (as gate jobs are). Changes to `CardReplyQueueRepository` (core port, both adapters):

- `claim(at, staleBefore, { exclude: CardId[], maxCards: number })`: claims rows of at most `maxCards` distinct cards
  (oldest open row first), never a card in `exclude` (the cards with a job in flight). Today's claim-everything would
  mark rows of cards with no free slot claimed and strand them for 10 minutes.
- `releaseClaims()`: sets `claimed_at = NULL` on every open row. Called once in `reconcileRestart` (first tick): Forge
  is one process per data folder, so any claim present at boot belongs to a dead process. Resume after a crash is then
  immediate instead of 10 minutes; `STALE_CLAIM_MS` stays as the backstop for a hung in-process job (step timeouts
  already bound each call).

Restart and failure: a job is a pure function of stored state, so a lost job is simply re-run (accepted cost: a model
call that finished but did not write is paid twice). A job that throws keeps today's semantics (planning `retry`,
`failChat` note). Shutdown waits for in-flight Director jobs up to `engine.shutdown_drain_ms`, then abandons them;
their rows are released at the next boot.

### 3.4 Clocks and timestamps

- `launchRun`: `started_at = iso(deps.clock.now())` at insert, and the `status: 'running'` update after
  `driver.start` also stamps `last_event_at = now` (`launch-run.ts:59`, `:135`). The stall scan keeps reading
  `last_event_at ?? started_at`, which is now the spawn. No schema change.
- Jobs get `jobCtx(ctx)`: a copy with `now`/`nowIso` read at job start and its own `report`, merged into the next
  tick's report on collect (so `rejectedSteps`/`errors` are not lost after the tick returned). Writes after a model
  call use the live clock (`stamp()`-style), e.g. `card-chat.ts` `director_message` and `completeRows`.
- `moveTicketTx`: `updated_at = max(nowIso, current.updated_at, current.created_at)` (`ticket-moves.ts:70`), and the
  launch path passes the live clock. Monotonic by construction.

### 3.5 Quality fixes (separate step)

1. **Lane.** (a) `preCheckLane` body input = the plan ticket's own `body` only, not `ticketBody()`. (b) Record the
   raise reasons on the card event and ticket (`Lane raised from express to standard: 4 files predicted (> 3)`).
   (c) Owner-set lane (open question Q1): `PlanTicket.lane_by_owner?: boolean`, set only by the owner's light ticket
   edit (`plan-edit.ts`, new `lane` edit) or by Request changes the Director turns into an edit; when true, size raises
   (files, body) are skipped and only the Tier C raise applies.
2. **Owner answers honoured.** `WritePlanOutput.decision_checks: [{ index, status: 'honoured' | 'conflict', where }]`,
   one per `grill_decisions` entry. Engine: a missing index is `invalid_output` (retried once by `runStep`); any
   `conflict`, or a decision the planner marks honoured whose text the engine finds negated in `non_goals` by the
   same key noun (cheap check, flags only), fails the floor with a named reason, so the card stops at Needs you
   showing the conflict. `write-plan` and `approve-plan` playbooks gain "owner answers outrank your defaults; never
   contradict a decision in scope or non_goals".
3. **Survey must read.** New `survey-code` playbook (core `domain/playbooks/survey-code.ts`, wired as the survey
   step's `playbook_id`). Round 0 input gets `repo_files` (tracked paths at HEAD via `repoReader` glob through
   `admitDirectorRead`, capped 400). Guard in `readStep` for `card_survey`: findings with 0 files read while the repo
   has tracked files and a round remains are treated as a read round with `previous_error: "read the files you need
   before findings"`; if still 0 at the last round the survey is stored with `read_nothing: true` and the grill input
   carries it so the grill playbook says "do not ask what code can answer; say the survey could not read".
4. **Dedupe.** Pure `core/src/domain/dedupe-statements.ts`: normalise (case, whitespace, punctuation, leading
   `Risk:`/`Assumption:`), then drop near-duplicates by token-set Jaccard >= 0.8, keeping the first. Used for risks and
   assumptions in `composePlan`; `write_plan` input gets the known risks with "add only new risks".
5. **Spend defaults** (`builtin-config.ts`, owner can change in Director settings): `dispatch_prompt` sonnet,
   `approve_plan` sonnet (tool-less judgement over typed findings behind a deterministic floor), `triage` sonnet,
   `steer_reply` sonnet, `verify` sonnet. Keep opus for `card_survey`, `write_plan`, `enhance`, `ticket_recover`,
   `ticket_check`, `card_chat`. Mirror in `apps/web/src/domain/director-defaults.ts`. Express already skips enhance
   (d-0141 item 10); skipping verify for Express is Q3.

## 4. Schema and migration

- No DB migration. Core schema changes: `DirectorConfig.max_concurrent_steps` (default 3); `PlanTicket.lane_by_owner`
  (optional); `WritePlanOutput.decision_checks`; `CardSurveyOutput` unchanged, `GrillState.survey.read_nothing`
  (optional). All optional or defaulted so stored plans, config rows and grill state parse unchanged.
- Port: `CardReplyQueueRepository.claim` options + `releaseClaims()`; contract test covers both adapters.

## 5. Files per package (layers respected)

- `packages/core`: `schemas/director-config.ts`, `domain/builtin-director.ts`, `types/ports/card.types.ts`;
  step 3: `schemas/plan.ts`, `schemas/director-steps.ts`, `domain/dedupe-statements.ts` (new), `domain/builtin-config.ts`,
  `domain/playbooks/{survey-code (new),write-plan,approve-plan,plan-grill}.ts`, `index.ts`.
- `packages/db`: `adapters/sqlite/card-reply-queue-repository.ts`, `adapters/memory/memory-storage.ts`, contract test.
- `packages/engine` (pure over ports): `tick/director-jobs.ts` (new), `types/director-jobs.types.ts` (new),
  `types/engine-state.types.ts`, `types/engine.types.ts` (`directorJobsInFlight()`, `idle()`), `tick/engine.ts`,
  `tick/card-chat.ts`, `tick/restart.ts`, `tick/launch-run.ts`, `tick/ticket-moves.ts`, `tick/dispatch.ts`,
  `tick/dispatch-run.ts` (split into brief + launch), `tick/schedule.ts`, `tick/triage.ts`, `tick/steering.ts`,
  `tick/escalation-director.ts`; step 3: `tick/plan-to-tickets.ts`, `tick/plan-edit.ts`, `tick/planning-plan.ts`,
  `tick/planning-floor.ts`, `tick/planning-steps.ts`, `tick/planning-input.ts`.
- `packages/drivers`: `domain/director-step-prompts.ts` (survey, write_plan, approve_plan text).
- `apps/server`: `services/shutdown.ts` (await Director jobs within the drain budget); composition unchanged.
- `apps/web`: Director settings limits field (`domain/director-settings.ts` + its form component), `domain/director-defaults.ts`.

## 6. Tests (red first, d-0015)

Engine (`packages/engine/__tests__/tick/`), fake LLM with a deferred promise the test resolves by hand:
1. **director-jobs-dispatch.test.ts**: card A's planning step is pending (unresolved); a planned ticket B in another
   project ticks: B's run starts (driver.start called, `report.dispatched` has B) while A's step is still pending. Red today.
2. Settle and stall scan run while a Director step is pending (a finished run settles in the same tick).
3. Concurrency: 4 cards owed turns, `max_concurrent_steps: 3` → 3 steps in flight, the 4th starts when one resolves;
   never two jobs for one card, even with a new owner message mid-turn (it is claimed after the turn).
4. Claim: rows of a card with no free slot stay unclaimed; `releaseClaims` at first tick → a row claimed before a
   simulated restart is answered on the first tick, not after 10 minutes (fake clock).
5. Ticket step apply-in-tick: a triage output for a ticket cancelled meanwhile is dropped, no state write.
6. Brief reservation: 2 picks with global limit 2, both briefing → a third ready ticket is not picked.
7. Timestamps: fake clock advances 5 min during `dispatch_prompt`; run `started_at` = spawn time, ticket
   `updated_at >= created_at`; a run started after a long brief is not killed by the next stall scan.
8. Report: a rejected step inside a job appears in the next tick's report.
Core/db: contract test for `claim` options and `releaseClaims`; property test `dedupeStatements` (idempotent, order
kept, never drops a distinct item); `max_concurrent_steps` default parses old config rows.
Step 3: lane input uses ticket body only and logs reasons; `lane_by_owner` skips size raise, keeps Tier C; missing
`decision_checks` index → retry; `conflict` → floor fails with named reason; survey zero-read guard forces a read
round and sets `read_nothing`; risks dedupe on the T1 fixture (11 → 4). Update `rig.ts tickToIdle` to also drain
`directorJobsInFlight()`, so existing scenario tests keep reading as before.

## 7. Docs

`docs/design/director-core.md` §2 (tick enqueues/collects; ticket steps applied in the tick; card turns via doors) and
§5 (step jobs, concurrency); `packages/engine/README.md`, `packages/db/README.md` (claim/lease), `packages/core/README.md`
(new schema fields, playbook), `apps/server/README.md` (shutdown drain), `apps/web/README.md` (setting);
`PRODUCT.md` status + progress log line; new decision record for Q1 once answered (amends d-0141 item 9).

## 8. Builder steps

1. **Jobs + card turns + clocks** (~15 files): core config field + port, db adapters + contract test,
   `director-jobs.ts` + types, engine state/types/engine.ts, `card-chat.ts`, `restart.ts`, `launch-run.ts`,
   `ticket-moves.ts`, `rig.ts`, tests 1-4, 7, 8. Biggest win: planning no longer blocks dispatch.
2. **Ticket steps + two-phase dispatch + settings/docs** (~15 files): `dispatch.ts`, `dispatch-run.ts`, `schedule.ts`,
   `triage.ts`, `steering.ts`, `escalation-director.ts`, `shutdown.ts`, web settings field, tests 5-6, docs + PRODUCT.md.
3. **Quality** (~15 files): section 3.5 items 1-5 with their tests; can run in parallel with step 2 (disjoint files
   except `planning-*`, which step 2 does not touch).

## 9. Risks

- Card turns now run concurrently with the tick: any card write outside `transitionCard()`/CAS becomes a race. Builder
  audits `planning-*.ts` writes; the per-card key is the guard.
- Test churn: ~40 planning/chat tests assume one `tick()` finishes a turn. Mitigation: `tickToIdle` drains jobs.
- More parallel Director calls on one subscription can hit rate limits faster; `retryNotBefore` holds already exist,
  and the default 3 is conservative.
- Job reports outlive their tick; a dropped merge hides a rejected step. Test 8 pins it.
- Sonnet defaults could lower plan-approval quality; the floor stays deterministic and stricter-only.

## 10. Open questions (recommended answer first)

- Q1. May an owner-set lane skip the size raises (files > 3, body length) while Tier C still forces Full? **Yes**, only
  via the owner's own edit (`lane_by_owner`), recorded as a new decision amending d-0141 item 9. Without it, only
  fixes 1a/1b ship and the T2 outcome can recur.
- Q2. Default `max_concurrent_steps`? **3** (range 1-8).
- Q3. Skip `verify` for Express cards? **No for now**: verify feeds the overlap floor for auto-approve; revisit with
  per-step cost data. Run it on sonnet instead.
- Q4. Should brief (`dispatch_prompt`) jobs count against the Director limit? **No**: Worker limits bound them, and
  counting them would put Workers back behind planning.
- Q5. Template the brief for retry/continuation runs instead of calling `dispatch_prompt`? **Not in this fix**; measure
  after the sonnet default lands.
