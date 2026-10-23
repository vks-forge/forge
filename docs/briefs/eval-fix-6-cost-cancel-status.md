# Eval fix 6: honest cost, cancel a ticket, trust the status (builder brief)

Source: `docs/reports/2026-10-20-forge-usefulness-eval.md` items 6-8 and "Stale, contradictory status",
`docs/reports/2026-10-20-eval/{forge.json,forge-notes.md,ui-notes.md}`. Planner read the code on 2026-10-20;
line numbers are from that tree (uncommitted d-0172/d-0173 work included) and may drift by a few lines.
Binding: `.claude/rules/code.md` (rule 6 one door, rule 4 zod first, rule 8 tests, rule 10 READMEs), d-0143,
d-0072, d-0109, d-0135, d-0159, d-0172. Forge is language-neutral: no Node-only wording or logic anywhere.
All owner-facing copy in plain words (the owner does not code): no "G1", "tick", "lane" without a gloss.

## A. Honest cost

**Now.**
- Director spend has no rows of its own. It is one undated running total, `director_spend_usd`, inside
  `cards.grill_state_json` (`packages/core/src/schemas/grill.ts:160`). It is added by `addDirectorSpend()`
  (`packages/engine/src/tick/card-budget.ts:101-121`) and, bypassing it, by planning steps
  (`planning-step-io.ts:103`, `planning-grill.ts:76-99`). A failed chat step's cost is dropped
  (`card-chat.ts:91-95`); a Director step on a ticket with no card is tracked nowhere (`card-budget.ts:98-99`).
- Runs only: Cost page (`apps/server/src/routes/project-stats.ts:62-91` -> `packages/core/src/domain/cost-report.ts:77-100,136`),
  Overview (`apps/server/src/routes/stats-overview.ts:70-99`, `services/overview-source.ts:61-64`,
  `core/domain/overview-stats.ts:171-205,244-265`), ticket (`routes/tickets.ts:104`, `core/domain/cost-rollup.ts:19-32`),
  ticket list (`routes/ticket-list.ts:106,124`), scorecards (`core/domain/scorecards.ts:73-80`), and the chat
  model's own `spent_usd` (`engine/src/tick/card-chat-context.ts:61-73,162`). Only the card (`services/card-view.ts:64-65,82,108-112`)
  adds Director spend. Result: Cost $7.43 vs card totals $24.86.
- Budget label: the engine warns against `card.budget_cap_usd ?? director.budget_warning_usd` ($5,
  `card-budget.ts:70`, `core/domain/builtin-director.ts:141`); the Inbox shows it (`services/inbox-budget.ts:79-89`);
  card Details reads only `card.budget_cap_usd` and prints "No cap" (`apps/web/src/components/card/budget-cap-field.tsx:141`,
  `routes/card/tabs/details-tab.tsx:31-38`). Also: `card-chat.ts:114-115` and `memory-rewrite.ts:162` pass no
  fallback (never warn), `routes/card-patch.ts:35-37` uses the company default and ignores the project override.

**Fix.**
1. **Director spend ledger.** New table `director_spend` (id, project_id, card_id null, ticket_id null, step kind,
   model, usd, recorded bool, at). Migration = next free number (0030 when written). Backfill one row per card from
   `grill_state_json.director_spend_usd` dated the card's `updated_at`, kind `backfill`. `addDirectorSpend()` becomes
   the only writer (planning steps route through it; failed steps record their cost when the harness reported one;
   ticket-only steps record with `card_id` null). `director_spend_usd` stays as a cached total updated in the same
   transaction so the budget check reads one number.
2. **Core schemas and functions.** `CostReport` gains `worker_usd`, `director_usd`, `total_usd` and a per-day split;
   `OverviewStats` spend tiles, by-project and spend-over-time series gain a `source: worker|director` split;
   `TicketCost` gains `director_usd` (escalation answer/recover steps carry `ticket_id`). `computeCostReport` and
   overview stats take `directorSpend[]` alongside runs. `cost_coverage` note now names both sources.
