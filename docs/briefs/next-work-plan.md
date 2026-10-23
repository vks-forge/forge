# Next work plan (2026-10-23)

Source list: `docs/briefs/next-work-queue.md` (items A-Z and AA, the open eval items) and
`docs/reports/2026-10-23-anneal-comparison.md`. This file sets the order, the steps, the owner decisions each phase
needs and when a step counts as done. Nothing starts until the owner says go.

## Rules for every step

- Forge serves any language (d-0176): no Node-only logic or wording; ecosystem specifics are editable detector data.
- The owner gets only real judgement calls (d-0181, d-0182): if Forge or the Director can decide from the plan, the
  code, the checks or memory, it decides and records why on the card.
- One builder (sonnet subagent) at a time on the shared tree; many steps touch the same escalation and copy files.
  The orchestrator writes no source, runs every gate itself and reads changed tests before accepting a step.
- Red test first for every bug (d-0015). Gates per step: `npx tsc -b`, eslint, prettier, `git diff --check`, golden
  unchanged, `vitest --project unit`, `heavy` when the engine or adapters change, `web` + `pnpm -C apps/web build` when
  the web changes. Failed web tests are re-run alone before being called red.
- UI steps: builder invokes hallmark and nielsen-heuristics first.
- Every step updates the package README and `PRODUCT.md` (section + progress log line) when a reader's picture changes.
- Never run WIP code against the owner's 4310 data; live checks run on a separate instance.
- Commit and push only with the owner's permission in that turn; a red CI run is fixed forward first.

## Owner decisions needed (asked one at a time, at the start of the phase that needs them)

