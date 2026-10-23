# Next work queue (2026-10-23)

Collects work found after `eval-fixes-plan.md`, so it can be ordered together with what the owner adds next.
Nothing here starts until the owner says go. Owner rule for all of it: d-0176 (any language, never Node-only).

## Still open from `eval-fixes-plan.md`

1. Director concurrency step 2: web tests and web build not yet verified by the orchestrator (run reaped for memory).
2. Director concurrency step 3 (quality): lane per d-0177, decision checks, `survey-code` zero-read guard,
   `dedupe-statements.ts`, Sonnet defaults.
3. Cost / cancel / status steps 1-3 (`eval-fix-6-cost-cancel-status.md`, migration 0031 `director_spend`).
4. Chat and language steps 1-3 (`eval-fix-9-chat-and-language.md`).
5. Live end-to-end check on a Node repo and a Python repo, on a separate instance (not 4310).
6. CI fix-forward of the 3 test files (CI red on 81b645b); commit and push only with owner permission.
7. Trim oversized READMEs (engine 276 lines, server 153).

## New: slow start after Retry (CHE-2, 2026-10-22)

**What happened.** Owner pressed Retry on CHE-6 (19:02:49) and CHE-2 (19:02:53). CHE-2's Worker started at 19:06:15,
3 min 22 s later. Project `check` allows one Worker (`max_concurrent_per_project: 1`).

| Time (UTC) | Event | Cost |
|---|---|---|
| 19:02:49 | CHE-6 takes the only slot, starts "Install packages" (npm install) | |
| 19:02:53 | CHE-2 waits on Planned, no slot | 75 s waiting on CHE-6's install |
| 19:04:07 | CHE-6 install done (78 s); the slot frees up | |
| 19:04:08 | Pick order chooses CHE-2 over the already-prepared CHE-6; CHE-2 runs its own install | 90 s |
| 19:05:50 | 4310 restarted; the brief in progress is lost | |
| 19:05:51 | New server: install already done ("ready in 1 s"), brief written again | 25 s |
| 19:06:15 | Worker starts, ticket moves to In Progress | |

Evidence: `wake_requests`, `card_events` notes "workspace ready in N s", `worktrees/check/.forge-prep/CHE-*.json`
(`Install packages` 78 464 ms), worktree folder mtimes, `server.lock` time.

Earlier and larger: CHE-2 sat blocked 2026-10-20 → 22 because the Worker's permission question (Write on
`prisma/migrations/**`, `npx prisma migrate diff`) went unanswered and timed out.

### Fixes

| # | Fix | Size | Notes |
|---|---|---|---|
| A | A ticket whose preparation has finished wins the slot over every other waiting ticket, retries included | Small, 1 builder | `packages/engine/src/tick/schedule.ts` sets `wake` true for a finished prep, but a ticket with its own due wake ties with it and the lower number wins (`domain/pick-next.ts` order). Needs a distinct rank above `wake`. Test: two retried tickets, one prepared, slot of 1 → the prepared one starts. |
| B | Preparation does not hold a Worker slot | Feature, brief + decision | Today a prep job counts as running (`schedule.ts`), so a one-Worker project installs one ticket at a time. Give preparation its own small limit (e.g. 2, in settings); take the Worker slot only at launch. Changes the d-0097 slot rule → new decision record. |
| C | Planned card says why it waits | Small, UI | E.g. "Waiting for a Worker slot: CHE-6 is installing packages (0:42)". Check first whether the 4310 web build already shows the wait line from worktree setup step 3 (`ticket-wait.tsx`); extend `wait-reason.ts` with the slot holder. UI builder runs hallmark + nielsen. |
| D | Cheaper installs, any ecosystem | Feature, brief | Shared package caches per ecosystem (npm `--prefer-offline`, pnpm store, uv/pip cache, cargo, go mod) declared in the setup plan, not hard-coded to Node. Worktrees made before setup existed pay a cold install once. |
| E | Permission questions do not stall a ticket for days | Medium | Offer "Always allow in this project" for safe tool commands (e.g. `npx prisma …`), and/or let the Director answer or escalate before the timeout. Overlaps the approvals work (d-0175, d-0178); check what is already built first. |

Restart cost (25 s) is expected; no fix planned beyond keeping the prep record, which already works.

## New: CHE-6 handed back to the owner for a decision Forge could make (2026-10-22)