3. **One budget function.** `effectiveCardBudget(card, directorConfigForProject)` in core `domain/card-budget.ts`
   returns `{ cap_usd, source: 'card' | 'project' | 'forge' }`. Used by engine warnings (all callers, incl. chat
   and memory rewrite), Inbox filter, card PATCH and card detail. Card detail sends `budget: {cap_usd, source,
   spent_usd}`; spend = runs + Director, the same number the warning used.
4. Chat context `spent_usd` = card total (runs + Director).

**Files.** core: `schemas/cost-report.ts`, `schemas/overview-stats.ts`, `schemas/cost-rollup.ts`, `schemas/card-api.ts`,
`schemas/director-spend.ts` (new), `domain/cost-report.ts`, `domain/overview-stats.ts`, `domain/card-budget.ts` (new),
`types/ports/storage.types.ts`. db: migration, `adapters/sqlite/director-spend-repository.ts` (new) + memory adapter.
engine: `tick/card-budget.ts`, `planning-step-io.ts`, `planning-grill.ts`, `card-chat.ts`, `card-chat-context.ts`,
`memory-rewrite.ts`. server: `routes/project-stats.ts`, `services/overview-source.ts`, `routes/tickets.ts`,
`services/card-view.ts`, `routes/card-patch.ts`, `services/inbox-budget.ts`. web: `routes/cost/cost-page.tsx`,
`domain/cost-view.ts`, `components/overview/overview-kpis.tsx`, Overview spend chart, `components/cost/cost-breakdown.tsx`,
`components/card/budget-cap-field.tsx`, `routes/card/tabs/details-tab.tsx`, `routes/ticket/ticket-header.tsx`.

**Tests (red first).**
- Storage contract: `director_spend` append + range query, both adapters (`describeAdapterContract`).
- Migration: backfill yields one row per card equal to the old total; re-run is a no-op.
- `computeCostReport`: runs $3 + Director $7 -> total $10, worker 3, director 7; per-day split sums to total.
- Overview stats: spend in range and by project include Director rows dated in range, exclude outside.
- `effectiveCardBudget`: card cap wins; project override beats Forge default; source reported.
- Engine: chat step and memory rewrite warn at 80% with no card cap (today they never do); failed step with
  reported cost lands in the ledger; planning step cost goes through `addDirectorSpend` (one row per step).
- Route: `GET /projects/:slug/cost` total equals the sum of card totals for the same cards (the eval mismatch).
- Web: Details shows "$5.00, Forge default" when the card has no cap; Cost page shows the Worker/Director split.

**UI notes** (builder applies hallmark + nielsen-heuristics). One split pattern everywhere: total first, then
"Workers $7.43 · Director $16.86" in the same order and colours on Cost, Overview, card, ticket, Board chip tooltip.
Stacked bars use two series, keyed in a legend with text (no colour-only meaning; fix the bar `role` while there).
Budget row: "Budget $5.00 (Forge default, change in Director settings)" / "(set on this card)"; "No cap" only when
truly none applies. Nielsen #1 and #2: say "Director (planning and answering)" once as a gloss.

**Docs.** core, db, engine, server, web READMEs (cost, ledger table, budget function); PRODUCT.md status + log line;
new decision record for the ledger (see open question A1).

## B. Cancel a running ticket

**Now.**
- The door exists but is hidden. `POST /tickets/:id/act {action:'cancel', cascade?}` (`apps/server/src/routes/escalations.ts:69-90`)
  -> `engine.actOnTicket` (`packages/engine/src/tick/escalation-act.ts:207-264`, offers cancel always via `'open'`)
  -> `cancelFlow()` (`escalation-cancel.ts:27-87`: dependents check, `cancelTicketsTx` -> `transition({type:'cancelled'})`,
  `stopCancelled`, `notifyCard`). The state machine allows cancel from any non-terminal status (`core/domain/state-machine.ts:200-212`).