| # | Question | Recommended answer | Phase | Amends |
|---|---|---|---|---|
| Q-1 | Does an owner Retry grant a fresh rework round? | Yes, one fresh round of the automatic cap | 3 | d-0165 |
| Q-2 | At the rework cap, does the Director decide before the owner (targeted rework when a finding has evidence and a fix; owner only for scope, conflicting findings, or the same failure after the Director's round)? | Yes | 3 | d-0165 |
| Q-3 | Mechanical failures (lockfile, generated file, merge clash) get their own repair budget separate from rework? | Yes, 2 tries, stop early when the same failure repeats | 3 | d-0165 |
| Q-4 | d-0181 details: what counts as "secrets paths", what the revert does, where the notice shows | Secrets = the tier C secret globs + env files; revert = a revert PR through the merge door; notice = Inbox notice lane + card history | 3 | d-0181 |
| Q-5 | Re-plan from a ticket re-plans only that ticket and its dependents? | Yes; whole-card re-plan becomes a separate action on the card | 3 | d-0134 |
| Q-6 | Setup (package install) stops holding a Worker slot, with its own limit? | Yes, setup limit 2 | 4 | d-0097 |
| Q-7 | Default Workers per project 2, plus a machine-load gate? | Yes | 4 | d-0097 |
| Q-8 | Projects made before detection: detect automatically on next start, or ask once? | Detect automatically, show what was found, owner can edit | 4 | - |
| Q-9 | The Director may lower the card's lane hint per ticket (with a reason shown in the plan)? | Yes; owner-set lanes and tier C stay as they are | 3 | d-0177 note |
| Q-10 | Does the Inbox page also move to the pill + modal style? | No, Inbox keeps its list; ticket and card pages get pill + modal | 2 | - |
| Q-11 | A pipeline / agent version used by a ticket is frozen for that ticket? | Yes | 5 | d-0075 |

All answered 2026-10-23: the owner accepted every recommended answer ("approved"). Records: Q-1/Q-2 d-0184, Q-3 d-0185,
Q-4 d-0186, Q-5 d-0187, Q-6/Q-7 d-0188, Q-8 d-0189, Q-9 d-0190, Q-10 d-0191, Q-11 d-0192. x-0016 and x-0017 approved.

## Phase 0: close the open loop (before any new code)

| Step | What | Size | Done when |
|---|---|---|---|
| 0.1 | Re-run Director concurrency step 2 web tests and web build (last run was stopped for memory) | gates only | web project green (flaky files re-run alone), build passes |
| 0.2 | CI fix-forward: the 3 test files (`scorecards.test.ts`, server and cli `data-home.test.ts`) | ready | owner approves the commit and push; CI green on main |
| 0.3 | Owner approves x-0016 (merge base into ticket branch) at a natural pause | question | moved to decisions/ or rejected/ |

## Phase 1: bugs that block work now

| Step | Items | What | Size | Notes |
|---|---|---|---|---|
| 1.1 | R, X3 | One pure `decideMerge(input)` for every merge path: gate rows, the owner's stage overrides, head and base; ancestry re-checked at write time; the merge record names any override | small, engine | Red tests: failed G1 + owner override merges; without override refused; head moved refused. Also check the verify phase and the Director sign-off path use it |
| 1.2 | V1, V2, V3 | One rule for which tickets a new plan keeps (any run, branch or open item = kept unless the plan names it replaced); a pre-approval check that every cancelled ticket's acceptance items and files are covered or dropped on purpose; approval view lists "Will be cancelled" and "Not covered" | medium, core + engine + web | Data repair note for CHE-3 / CHE-6 handled live by the owner (already restored as CHE-27 / CHE-28) |
| 1.3 | W1, W1b, W1c, W2 | Ticket edit door: `PATCH /tickets/:id` for description, priority, dependencies (cycle check via `findCycle`), each logged on the card; owner controls on the ticket page; card-chat Director actions for the same; Director told which owner controls exist; restore tickets inherit priority; ticket ids shown instead of plan keys once tickets exist | medium, core + server + engine + web | Schema first (zod body), one door per field |
| 1.4 | F | Retries carry their context: the escalation answered, last gate and review findings, last run summary (`wake-delta.ts`) | small, engine | Red test: retry after a review hold, brief contains the finding |
| 1.5 | A | A ticket whose setup just finished wins the slot over other waiting tickets, retries included | small, engine | Red test from the CHE-2 / CHE-6 timeline |

## Phase 2: honest status and fewer, clearer owner stops

| Step | Items | What | Size |
|---|---|---|---|
| 2.1 | N, C, S3, Q2, X (row 17) | Server-derived `phase` (queued, setting up, waiting for a slot, working, checking, waiting for you, held by re-plan) and `wait_reason` (who holds the slot, which ticket blocks, which card is re-planning) on every ticket view; an answer that needs a new run shows "Queued" until the run starts; a ticket in waiting-for-you with no open item is logged and shows its real reason | medium, core + engine + server |
| 2.2 | Q1, Q3, row 18 | Needs you = open owner items only; tickets waiting on a re-plan link to the card's plan approval; after an answer the item leaves at once with a "what happens next" line; a separate "notice" lane for no-action items | medium, server + web |
| 2.3 | L | Pill near the ticket / card title ("Needs your attention · 2") opening a scrollable modal with the full escalation(s); closing does not answer; Esc closes; focus returns | medium, web (hallmark + nielsen) |
| 2.4 | T4, K4 | Confirmation popups that list real consequences for Re-plan, Cancel ticket and Merge anyway (from live data, cheaper action offered when it fits, Cancel focused); sign-off cards lead with the Director's recommendation and evidence | medium, web + server |
| 2.5 | Z | "Close all" on the notification stack (dismissible ones only) and "Mark all read" on the Inbox notice lane | small, web (hallmark + nielsen) |
| 2.6 | eval-fix-6 C | Trustworthy status part of the cost/cancel/status brief (what 2.1 does not already cover) | per brief |

## Phase 3: the Director decides what it can (autonomy)

| Step | Items | What | Size |
|---|---|---|---|
| 3.0 | AA (d-0183) | Per-harness "Bypass permissions" setting, default on: harness skip-permission mode via its driver, ask rules allow, Forge hook keeps the hard floor (secrets / data folder, outside worktree, push, destructive); warning shown in harness settings | medium, needs a brief (core config, drivers, tools, web) |
| 3.1 | M, E, I (d-0182) | Routine commands per ecosystem as editable detector data (install/add, codegen, build, lint, test, format) allowed without asking; the Director answers in-plan approvals and questions; the owner only for secrets, outside the worktree, unknown hosts, destructive commands, pushing; questions carry a recommendation and do not stall for days (Director answers or escalates before the timeout) | large, needs a brief (tools, engine, core data, web settings) |
| 3.2 | H, X1, G | Typed findings (id, severity, file, line, evidence, required fix, reviewed head) and a disposition per finding (adopted / rejected / merged, with code and test evidence) in the Worker's output; the critic runs blind to the reviewer; at the cap the Director decides (Q-2); owner Retry grants a fresh round (Q-1) | large, needs a brief |
| 3.3 | T1, T2, Q-3 | Re-plan carries the stop (cause, report, findings); mechanical failures get a targeted repair with their own budget and a same-failure stop; after a conflict resolve the package manager regenerates the lockfile | medium |
| 3.4 | S1, S2, T3, Q-5 | Ticket-level re-plan (the rest of the card keeps running); the Director settles housekeeping questions from plan, code and memory before asking; the dialog says exactly what changes | medium-large |
| 3.5 | K2, Q-4 (d-0181) | The Director signs tier C when the floor is clean; owner notified with diff and one-click revert | medium |
| 3.6 | eval-fix-5 step 3, U, Q-9 | Director quality (lane per d-0177, decision checks, survey zero-read guard, statement dedupe, Sonnet defaults) plus lane per ticket from its own facts; the card hint is not a floor | medium |

## Phase 4: speed

| Step | Items | What | Size |
|---|---|---|---|
| 4.1 | B, O, X7, Q-6, Q-7 | Setup has its own limit and takes the Worker slot only at launch; default 2 Workers per project; machine-load admission gate; project page shows the limit and who holds each slot | medium |
| 4.2 | X8 | Engine woken on events (stage settled, slot freed, setup done, answer given); the tick stays as a safety sweep | medium, engine |
| 4.3 | D, X5 | Content-addressed dependency cache for any ecosystem: key = hash of the declared lock / manifest files + toolchain + OS/arch (from detector data); restore by copy; size budget with eviction | large, needs a brief (gates adapter, core data, settings) |
| 4.4 | J, X2, Q-8 | Older projects detected; a project with no configured check blocks with "checks not run" instead of passing | small-medium |
| 4.5 | X10 | Local bare mirror per remote for projects without a local checkout | small, later if needed |

## Phase 5: see what happened

| Step | Items | What | Size |
|---|---|---|---|
| 5.1 | P, X4 | History tab on tickets and cards: every state change with who, why, from / to; questions with answer and wait time; runs, checks, retries, Director decisions, setup, merge; filters; one ordered server endpoint; `Forge-Ticket` / `Forge-Run` commit trailers | medium-large, needs a brief |
| 5.2 | Y, X6 | Live progress on board tiles: stage n/m and name, state chip, live run line with timer, wait reason, one action, cost so far; card tiles roll up their tickets; per-step "usually $X / N min" | medium, web (hallmark + nielsen) |
| 5.3 | eval-fix-6 A, B | Honest cost ledger (migration `director_spend`) and cancel a ticket (d-0179) | per brief, 2 steps |
| 5.4 | X9, Q-11 | Pipeline / agent version frozen per ticket; `role-model-effort` agent names | small |

## Phase 6: chat and language

| Step | Items | What | Size |
|---|---|---|---|
| 6.1-6.3 | eval-fix-9 | Compact Director question, folded log lines, keyboard and focus bugs, one glossary, layout quick wins | per brief, 3 steps |

## Phase 7: finish

| Step | What |
|---|---|
| 7.1 | Trim the engine (276) and server (153) READMEs to 150 lines |
| 7.2 | Live end-to-end check on a Node repo and a Python repo on a separate instance: card → plan → tickets → merge with no routine owner stops; record times and owner stops vs the CHE-C1 run |
| 7.3 | Session outcome under `.forge/memory/outcomes/2026-10/`; MEMORY.md back under 200 lines |

## Order and why

1. Phase 0, then Phase 1: R, V and W block real work today; F and A are small and remove repeat failures.
2. Phase 2 before Phase 3: the owner needs to trust what the board says before Forge starts deciding more on its own.
3. Phase 3 is the biggest win for "the owner does not take every decision"; each large step gets its own brief and
   approval first.
4. Phase 4 after 3: speed matters once stops are gone; the cache needs a brief.
5. Phases 5-7 polish and prove it.

Steps inside a phase run in the listed order unless their files are disjoint and the orchestrator says so.

## Risks

- Phase 3 widens what runs without the owner; every new automatic decision is logged on the card and has a test
  showing the owner path still triggers for the risky cases.
- Shared files (`escalation*.ts`, `escalation-copy.ts`, `schedule.ts`) make parallel builders unsafe; keep one at a time.
- The 4310 instance runs the working tree's build; rebuild and restart only when the owner asks.

## Progress (autonomous run, night of 2026-10-23)

Each step built by a sonnet builder; gates re-run by the orchestrator before marking done.

| Step | Status | Notes |
|---|---|---|
| 0.1 | done | Director concurrency step 2 web verified |
| 1.1 R / X3 | done | `domain/decide-merge.ts` shared by verify and Approve and merge; owner override counted; failed setup never overridable |
| 1.2 V | done | `core/domain/plan-keep.ts` (a run or open item keeps a ticket; the owner's re-plan origin is replaceable), `plan-coverage.ts`; approval lists Will be cancelled / Not covered / Already exists; Director auto-approve refused when uncovered |
| 1.3 W | done (plan tab ids left) | `PATCH /tickets/:id`, card-chat actions for dependencies / priority / description via `tick/ticket-edit.ts` through the ticket-moves door |
| 1.4 F, 1.5 A | done | retries carry escalation, findings, last run; `prepared` rank in pick-next |
| 2.1, 2.2 | done | `TicketPhase` / `TicketWait`, slot holders, Needs you = open owner items, `next` line; phase chip and wait line in the UI |
| 2.3 L | done | needs-you pill + modal on ticket and card pages |
| 2.4 T4 / K4 | done | consequence popups (Re-plan, Cancel, Merge anyway) from `GET /tickets/:id/consequences`; sign-off cards lead with a recommendation |
| 2.5 Z | done | Close all on the notification stack; Inbox Notices view with Mark all read (`POST /projects/:slug/inbox/read-all`) |
| 3.0 AA | done | d-0183: harness bypass default on (migration 0031), hard floor in tools, Claude `bypassPermissions`; probe 12: hook still blocks under bypass |
| 3.3 T1 | done | re-plan carries the stop (`replan_from`) |
| 3.5 K2 | done (no revert path yet) | Director signs clean tier C (d-0181); built-in secret-path list; card note names the merge commit to undo |
| 3.6 (part) | done | eval-fix-5 step 3: lane reasons logged, owner lane honoured, decision_checks, survey zero-read guard, statement dedupe, Sonnet defaults; per-ticket lane lowering waits for Q-9 |
| 4.2 X8 | done | engine woken on events; timer for not_before / pauses |
| 4.3 D / X5 | done | shared package-manager download caches per ecosystem + copy restore for relocatable outputs (node_modules, vendor); setup cache settings and Clear action |
| 5.1 P / X4 | done | history endpoints + History tab on tickets and cards; Forge-Ticket / Forge-Run trailers on Forge's own commits |
| 5.2 Y | done | live progress on board tiles (stage n/m, run line with clock, action, cost, updated) |
| 5.3 eval-fix-6 | done | director spend ledger (migration 0032, proposal x-0017), cancel door + Director cancel only on the owner's word, status fixes, web split / cancel menu / status rows |
| 6 eval-fix-9 | done (step 1 folded into L) | log folds + a11y, plain-words glossary, one-tap recommended answer, protected-files wording |
| 7.1 | done | engine README 144, server 147 |
| extra | done | plan editor lane picker (owner-set lane, "Set by you") |
| final gates | green | tsc 0, eslint 0 errors, prettier clean, diff check clean, unit 8379, heavy 976, web 2019, web build ok |
| fixes | done | base sync re-gates against the new base after main moves; memory tests follow r-0005 superseded; web fakes follow the cost split |

Owner answers received 2026-10-23 (d-0184..d-0192); now unblocked: Q-1/Q-2 (3.2 findings dispositions, Director at the cap), Q-3 (3.3 T2 mechanical budget),
Q-5 (3.4 ticket-level re-plan), Q-6/Q-7 (4.1 setup off the slot, 2 Workers default), Q-8 (4.4 detection + checks not
run), Q-9 (per-ticket lane lowering), Q-11 (5.4 version freeze). Also 3.1 routine-command list (lower value now that
bypass is on by default), 7.2 live end-to-end check, commit and push.