Owner principle (to record as a decision when work starts): Forge exists so the owner does not take every decision;
the Director decides what it can judge, the owner gets only real judgement calls.

**What happened.**
1. 2026-10-20: the reviewer blocked CHE-6 because the code imports `zod` but `package.json` does not list it. The
   Worker tried `npm install zod`; the `ask` rule denied it (pre-d-0175 build). It asked the owner; the Director's note
   was "The question goes beyond the plan, so the choice is yours". Unanswered → timed out → parked 2.5 days.
2. 2026-10-22 19:08: owner pressed Retry. The retry brief said "owner-requested retry with no previous run on
   record": `wakeDelta` (`packages/engine/src/tick/wake-delta.ts`) returns `previous_run: null` for every
   `*_retry` wake and passes neither the escalation it answers nor the last review findings. The Worker found the
   files present, changed nothing, ran no tests, finished in 27 s.
3. The reviewer found the same `zod` finding. Rework count was already 2 of 2 (the cap), and Retry does not reset it,
   so the ticket went straight to the owner as `findings_hold` (waiting_human).

Also seen: project `check` has `ecosystems_json: []` (created before detection), and the 10-20 gate report said no
project checks were configured, so no test run ever proved CHE-6's code.

### Fixes

| # | Fix | Size | Notes |
|---|---|---|---|
| F | A retry carries its context: the escalation it answers (question, options, why it stopped), the last gate and review findings, and the last run's summary | Small-medium | `wake-delta.ts` retry branch; facts already stored (`interactions`, `stage_runs.outcome_json`). Test: retry after a review hold → brief contains the finding. Bug fix, no decision needed. |
| G | An owner Retry grants a fresh rework round | Small + decision | Today a retry at the cap fails back to the owner on the first blocking finding. Amends d-0165's cap handling. |
| H | At the rework cap, the Director decides before the owner: a finding with clear evidence and a concrete fix → one more targeted rework with that fix as the instruction; owner only for real judgement (scope change, conflicting findings, repeated same failure after the Director's round) | Medium + decision | Amends d-0165 ("then to the owner"). Logged on the card so the owner sees what the Director decided. |
| I | The Director answers Worker questions and approvals it can judge within the plan: e.g. adding a dependency the ticket's own code imports, through the project's package manager (any ecosystem, d-0176), with the lockfile updated by the tool. Owner only for risky actions (secrets, outside the worktree, unknown network hosts, destructive commands) | Medium-large + decision | Amends d-0175 (ask → owner). Merges with E above. The Director's "the choice is yours" on a missing dependency is the failure to fix. |
| J | Projects created before detection get detected (ecosystems, setup, checks) on next start or via one prompt, so gates run the project's tests | Small | "Detect again" exists in project settings; decide auto vs prompt. Without checks, G-steps prove nothing about the code. |

## New: CHE-2 waits for the owner's tier C sign-off (2026-10-22)

**What happened.** CHE-2 passed everything: G1, two reviewers (pass), the Director's check against the plan (pass);
findings 0 critical, 0 high, 3 medium, 6 low. It then stopped at the `sign-off` stage (`signer: director_or_owner`)
because the ticket is tier C (predicted C at planning, actual C: Prisma migrations and Auth.js user/session models).
The card says "Tier C changes (auth, migrations, secrets, billing) always need you." Project `check` has no own tier C
globs; the tier came from Forge's built-in rules.

**Why.** This is a locked owner rule, repeated in d-0012 (Tier C merges after the named signer's click), d-0136/0137
(the Director signs A/B only), d-0141, d-0145, d-0146, d-0149, d-0150 (shown greyed as a lock). Changing it needs a new
owner decision that supersedes those; it is not a bug.

**Options (owner to choose).**

| # | Option | Effect |
|---|---|---|
| K1 | Per-project switch "Who signs tier C: you / the Director", default you | Owner opts a project in (e.g. a new app with no users or live data); every other project keeps the human signer |
| K2 (chosen, d-0181) | Director signs tier C only when the floor is clean (all checks pass, no critical/high, matches the plan, no secrets paths), owner notified with the diff and a one-click revert | Fewer stops everywhere; risk moves to after-the-fact review |
| K3 | Narrow tier C: migrations and auth in a project with no production yet count as tier B | Greenfield projects stop asking; needs a "has production" project flag |
| K4 | Keep as is, but the sign-off card leads with the Director's recommendation and evidence so the click takes seconds | No rule change |

Whatever the choice, the sign-off card should show the Director's recommendation ("Sign: all checks passed, 0
critical/high, matches the plan") instead of only "always need you" (part of H's principle).

## Owner's next items

### L. Needs-you alerts become a pill plus a modal (UI)

Owner (2026-10-23, screenshot of the CHE-2 sign-off block): the full escalation block on ticket and card pages takes
too much space. Wanted:
- A small alert near the page title saying the item needs attention, with a button.
- The button opens a scrollable modal holding the full escalation (summary, reasons, checks, Director note, actions).
  It can be closed and opened again; closing does not answer it.

Scope: ticket page and card page (`routes/ticket/use-ticket-dock.tsx`, `routes/card/use-card-dock.tsx`) mounting
`components/escalation/escalation-card.tsx` and its kinds (`escalation-signoff.tsx`, `-permission`, `-question`,
`-failure`, `-decision`, `-setup`, `-worktree-setup`). The Inbox page keeps its own layout (decide in the brief).
Several open items on one ticket or card: one pill with a count, the modal lists them. Keyboard: Esc closes, focus
returns to the pill. UI builder runs hallmark + nielsen-heuristics. Size: medium, UI only.

### M. Routine project commands never ask the owner (decision d-0182)

Owner (2026-10-23): the Worker asked for permission to run a Prisma command; "this type of all work should be handled
by director or by the worker itself". Routine project tooling inside the worktree (package manager installs and adds,
code generators such as `prisma generate` / `prisma migrate diff`, build, lint, test, format) runs without asking the
owner: allowed for the Worker, or answered by the Director. The owner is asked only for risky actions (secrets,
paths outside the worktree, unknown network hosts, destructive or irreversible commands, pushing). Any ecosystem
(d-0176): the routine command list is detector data per ecosystem, editable, not hard-coded. Supersedes the
approval half of E and I above (E/I/M build as one piece). Size: medium-large, needs a brief.

### N. A ticket shows In Progress while no Worker runs

Seen 2026-10-22 19:25: owner answered CHE-6's hold with "Send back for rework". The answer moved CHE-6 straight from
waiting_human to in_progress, but no Worker could start: CHE-2 had just merged (19:24:41), CHE-3 became unblocked and
took the project's single Worker slot (its setup started 19:24:51, 86 s install). CHE-6's rework request sits pending
behind CHE-3 while the board says In Progress. Fix: an answer that needs a new Worker run puts the ticket in a queued
state (or keeps it out of In Progress) until the run starts, with the wait reason from C ("waiting for a Worker slot:
CHE-3"). Belongs with the trustworthy-status work in `eval-fix-6-cost-cancel-status.md` and item C. Also seen: CHE-3
asked permission for `npx vitest run …` (a test command), which M / d-0182 removes.

### O. One Worker per project is too slow a default

Every ticket of card CHE-C1 waits in line: one ticket's install, run, review and sign-off must end before the next
starts, even when the dependency graph allows two at once (CHE-3 and CHE-6 do not depend on each other). Fix: ship
`max_concurrent_per_project: 2` as the built-in default (`packages/core/src/domain/builtin-config.ts`, seed config)
and show the limit and who holds each slot on the project page, so the owner sees why work waits. Optional later: the
Director suggests raising it when independent planned tickets queue behind one slot. Size: small (default) + small UI.
Pairs with B (setup off the slot).

### P. History tab on cards and tickets

Owner (2026-10-23): cards and tickets move through many states (Planned, In Progress, Needs you, ...) and it is hard
to follow what a card or ticket has been through. Wanted: a History tab showing the full history, why it moved to
each state, written so a person understands it at a glance.

What it shows, newest last (or a toggle), grouped by day:
- Every state change with from → to, who did it (owner, Director, engine, Worker) and the reason in plain words
  ("Sent back: the reviewer found zod missing from package.json", "Waiting for a Worker slot: CHE-3 has it",
  "Signed off by you and merged").
- Questions, permission asks and escalations: what was asked, the answer, who answered and how long it waited
  (e.g. "Unanswered for 2 days, timed out").
- Runs and stages: which agent ran, model, how long, outcome; gate and review results with the blocking findings.
- Retries, reworks with the count against the cap, Director decisions (pipeline changes, auto sign-off under d-0181,
  answers under d-0182), setup ("workspace ready in 90 s"), merge and PR.
- A card's history includes its own phases (grilling, plan ready, approved, ...) plus a one-line roll-up per ticket
  linking to that ticket's history.

Data: mostly stored already: `card_events` (ticket_state with reasons, escalations, notes), `interactions`,
`runs`, `stage_runs`, `wake_requests`. Gaps to check in the brief: tickets without a card, state changes that carry
no reason (e.g. the rework answer moving CHE-6 to In Progress), and a server endpoint that merges these into one
ordered, typed list (core zod schema) with plain-language copy built in one place (web `domain/*-copy.ts`).
Long reasons fold with "Show more"; filters for "State changes only" and "Needs you only"; each entry links to its
run, review or question. Tabs: ticket page (`routes/ticket/tabs/`) and card page (`routes/card/tabs/`). UI builder
runs hallmark + nielsen-heuristics. Size: medium-large (endpoint + 2 tabs), needs a brief.

### Q. "Needs you" shows tickets that need nothing from the owner

Seen 2026-10-22 19:35: CHE-6 hit the rework cap (setup gate: `npm ci` failed after its package.json clashed with
CHE-2's). The owner answered "Re-plan" ("fix the issues"). The escalation closed and the card started re-planning,
but CHE-6 stayed `waiting_human` with the old blocked reason and **no open question**, so it kept showing in Needs
you; the owner opened it repeatedly with nothing to answer. The real item needing the owner was elsewhere: the card's
plan v4 approval (19:40, the Director asked questions before approving).

Fixes:
- Q1. A ticket waiting on a re-plan leaves Needs you: it shows as "Re-planning: waiting for plan v4 of CHE-C1"
  (Planned column or its own marker), and the plan approval on the card is the Needs-you item, linked from the ticket.
- Q2. One rule for the Needs-you column: an item appears only while it has an open question, approval or sign-off
  for the owner. A ticket in `waiting_human` with no open item is a bug: the engine logs it and shows the real wait
  reason instead (consistency check each tick, like the stale-run sweep).
- Q3. After the owner answers, the item leaves Needs you at once and a short line says what happens next ("The
  Director is re-planning; you will be asked when plan v4 is ready").

Also seen in the same window (to weigh against H, I, M, d-0181/d-0182): CHE-10 was held three times in 4 minutes
(config change to vitest.config.ts, critique finding, plan-check finding) and the owner pressed "Merge anyway" each
time; CHE-3 and CHE-6 both hit the rework cap on mechanical failures (G1 claim on generated `next-env.d.ts`,
lockfile out of sync after a package.json clash). These are the decisions the Director should take first.

### R. "Approve and merge" refuses work the owner already overruled (bug, blocks tickets)

Seen 2026-10-22 19:42 on CHE-10: G1 held the work (the Worker changed `vitest.config.ts`, a file that controls the
checks); review, critique and the plan check each held it with findings. The owner pressed "Merge anyway" on all
three holds. The pipeline strip then shows every stage "Passed, overruled by you", the ticket reaches the sign-off
stage, and "Approve and merge" fails every time with "the gates have no passing verdict for this run".

Cause: `overrideTx` (`packages/engine/src/tick/escalation-override.ts`) marks the held **stage rows** passed with the
override, but `approveAndMerge` (`packages/engine/src/tick/review-merge.ts:66-75`) checks the raw **gate_results** rows,
where G1 is still `failed`. The two doors disagree, so the only ways out are rework or cancel.

Fix: one shared verdict for the merge door: a gate whose stage row carries the owner's override counts as passed for
that run, and the merge record names the override (who, when, comment). Check every other caller of
`summarizeGates` for the same gap (verify phase, Director sign-off under d-0181). Red test first: G1 failed + owner
override → Approve and merge succeeds; G1 failed without override → still refused. Size: small, 1 builder. Priority:
first, it blocks finished work.

Separately, the sign-off card said "Tier A: low risk … The Director check against the plan did not pass cleanly, so it
needs you" right after the owner overruled that check; with R fixed, a fully overruled tier A ticket should go to the
Director's sign-off (or straight to merge), not back to the owner.

### S. Re-planning one ticket freezes the whole card, behind questions the Director could answer

Seen 2026-10-22 19:35-19:46: the owner chose "Re-plan" on CHE-6 only. The whole card CHE-C1 went back through
planning (grill, verify, enhance, research, write plan v4). While a card is planning, `schedule.ts` holds every
not-started ticket of it (`PLANNING_PHASES`, "the new plan may replace them"), so CHE-3's retry (19:38) also waits; no
Worker runs at all. Plan v4 then stopped for the owner with 4 Director questions, most of them housekeeping it could
settle itself: remove superseded lines from the assumptions (obviously yes), hold t17 until CHE-3 merges (add a
dependency), add `docs/architecture.md` to file lists, and a migration default for seeded dev users.

Fixes:
- S1. A re-plan asked for one ticket re-plans that ticket (and tickets that depend on it), not the whole card; other
  tickets keep running. A full-card re-plan stays available on the card.
- S2. Before asking the owner, the Director answers questions it can settle from the plan, the code and memory
  (consistency fixes, missing dependencies, file lists) and records what it decided; the owner gets only real choices
  (scope, product behaviour, data loss). Same principle as H, I, M.
- S3. Tickets held by a planning card show it: "Held: card CHE-C1 is re-planning (waiting for your answers)", with
  a link, instead of looking stuck or sitting in Needs you (pairs with Q and C).

### T. Re-plan loses the reason, so the Director re-plans the wrong thing

Seen 2026-10-22 19:35: the owner pressed Re-plan on CHE-6's stop ("Install packages failed: lockfile out of sync after
the package.json clash with CHE-2") with the comment "fix the issues". `replanTx`
(`packages/engine/src/tick/escalation-effects.ts`) passes the Director only `{ ticket_id, comment }`: not the failure,
the gate report or the findings. With no context, the Director looked for "issues" itself, found drift between plan v3
and the docs CHE-2 committed, and wrote plan v4 around that (new ticket t17). Plan v4 explicitly leaves t6 = CHE-6 alone
("in-flight tickets are not re-planned"), so the re-plan does not touch the problem the owner asked about, and CHE-6
stays parked.

Also, the Re-plan button says "changes what the ticket needs" in one place but the dialog re-plans the whole card
("The card goes back to planning"); a vague comment then reaches the Director with no ticket context.

Fixes:
- T1. A re-plan from a ticket's stop carries the stop itself: the failure cause, gate report summary, findings and the
  last run summary (same facts as F), and the Director's first job is that ticket's problem.
- T2. Mechanical failures (lockfile out of sync, a package.json clash after a merge, a generated file claim) are not
  plan problems: the Director answers them with a targeted rework (e.g. "run the package manager to regenerate the
  lockfile") instead of offering the owner Re-plan (ties to H, I, M).
- T3. With S1, Re-plan from a ticket re-plans that ticket; the dialog says exactly what will change before the owner
  confirms. Re-planning the whole card is a separate, explicit action on the card.
- T4. Owner (2026-10-23): the Re-plan button gets a real confirmation popup that spells out the consequences. Today
  `escalation-actions.tsx` opens a comment dialog titled "Re-plan this card?" with one generic line
  (`replanConsequence()` in `domain/escalation-copy.ts`), which did not make the effect clear. The popup lists, from
  live data: what gets re-planned (this ticket only, or the whole card); which tickets are held until the new plan is
  approved, by id and title; which keep running or stay done; that the owner will have to approve the new plan; that
  this ticket's stop (cause and findings) goes to the Director with the comment. When a cheaper action fits the stop
  (e.g. Send back for rework for a mechanical failure), the popup says so with a button for it. Confirm button names the
  action ("Re-plan CHE-6"), Cancel is the default focus. The same pattern applies to other far-reaching buttons
  (Cancel ticket, Merge anyway). UI builder runs hallmark + nielsen-heuristics (heuristic 5, error prevention).

### U. Every ticket runs in the Full lane

All 26 tickets of card CHE-C1 are `full`, in every plan version (v1-v4), including small tier A ones (templates,
store, dashboard). Not a stuck value; a planning rule:
1. The grill predicts one lane for the **whole card** (`grill.predicted_lane`); for this large card it said full
   ("The scope is very large for one card (lane: full)").
2. That card lane becomes every ticket's `lane_hint` (`packages/engine/src/tick/planning-input.ts:149`).
3. The write-plan playbook says "Start from the `lane_hint` … Raise, never lower"
   (`packages/core/src/domain/playbooks/write-plan.ts:82`), so no ticket can go below full.
4. `plan-to-tickets.ts` then only raises (`maxLane` with `preCheckLane`).

Cost: every ticket gets test-writer, implementer, G1, reviewer + critic, plan check and sign-off: more runs, more
holds, more owner stops (CHE-10's three holds), more spend.

Fix: the card's size must not be a floor for each ticket. Each ticket's lane comes from its own facts (files, tier C
paths, migrations, auth, public API, body length) via the deterministic pre-check plus the Director's per-ticket
judgement; the card-level prediction is only a hint the Director may lower per ticket with a reason shown in the
plan. Owner-set lanes stay honoured (d-0177); tier C still forces Full. Tests: a large card with a small ticket
plans that ticket as express/standard. Size: small-medium (playbook + planning input + plan view showing the reason).

### V. Approving plan v4 dropped the auth and LLM-client work (bug, data loss in the plan)

Seen 2026-10-22 19:49: approving plan v4 cancelled CHE-3 (Auth.js, proxy, consent gate) and CHE-6 (LLM client and
MiniMax adapter), but plan v4 has **no ticket for either**. The Director wrote v4 believing they were in flight ("Done
and in-flight tickets (t1, t2, t3, t6, t10) are not re-planned") while CHE-3 was `planned` (after a retry) and CHE-6
`waiting_human`; `cancelReplaced` in `plan-to-tickets.ts` treats any not-started ticket as replaceable and cancelled
both. Now t4 (needs `requireUser` from auth) and t16 (needs the LLM client) depend only on t17, so they will start
without the code they need.

Fixes:
- V1. One definition of "kept" shared by the write-plan input and `cancelReplaced`: a ticket with any run, branch or
  open escalation is kept unless the plan names it as replaced; the Director's input says exactly which tickets will
  be cancelled.
- V2. Before approval, a deterministic check: every acceptance item / file of a ticket to be cancelled is covered by a
  ticket in the new plan, or the plan says it is dropped on purpose. Otherwise the plan cannot be approved (or the
  Director must fix it first). The approval view lists "Will be cancelled" and "Not covered by the new plan".
- V3. Immediate: CHE-3 and CHE-6 need new tickets (re-plan with an explicit comment, or the owner restores them) and
  t4 / t16 need dependencies on them before they start.

### W. Nobody can set ticket dependencies outside a plan approval

Seen 2026-10-23 restoring CHE-3 / CHE-6: the card-chat Director can file tickets (`card-chat-actions.ts`) but has
no door to add or change `depends_on`, and the ticket page has no dependency editor for the owner either. The only
way dependencies are written is plan approval (`plan-to-tickets.ts`), which re-plans the whole card (S) and can drop
work (V). So restored tickets cannot be ordered before the tickets that need them.

Also seen: plan keys (`t4`, `t16`) and ticket ids (`CHE-4`, `CHE-16`) look alike and get mixed up, by the Director
("t16 is CHE-16") and in Forge's own messages to the owner. After a re-plan, `t16` is CHE-19 and `t17` is CHE-16.

Fixes:
- W1. A dependency door: add / remove `depends_on` between open tickets of the same project, through the existing
  cycle check (`findCycle`), logged on the card. Available to the owner on the ticket page and to the card-chat
  Director as an action (refused for running tickets only when the change would block them mid-run).
- W1b. The same edit door for priority and description: today there is no ticket PATCH route at all
  (`apps/server/src/routes/` has PATCH only for cards, plans and projects), so when the Director says "raise CHE-27 to
  urgent in the board" or "add this line to CHE-17", the owner has no way to do it. The Director must never tell the
  owner to use a control that does not exist; its chat context lists the actions the owner actually has.
- W1c. Tickets the Director files to restore cancelled work get the priority of the work they restore (CHE-27/28 were
  filed at priority 0, below the tickets that need them, CHE-17/19 at 2).
- W2. Show ticket ids everywhere the owner or the Director reads a plan once tickets exist (plan keys only as a small
  secondary label), and give the Director the key → id map in its chat context.

### X. Ideas taken from Anneal (`docs/reports/2026-10-23-anneal-comparison.md`)

Most Anneal ideas sharpen items already above (mapping in the report's table). New items not covered elsewhere:
- X1. Typed review findings (id, severity, file, line, evidence, required fix, reviewed head) and a disposition per
  finding (adopted / rejected / merged, with code and test evidence) in the Worker's output; the verifier checks the id
  set. Critic runs blind to the reviewer. (Strengthens H.)
- X2. NOT-RUN verdict: a project with no configured check blocks with "checks not run" instead of passing. (Strengthens J.)
- X3. One pure `decideMerge(input)` used by every merge path: gate rows, stage overrides, head and base, ancestry
  re-checked at write time, read-back confirm. (Fixes R at the root.)
- X4. Commit trailers `Forge-Ticket` / `Forge-Run` on Worker commits.
- X5. Content-addressed dependency cache, language-neutral, restore by copy. (Implements D.)
- X6. Per-step "usual cost and time" baseline on the ticket.
- X7. Host-load admission gate instead of a fixed per-project count. (With O, B.)
- X8. Wake the engine on events (stage settled, slot freed, setup done, answer given) so the next step starts at once;
  the tick stays as a safety sweep. (With A.)
- X9. A pipeline / agent version used by a ticket is frozen for that ticket; agent names follow `role-model-effort`
  (e.g. `reviewer-opus-high`) so two agents doing the same job on different models are told apart.
- X10. For projects without a local checkout, one local bare mirror per remote; worktrees cloned from it.

Every "Yes" / "Partly" row of the report's table is covered by an item in this file (the report's last column).

### Y. Live progress on board tiles (owner, 2026-10-23, screenshot of Anneal's board)

Owner likes how Anneal's task tiles show live progress. Each tile shows, without opening it:
- Step position and name: "Step 6/8 · Regression verification" (Forge: current pipeline stage of the ticket, e.g.
  "Stage 4/7 · Review and critique").
- A state chip: Running, Waiting, Idle, Parked, Settled (Forge: from the server-derived phase of N / C).
- Current run line with a live dot: "run 2 · running · 10m 3s" (agent and elapsed time, ticking).
- Why it waits: "Locked by: CHE-27 (Auth.js restore)" with a lock icon; "Waiting for a Worker slot"; "Waiting for you".
- An action right on the tile when one fits (Anneal: Activate on a parked task; Forge: e.g. Start, Retry).
- Cost so far ("Cost: $23.83 est.") and time since last change.
- For a card tile: the same roll-up across its tickets (e.g. "4 of 11 done · 2 running · 1 waiting for you").

Data: stage position and live run already stream to the web (project SSE, d-0132); wait reason and phase come from
N / C; cost from the cost work (eval-fix-6). Files: `apps/web/src/routes/board/ticket-card.tsx` and `card-tile.tsx`, ticket rows in the card's
Tickets tab. UI builder runs hallmark + nielsen-heuristics (heuristic 1, visibility of system status). Size: medium,
mostly UI once N / C exist.

### Z. "Close all" for notifications (owner, 2026-10-23)

The notification stack (`apps/web/src/components/notify/notify-viewport.tsx`) closes one card at a time (its X, or Esc
for the newest). When several pile up the owner must close each. Add a "Close all" button on the stack whenever two
or more dismissible notifications show (keyboard reachable, F8 focus order kept); it closes only dismissible ones
(running progress and errors that need an answer stay). Same idea for the Inbox notice lane from Q / row 18: "Mark all
read". Size: small, web (hallmark + nielsen).

### AA. Per-harness "Bypass permissions" setting, default on (decision d-0183)

Owner (2026-10-23): like Anneal's no-prompt runs, but as a setting per harness, on by default. Chosen shape: "Bypass,
keep hard floor". When on: the harness starts in its own skip-permission mode (driver-specific flag, owned by the
driver per code.md rule 3, declared in `capabilities()`), and every Forge `ask` rule resolves to allow. Forge's hook
still denies the hard floor: secrets and Forge's data folder, paths outside the worktree, pushing, destructive commands.
Receipts and G1 unchanged. When off: per-lane allow / ask rules (d-0175, d-0182). Shown in Settings → harness with a
plain warning that Workers run as the owner's account (d-0117). Supersedes r-0005. Changes the shape of M / E / I
(routine list matters only when the setting is off). Express keeps its rules. Size: medium (core config schema,
drivers, tools floor, web harness settings), needs a brief. Tests: on → no `ask` interactions and floor denies still
fire; off → today's behaviour.

## Order

Decided with the owner once the list above is complete.