- The ticket page never shows it: `ticketWaitActions` returns `[]` for a running ticket
  (`core/domain/escalation-actions.ts:82-93,163`; `apps/server/src/services/escalation-view.ts:76-92`), and
  `TicketHeader` passes no `menu` (`apps/web/src/routes/ticket/ticket-header.tsx:46-66`).
- Second, unused door: `engine.cancelTicket` (`engine.ts:225-239`) skips the dependents check (rule 6 smell).
- Cleanup: `stopCancelled` (`ticket-cancel.ts:80-105`) calls `driver.cancel` without waiting for the pump, then
  removes the worktree at once; on Windows `taskkill` returns before exit (`drivers/.../process-tree.ts:18-40`), files
  are still held, `remove` throws, only a warning is logged. No cancel path calls `gitHost.closePr`/`deleteBranch`
  (only `verify-merge-steps.ts:63-74`). Hence FR-8/FR-11 worktrees and branch `feat/FR-12` left behind.
- Director: chat actions are `create_ticket, steer_run, change_type, suggest_close` (`core/schemas/card-chat.ts:33-57`,
  `engine/tick/card-chat-actions.ts:13,222-260`, prompt `drivers/src/domain/director-step-prompts.ts:50-59`). No cancel.
  "Use the ticket's cancel control" is not in any prompt: the model invented it.
- Close-card copy: "Its tickets keep running." (`apps/web/src/routes/card/close-dialog.tsx:30`), but
  `closeCardWork` (`engine/tick/card-close.ts:94-109`) cancels them.
- Roll-up: `card-view.ts:78-79` counts cancelled tickets in `ticket_count`; Board bar `card-tile.tsx:52-55,123-136`
  shows ~70% on a done card.

**Fix.**
1. **One cancel door.** `cancelFlow` is the door; `engine.cancelTicket` is deleted or becomes a thin alias to it.
   It takes `{ by: 'owner' | 'director', reason }` and writes a ticket + card event with both.
2. **Clean stop.** `stopCancelled` waits `Promise.race([pump.finished, CANCEL_GRACE_MS])` like `cancelStalled`
   (`reconcile.ts:88-95`), then removes the worktree with retry; on final failure it records a cleanup-pending
   row that an engine sweep retries (and says so on the ticket). Then `closePr` and `deleteBranch`; the branch's
   last commit sha goes into the cancel event so work is recoverable. Card close and Director cancel get this for free.
3. **Offer it.** Server ticket detail gains `can_cancel` (true for any non-terminal ticket on an open card) and
   the dependents list for the cascade step. Do not add cancel to `ticketWaitActions` for running tickets: that would
   put a fake "needs you" item in the dock for every running ticket (d-0172).
4. **Director action** `cancel_ticket {ticket_id, reason, cascade?}`: schema, `allowedChatActions`, `runChatAction`
   -> `cancelFlow(by:'director')`, prompt line. Refused for a ticket not on the card or already finished. Owner
   cancel from the ticket page appears in the card chat as a one-line event, and the Director's chat context
   lists cancelled tickets with reason, so it never re-files them unasked.
5. **Roll-up.** `ticket_count` excludes cancelled; add `tickets_cancelled`; phase line "2 of 2 done, 1 cancelled".

**Files.** core: `schemas/card-chat.ts`, `domain/card-chat-actions.ts`, `schemas/ticket-api` (or the ticket detail schema
in use) for `can_cancel`. engine: `tick/escalation-cancel.ts`, `ticket-cancel.ts`, `engine.ts`, `card-chat-actions.ts`,
`card-chat-context.ts`, a sweep for cleanup-pending. drivers: `domain/director-step-prompts.ts`. server: `routes/tickets.ts`,
`services/card-view.ts`. web: `routes/ticket/ticket-header.tsx`, `use-ticket-dock.tsx`, `components/escalation/escalation-dialogs.tsx`
(reuse `CancelDialog`), `routes/card/close-dialog.tsx`, `routes/board/card-tile.tsx`, `domain/card-phase.ts`.

**Tests (red first).**
- Engine: cancelling an `in_progress` ticket with a live fake pump waits for the pump, removes the worktree, closes
  the PR and deletes the branch (fake GitHost records calls); a held-file failure leaves a retry row and the sweep
  clears it.
- Engine: chat action `cancel_ticket` moves the ticket to cancelled through `transition()` and records `by: director`;
  refused for another card's ticket and for a done ticket; dependents without cascade -> refusal naming them.
- Server: ticket detail `can_cancel` true for in_progress/verifying/waiting, false for done/cancelled/closed card.
- `card-view`: done card with one cancelled ticket -> `tickets_done == ticket_count`, `tickets_cancelled 1`.
- Web: ticket header menu "Cancel ticket…" opens the dialog, posts `/tickets/:id/act {action:'cancel'}`; cascade step
  lists dependents; dock items that already carry Cancel keep it; close dialog copy no longer says "keep running".

**UI notes.** Ticket header gets the same `HeaderMenu` as the card ("Ticket actions"), one danger entry "Cancel
ticket…". Dialog: "Cancel FR-12? The Worker stops now and nothing from this ticket is merged. Its work branch is
removed; the Director is told. This cannot be undone." Primary "Cancel ticket", secondary "Keep running" (never
two buttons both named Cancel). Optional reason field. Cascade step names dependents in plain words. After success:
header pill Cancelled, toast "FR-12 cancelled", focus returns to the menu trigger. Close-card dialog: "Closing stops
any running Worker and cancels this card's unfinished tickets. Work already merged stays. You cannot reopen it from
here." Nielsen #3, #5, #9 are the ones this closes.

**Docs.** engine, server, web READMEs; core README (chat actions); `docs/design` Director chat-action list if it
enumerates them; PRODUCT.md (cancel exists, Director can cancel) + log line.

## C. Trust the status

| Symptom | Source | Fix |
|---|---|---|
| Done ticket "Waiting on FR-5" | `apps/web/src/routes/ticket/ticket-header.tsx:67-78`, `tabs/details-tab.tsx:70-73` use `blocked_by`, which is every `depends_on` forever (`packages/db/src/shared/relations.ts:24-37`) | Server sends `open_blockers` using the scheduler's rule (`engine/tick/schedule.ts:36-46`, move the predicate to core so both share it). Header shows "Waiting on" only for a non-terminal ticket with open blockers; Details labels the full list "Depends on". |
| Cancelled ticket "Run ended (success)" beside "Failed, round 4" | `components/thread/worker-thread.tsx:38,111-112` prints one run's status (SSE end frame, `apps/server/src/services/http/sse.ts:98-119`); stage chip `routes/ticket/stage-chip.tsx:81-84` is the gate history | Thread footer says "Worker run 3 finished" (run words: finished / stopped / failed, never "success"). When the ticket is terminal, a ticket-outcome line sits above it: "Ticket cancelled by you at 07:01" / "Merged at …". Stage chips on a terminal ticket render as history: muted, "Last check: did not pass (round 4)". |
| Done card plan "Floor check did not pass" | `routes/card/plan/plan-tab.tsx:48,167-174`; floor recomputed per GET (`engine/tick/plan-reads.ts:38-44`) against `plan.base_sha`, so the card's own merges fail it (`planning-floor.ts:59-72,108-123`, `core/domain/approval-floor.ts:53-56`) | Compute the floor only while the card is at or before plan approval; afterwards return `floor: null` with `floor_frozen_at`. Plan tab hides the banner when null. |
| Harnesses "Not tested yet" after 52 runs | Only `POST /harnesses/:id/test` sets status/version (`apps/server/src/routes/harnesses.ts:199-206`); PUT and secret save rebuild via `pausedOf()` and wipe it (`:92-98,150-158,176-186`); compat pass on a paused harness drops `last_checked_at` (`services/compat-record.ts:124-134`) | Keep test fields across PUT/secret save and compat; add `last_run: {at, status, version}` from the newest Worker run on that harness. Row: "Working · last run 07:12 (2.1.304) · live test not run". Files: `components/settings/harness-row.tsx:39,50`, `routes/settings/harness-detail-page.tsx:66-68`, `components/onboarding/harness-step.tsx:67`. |
| "The Director is thinking…" while waiting on the owner | `components/card/director-status.tsx:32-35` shows it if any `step_started` lacks a finish (`domain/director-flow.ts:60-82`); `planning-step-io.ts:62-75` (budget ask) and `:77-86` (model error) never write `step_finished` | Engine writes `step_finished {outcome: 'paused_for_you' | 'failed'}` on both paths. Web trusts the server's `cardDirectorStatus` (`engine/tick/card-chat-post.ts:86-100`) first; an open needs-you item suppresses "thinking". |
| Board done card bar ~70% | see B.5 | B.5 |

**Tests (red first).** Ticket detail: done ticket with a done dependency -> `open_blockers []`; header renders no
"Waiting on". Run-thread: cancelled ticket shows the outcome line and no "success". Plan read: card in
`complete` -> `floor null`. Harness: PUT after a passing test keeps `status ok`; a settled successful run sets
`last_run`. Planning step: budget ask and model error both write `step_finished`; `pendingStep` empty afterwards.
Property test: for every terminal ticket status, no "waiting" text is derivable (`open_blockers` empty, no thinking).

**Files.** core: open-blockers predicate (`domain/`), ticket detail schema, harness view schema. engine: `tick/schedule.ts`,
`plan-reads.ts`, `planning-step-io.ts`. server: `routes/tickets.ts`, `routes/harnesses.ts`, `services/compat-record.ts`.
web: the files in the table.

**UI notes.** Rule: a finished thing never shows a present-tense wait. Terminal pages lead with the outcome sentence;
history is visually quieter. Nielsen #1 and #4.

## D. Small fixes

**Mojibake: not reproduced in Forge.** The eval database (`$EVAL/forge-home/forge.db`, read-only check by the
planner) stores correct "…" (U+2026) and "→" (U+2192) in `run_events`, `card_events`, `interactions`, `cards`,
`card_plans`, `stage_artifacts`, and zero "â€" or U+FFFD sequences. All HTTP/SSE responses declare UTF-8
(`apps/server/src/services/http/respond.ts:26`, `sse.ts`, `static-ui.ts:31-34`); Worker stdout decodes safely
(`cli/cli-engine.ts:109` readline, `acp/acp-run.ts:142-144`). The report's own `forge.json` also contains "thinking�",
and the planner's Windows Python printed cp1252 errors on the same text, so the garbling almost certainly came from
the evaluator's Windows tooling, not Forge. One real latent bug remains: `drivers/src/adapters/claude/director-llm.ts:78`
(and `capture-output.ts:42`) does `stdout += d.toString('utf8')` per chunk, which turns a multi-byte character split
across chunks into U+FFFD. Fix with `child.stdout.setEncoding('utf8')` (StringDecoder). Test: feed "…" split across
two Buffers through a fake child; output equals input.

**Message length.** Limits live only in core (`schemas/card-chat.ts:24` `CARD_MESSAGE_MAX_CHARS = 8000`,
`schemas/run-inbox.ts:39,43` `STEER_MESSAGE_MAX`); web never imports them. The server's `issues` list
(`apps/server/src/services/http/http-errors.ts:66`) is dropped by `apps/web/src/api/describe-error.ts:40` and
`routes/card/tabs/conversation-tab.tsx:52-66`. Fix: `components/card/message-composer.tsx` (and the ticket steer box)
import the core constant, show a counter from 90% ("7,412 / 8,000"), block send over it with "Messages can be up to
8,000 characters; this one has 20,412. Shorten it or send it in two parts." `describe-error` turns a `too_big` issue
into that sentence for any path that still hits the server.

**New card minimum.** `apps/web/src/schemas/new-card.ts:22,45` (`DESCRIPTION_MIN = 20`), message exists at
`domain/new-card-form.ts:78-79` but is hidden until blur (`components/cards/new-card-dialog.tsx:80-89`) while Create
is disabled with no reason (`:123`); hint `new-card-fields.tsx:83` never states it. Fix: hint "At least 20 characters,
so the Director has something to start from." plus a live count until met; disabled Create carries
`aria-describedby` to that hint.

**Tests.** Composer: 8,001 chars blocks send and shows the sentence; describe-error maps a `too_big` issue. New card:
hint visible before typing, count updates, Create enabled at 20. Director LLM split-chunk test above.

## Builder steps (serial; each red-green, `pnpm check` green, READMEs + PRODUCT.md in the same commit)

1. **Cost backend (A.1-A.4 core/db/engine/server)**, ~15 files. Lands the ledger, schemas, budget function, routes.
2. **Cancel + status backend (B.1-B.5, C server/engine rows, D Director decoder)**, ~15 files. Depends on 1 only for
   `card-chat-context.ts` (rebase, no logic overlap).
3. **Web for A, B, C, D**, ~15 files, after hallmark + nielsen-heuristics. Cost split, budget row, ticket menu +
   dialog, close copy, status rows, harness row, composer limit, new-card hint, Board bar.

If step 3 runs over 15 files, split it into 3a (cost + cancel UI) and 3b (status + small).

## Risks

- Ledger backfill dates all old Director spend to one day per card: Overview charts get a spike for history. Say so
  in the cost-coverage note ("Director spend before 20 Oct is dated by card").
- Deleting the branch on cancel loses unmerged work if the owner wanted it. Mitigated by recording the last sha;
  see A/B open question B1.
- Waiting for the pump before cleanup delays the cancel reply: do the wait and cleanup after the HTTP reply, ticket
  already `cancelled`.
- A Director that can cancel can cancel wrongly. Mitigated by B2 below and the recorded reason.
- Floor freeze must not hide a real floor failure before approval: freeze only after `plan_approved`.

## Open questions (recommended answers)

- **A1.** New `director_spend` table, when d-0159 said Overview adds "no new tables"? **Yes**: d-0159 meant no
  dashboard-only tables; dated Director spend cannot exist without one. Record as a new decision amending d-0159.
- **A2.** Count Director spend in the per-agent run caps (d-0072)? **No**: those cap single Worker runs; Director spend
  counts toward the card budget only (d-0143 already says so).
- **B1.** On cancel, delete the branch or keep it? **Delete branch, close PR, keep the sha in the cancel event** (owner
  asked for cleanup; work stays recoverable). d-0109's "stop keeps the worktree" is about stopping a Worker, not
  cancelling the ticket, so it stands.
- **B2.** May the Director cancel on its own judgement? **Only when the owner asked in that chat turn**; otherwise it
  suggests cancel with a one-tap action. Record as a decision amending d-0109.
- **B3.** Show Cancel in the dock for a running ticket with nothing waiting? **No**: header menu only; dock items
  keep their existing Cancel action (d-0172, dock = things waiting on you).
- **C1.** Run harness "tested" from runs, or keep a separate live test? **Both, labelled separately**: "last run
  worked" from runs, "live test" from the button.
- **D1.** Spend time hunting the mojibake further? **No** beyond the decoder fix; reopen only if it shows in the
  owner's own browser on a fresh run.
