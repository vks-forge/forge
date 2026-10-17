# S4a — Ticket escalations (builder brief)

Status: **approved per d-0160 (autonomous run)** · 2026-10-17
Plan: `docs/briefs/card-first-flow-plan.md` §S4a and the Invariants. Decisions: d-0135, d-0141
(items 8, 9), d-0012, d-0097, d-0109, d-0134, d-0139, d-0143. Builds on S1 (`transitionCard()`,
project SSE, `interactions.card_id`) and S2 (Director steps, `RepoReader` pre-read, `runAsExpress`).

Two builders, parallel, against the **contract** below. Nobody edits the other's files. Both read
`.claude/rules/code.md` first.
- **S4a-A backend:** core, db, engine, drivers (prompts only), server.
- **S4a-B web:** `apps/web` and `docs/design/ui-screen-map.md`.

## What exists today (and is wrong)

| Waiting state | Produced by | What the owner sees |
|---|---|---|
| Worker question / blocker | mcp `ask_director` / `report_blocked` → `interactions` row; `outcome.ts` `asked` | AnswerPanel free text; no Director attempt |
| DCP-1 M0 hold | `triage.ts` `parked` "lane not enabled in M0…" | reason text only; `runAsExpress` refuses it (matches `pipeline_pending` prefix only) |
| Planned non-Express hold | `plan-to-tickets.ts` `pipeline_pending` | card `needs_you` with Run as Express only |
| Rework cap | `transition()` `gate_failed` at `MAX_AUTO_REWORKS` → waiting_human | reason text only |
| Retry cap / never-retry family / re-wake cap / harness build changed | `outcome.ts` `parkIn` (`decideFailure`, `parkReason`) | reason text only; `auth` and `policy_denied` look like any failure |
| Question timed out | `interactions.ts` `expireInteractions` → status `blocked` | nothing: `unblocked` is never emitted, `blocked` is not in `NEEDS_YOU_STATUSES` |
| Quota | `quota.ts` parks harness, `quota_wait` wake, inbox `quota_wait` item | informational, auto-resumes |
| Review / NeedsSignoff | `verify-merge.ts` Tier B/C | no route acts on them (approve/sign-off is S4b) |

## Orchestrator calls (binding)

- **Escalations reuse `Interaction`** (d-0141 item 8). New kinds `failure`, `setup`; `question`
  gains a typed payload. Every owner wait on a ticket is one pending interaction. A
  `waiting_human` or `blocked` ticket without one is a violation (reported by `violations.ts`).
- **Director first, two stages.** A new interaction starts in stage `director`
  (`escalated_at` null): hidden from Inbox, banner and card Needs-you; the ticket page shows
  "Director is looking at this". It moves to stage `owner` by a CAS that sets `escalated_at`.
  Any Director error, parse failure or timeout escalates at once with no suggestion (fail closed
  = ask the human).
- **Deterministic first, LLM second.** No LLM for: quota (existing park plus `chooseHarness`
  fallback; wait otherwise, never an escalation), setup (straight to owner; the Director never
  approves a tool or a login), the lane hold (owner's choice, d-0141 item 8), question timeout.
- **No backfill SQL for classification.** Old parks are mapped by an idempotent engine sweep at
  start (TS classifier, both adapters). The migration only adds the column and indexes.

## Contract (shared, binding)

### Core schemas (`schemas/escalation.ts`, new)

```ts
EscalationKind = 'question' | 'failure' | 'setup'
FailureCause = 'lane_hold' | 'rework_cap' | 'retry_cap' | 'rewake_cap' | 'not_retried'
             | 'max_turns' | 'refused' | 'question_timeout'
SetupCause = { type: 'login', harness_id }
           | { type: 'tool', tool, harness_kind, version, reason_code /* ReasonCode */ }
           | { type: 'harness_build', harness_kind, version }
// payload of new rows; discriminated on `kind` (mirrors the row kind)
EscalationPayload =
 | { kind: 'question', text, source: 'ask_director' | 'report_blocked' | 'legacy',
     suggested_answer?, options: {id, label, recommended: boolean}[] /* 0–4, ≤1 recommended */,
     director_note? }
 | { kind: 'failure', cause: FailureCause, summary, diagnosis?,
     attempts: { at, what, result }[], error_family?: ErrorFamily, lane?: Lane }
 | { kind: 'setup', cause: SetupCause, summary, fix_href /* web path */ }
EscalationAction = 'answer' | 'retry' | 'replan' | 'cancel' | 'run_as_express'
                 | 'rework' | 'recheck'          // fix-in-settings is a link, not an action
EscalationAnswer = { action: EscalationAction, by: 'owner' | 'director' | 'auto',
                     text?, option_id?, note?, comment?, cascade?: boolean }
EscalationView = { id, ticket_id, ticket_title, card_id?, kind: EscalationKind,
  stage: 'director' | 'owner', status: InteractionStatus, payload: EscalationPayload,
  actions: EscalationAction[] /* ≥1 while pending */, asked_at, escalated_at?,
  settled?: { action, by, at } }
EscalationActBody = discriminatedUnion('action', [
  {action:'answer', option_id?, text?}  /* exactly one */, {action:'retry', note?},
  {action:'replan', comment (≥5)}, {action:'cancel', cascade?: boolean},
  {action:'run_as_express'}, {action:'rework', comment (≥5)}, {action:'recheck'} ])
```

- `InteractionKind` (`schemas/run.ts`) adds `failure`, `setup`. `Interaction` adds
  `escalated_at?: datetime`. `payload` stays `unknown` on the row; read through pure
  `toEscalation(row)` in `domain/escalation-view.ts`: a row whose payload parses as
  `EscalationPayload` is used as is; legacy rows (`question`, `plan_confirm`, `permission`,
  `blocked`, payload `{prompt|question|reason}`) map to `question` with `source: 'legacy'`,
  `options: []`. Never throws; unparseable → `question` with the raw text clipped.
- `domain/escalation-actions.ts` (pure): `escalationActions(view-facts)`,
  `ticketWaitActions(ticket, pendingViews, schedulerWait)` and the exported tables below.

| Waiting state | Actions (order = button order) |
|---|---|
| question (any source) | answer, cancel |
| failure lane_hold | run_as_express, replan, cancel |
| failure rework_cap / retry_cap / rewake_cap / not_retried / max_turns / refused | retry, replan, cancel |
| failure question_timeout (ticket `blocked`) | retry, replan, cancel |
| setup (any) | recheck, cancel (+ "Fix in settings" link from `fix_href`) |
| ticket `review` / `needs_signoff` | rework, cancel (Approve / Sign-off land in S4b) |
| scheduler waits (deps, cap, quota) | auto-resume line + cancel |
| card phase with `needs_you` | S2 `NEEDS_YOU_ACTIONS` (unchanged) |

`replan` is offered only when the ticket has a card that is not a Discussion card; without a
card the list drops it (the rule test covers both).

### Card events (`card-event.ts`, new kinds)

| kind | payload |
|---|---|
| `escalation` | `{ interaction_id, ticket_id, escalation_kind, title }` — written when it reaches stage owner |
| `escalation_settled` | `{ interaction_id, ticket_id, action: EscalationAction, by: 'owner'\|'director'\|'auto', note? }` — Director auto-answers and auto-resumes write this too |
| `replan_requested` | `{ ticket_id?, comment, by: 'owner' }` |

`interaction_opened` / `interaction_answered` stay as quiet system lines. The chat renders an
`escalation` event from the **live** view (`GET /cards/:id/escalations`), not from the event
payload, so it shows settled state wherever it was answered.

### HTTP (S4a-A implements, S4a-B consumes; error envelope `{ error: { code, message, …details } }`)

- `POST /interactions/:id/act` body `EscalationActBody` → 200 `{ escalation: EscalationView }`.
  400 `invalid_body`; 404 `interaction_not_found`; 409 `not_pending` (details `settled`);
  409 `action_not_offered`; 409 `ticket_has_dependents` (details `dependents: TicketId[]`, cancel
  without `cascade`); 409 `still_broken` (recheck; details `detail`); 409 `stale` (ticket moved).
- `POST /interactions/:id/answer` (legacy) stays and delegates to `act` `{action:'answer', text}`.
- `GET /cards/:id/escalations` → 200 `{ items: EscalationView[] }` (pending first, then the last 50
  settled). 404 `card_not_found`.
- `GET /tickets/:id` adds `escalations: EscalationView[]` (pending, any stage) and
  `wait_actions: EscalationAction[]` (from `ticketWaitActions`); `interactions` stays.
- `POST /tickets/:id/run-as-express` stays (S3 banner uses it); accepts a `lane_hold` escalation.
- `GET /projects/:slug/inbox`: `question` items cover all three kinds (ids unchanged,
  `question:<interaction id>`, so marks survive) and gain `escalation?: EscalationView`; owner
  stage only. `ticket_waiting` stays as a safety net and should be empty after the sweep.

**Invalidation.** `tracked-storage.ts` adds `["ticket", id]` to every ticket and interaction
touch (today the ticket page is never invalidated). Keys the web relies on: `["ticket", id]`,
`["tickets", slug]`, `["cards", slug]`, `["card", id]` (prefix covers `["card", id, "events"]`
and the new `["card", id, "escalations"]`), `["inbox", slug]`.

## S4a-A backend

### core
- `schemas/escalation.ts` (above); `schemas/run.ts`, `schemas/interaction.ts` (kinds,
  `escalated_at`, header now says card_id is set for every ticket escalation);
  `schemas/card-event.ts` (three kinds); `schemas/inbox.ts` (`escalation?`).
- `schemas/director-steps.ts`: two tool-less steps, parsed at the boundary:
  - `TicketAnswerOutput = { read_requests?: ReadRequests, decision: 'answer' | 'escalate',
    answer?: string, confidence: number (0–1), grounds: {kind: 'plan'|'decision'|'memory'|'code',
    ref: string}[], suggested_answer?, options?: (2–4, ≤1 recommended), escalate_reason?:
    'low_confidence'|'out_of_plan'|'owner_preference'|'conflict'|'tier_c' }`.
  - `TicketRecoverOutput = { decision: 'retry' | 'escalate', note?: string /* ≤1000, stays inside
    the ticket's acceptance */, diagnosis: string, confidence: number }`.
- `schemas/steps.ts` adds `ticket_answer`, `ticket_recover` (models default sonnet / opus;
  timeouts in `step_timeouts_ms`). `schemas/director-config.ts` adds
  `escalation: { director_first: boolean (true), answer_confidence: number (0.8),
  max_director_retries: int (1) }`, project-overridable; two playbooks `answer-worker`,
  `recover-failure` (real method text, 30–60 lines each) in `domain/playbooks/`.
- `domain/escalation-actions.ts`, `domain/escalation-view.ts` (`toEscalation`),
  `domain/escalation-classify.ts` (`classifyPark(ticket)` from status + `blocked_reason` prefix +
  `pipeline_pending`; `setupCauseFor(family, decisions)` from `auth`, `policy_denied` with
  deny receipts whose reason is `unknown_tool|quarantined|schema_pending|schema_changed|
  schema_denied|not_granted|unattended`, and `HarnessChangedError`),
  `domain/setup-fixed.ts` (`isSetupFixed(cause, facts, askedAt)`: login → harness `status: ok`
  with `last_checked_at > escalated_at`; tool → tool-schema row `approved` (schema reasons) or
  catalogue entry no longer `unknown/quarantined` or project grant now lists it; harness_build →
  `harness_versions` compat `pass`). Recheck only triggers a retry; the next run still passes
  `admit()`.
- `card-rollup.ts` `cardNeedsYou`: counts owner-stage interactions only; a `waiting_human` ticket
  whose only pending interaction is director stage does not count; `blocked` joins
  `NEEDS_YOU_STATUSES`.
- Port `InteractionRepository` adds `escalate(id, patch: {payload, escalated_at}, at): boolean`
  (CAS `status='pending' AND escalated_at IS NULL`), `listPendingByCard(cardId)`.

### db
- Migration **`0023-escalations.ts`** (registry): `ALTER TABLE interactions ADD COLUMN
  escalated_at TEXT`; `UPDATE interactions SET escalated_at = asked_at` (legacy rows are already
  the owner's); `UPDATE interactions SET card_id = (SELECT card_id FROM tickets WHERE id =
  ticket_id) WHERE card_id IS NULL`; `CREATE INDEX idx_interactions_card_status ON interactions
  (card_id, status)`. SQLite + memory repositories, contract tests (escalate CAS races answer).

### engine (files ≤ 300 lines)
- `tick/escalation-raise.ts`: one helper every producer calls inside its transaction:
  `raiseEscalation(tx, ticket, payload, stage)` inserts the row (card_id from ticket), logs
  `interaction_opened`; stage owner also sets `escalated_at`, logs `escalation`, and for a card
  sets nothing else (Needs-you is derived). Producers: `outcome.ts` (pause → question, director
  stage; park → failure director stage, or setup owner stage for `auth`/`policy_denied`/
  `parkReason` of a changed build), `triage.ts` and `plan-to-tickets.ts` holds (lane_hold, owner
  stage; the plan-to-tickets `needs_you` card event is replaced by it), `verify-outcomes.ts`
  rework cap (director stage), `interactions.ts` expiry (question_timeout, owner stage).
- `tick/escalation-director.ts` (sweep each tick, claim set in `EngineState`, never inside the
  settle transaction): question → `ticket_answer` with the S2 pre-read loop (`runReads`, ≤2
  rounds, `director` grant via `admit()`); input = question, ticket body, the card's current plan
  and the ticket's plan entry, active decisions + rejected records, repo `CLAUDE.md`/`AGENTS.md`,
  house rules. Auto-answer only if `decision: answer` and `confidence ≥ answer_confidence` and
  `grounds` non-empty and ticket `tier_predicted !== 'C'` and no planned file of the ticket hits a
  Tier C glob and `approval_mode !== 'always_ask'` (the floor only makes it stricter); then CAS
  `answer` `{action:'answer', by:'director', text}` (wakes the Worker as today) and
  `escalation_settled`. Otherwise `escalate` with `suggested_answer`/`options`. Failure (not
  lane_hold) → `ticket_recover`; `retry` allowed while the Director's retries for this ticket and
  cause are under `max_director_retries`, else escalate with `diagnosis`. Step spend counts on
  the card budget (warning only, d-0143). `director_first: false` → escalate at once.
- `tick/escalation-act.ts` → `Engine.actOnEscalation(id, body, author)`: re-reads the view, checks
  the action is offered, then: **answer** = existing `answerIn`; **retry** = `unparked` (or
  `unblocked` from `blocked`) via `transition()`, note carried as `owner_note` in the dispatch
  wake delta; rework-cap retry gives exactly one more attempt (`rework_count` stays at the cap);
  **cancel** = `cancelled` via `transition()`, refused with dependents unless `cascade` (then each
  open dependent is cancelled, same door); **run_as_express** = existing `runAsExpress`, which now
  accepts a pending `lane_hold` escalation instead of the reason prefix; **rework** = `rework`
  event with the comment queued as a run follow-up; **recheck** = `isSetupFixed` now → retry, else
  `still_broken`; **replan** = below. Each settles the interaction (CAS) and logs
  `escalation_settled`.
- `tick/setup-recheck.ts`: each tick, owner-stage setup escalations whose `isSetupFixed` is true
  auto-resume (`by: 'auto'`). Facts are cheap reads, no probe runs.
- `tick/escalation-backfill.ts`: at engine start, every `waiting_human` / `blocked` ticket without a
  pending interaction gets an owner-stage escalation from `classifyPark` (DCP-1 → lane_hold).
  Idempotent.
- **Re-plan (simplest safe rule, d-0134):** the triggering ticket stays parked (interaction
  settled `replan`); the card moves `regrill` via `transitionCard()` (a backfilled card with no
  flow snapshot uses `startPlanning` instead); `replan_requested` event; Director wake enqueued.
  While the card is in grilling/verifying/plan_ready, the card's not-started tickets (`inbox`,
  `planned`) are not dispatched (pure filter in `pick-next`); running tickets continue. Planning
  input adds the card's existing tickets with status and plan key. On approval of v(N+1),
  `approvePlanTx` cancels via `transition()` every earlier-version ticket of the card that is
  `inbox`, `planned`, `waiting_human` or `blocked` (note: "replaced by plan vN+1"); done and
  running tickets stay and the plan must not duplicate them. `plan_approved` gains optional
  `plan_keys` parallel to `ticket_ids`.
- `violations.ts`: a `waiting_human`/`blocked` ticket with no pending interaction is reported.

### drivers / server
- drivers: `director-step-prompts.ts` entries for the two steps; README.
- server: `routes/escalations.ts` (act, card list), `routes/tickets.ts`, `routes/interactions.ts`
  (delegate), `services/escalation-view.ts` (rows → views, actions), `services/inbox-source.ts`,
  `services/tracked-storage.ts` (`["ticket", id]`), `schemas/api.ts`. All writes through engine
  doors, never repo writes from a route. Tests: each route's happy path and every listed error.

### Done when (scripted LLM, engine + server tests)
1. Worker asks; `ticket_answer` answers from a decision at 0.9 → Worker resumes, no inbox item,
   card chat shows `escalation_settled` by director.
2. Same at 0.5, or tier C ticket → owner-stage question with suggested answer and options;
   answered via `act` → resumes; a second `act` → 409 `not_pending`.
3. Crash past retry cap → `ticket_recover` retry once → fails again → owner failure with
   Retry / Re-plan / Cancel; Retry dispatches a new run with the note.
4. Run ends `auth` → setup escalation (no LLM call); harness test passes later → auto-resume.
5. DCP-1-style ticket parked before S4a → sweep creates lane_hold; Run as Express releases it.
6. Rework cap → Retry gives one attempt; Re-plan → card grilling, v2 approval cancels
   not-started v1 tickets, keeps done ones.
7. Cancel with dependents → 409; with `cascade` → all cancelled through `transition()`.
8. Question times out → `blocked` with Retry / Re-plan / Cancel; card shows Needs you.
9. Director step parse failure → escalates at once.

## S4a-B web (invoke `hallmark` first; Nielsen pass on each screen before reporting)

- `components/escalation/escalation-card.tsx` (+ small siblings): one renderer for all three
  places. Question: text, suggested answer as a "Use suggested" button, option buttons
  (Recommended badge), free text, Ctrl/Cmd+Enter. Failure: summary, diagnosis, attempts list
  (collapsed), Retry (optional note) / Re-plan (comment dialog, says what happens to tickets) /
  Cancel (confirm; on 409 `ticket_has_dependents` lists them and offers "Cancel all"). Setup:
  summary, **Fix in settings** link (`fix_href`, e.g. `/settings/harnesses/:id#tools`), "I fixed
  it, check again" (recheck; `still_broken` shown inline), "Resumes by itself once fixed" line.
  Settled state: one line "Answered by you / by the Director · 2 min ago".
- `routes/ticket/answer-panel.tsx`: renders `escalations` (owner stage) and `wait_actions` for
  review/needs_signoff and blocked; director stage shows "Director is looking at this".
- Card chat: renders `escalation`, `escalation_settled`, `replan_requested`; looks up the live view
  from `useCardEscalations(cardId)` (`["card", id, "escalations"]`). Banner: when any owner-stage
  escalation is pending, banner shows the count and focuses the first card.
- Inbox row: inline escalation card (compact) for `question` items with `escalation`.
- `api/http/escalations-http.ts`, `api/use-escalations.ts` (act mutation invalidates the keys
  above; optimistic settle with rollback, same pattern as `useAnswerInteraction`),
  `schemas/card-events.ts` mirror, `domain/escalation-copy.ts` (titles per kind and cause in
  plain words: "Held: Standard lane is not available yet"), fake-forge routes.
- Tests (web project): each kind renders and posts the right body; every action wired; 409 paths;
  answering in Inbox settles the chat and ticket views after an SSE invalidate; director stage
  shows no actions; keyboard reachability. Update `ui-screen-map.md`.

## Rule test (no dead ends)
`packages/core/__tests__/domain/escalation-actions.test.ts`: table plus property test iterating
`TicketStatus.options`, `EscalationKind`, every `FailureCause`, every `SetupCause.type`, scheduler
wait kinds and card phases with `needs_you`; each waiting combination must yield ≥1 action, with
and without a card. A new enum value without a mapping fails the test. The engine side is pinned
by `violations.ts` plus Done-when 5 and 8.

**Doors:** tickets move only via `transition()`, cards only via `transitionCard()`, Director
reads only via `admit()` (`director` grant); no git writes; no route writes repos directly.

## Gates (each builder, own scope)
`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; `pnpm prettier --write/--check <changed>`;
`pnpm vitest run --maxWorkers=2 <changed + new tests>` (`--project web` for S4a-B; heavy project
for db/server). ~2 GB free RAM: never the full suite. No commits, pushes or worktrees. LF.
READMEs of touched packages current. PRODUCT.md is left to the orchestrator.

## Open questions for the owner (build proceeds on the default)
1. **Auto-answer threshold.** Default: Director answers alone at confidence ≥ 0.8 with cited
   grounds, never on Tier C tickets; editable in Director settings.
2. **Director retries before asking.** Default: one Director retry per ticket and cause.
3. **Review / NeedsSignoff in S4a.** Default: only Rework and Cancel now; Approve and Tier C
   sign-off arrive with S4b, as planned.
4. **Re-plan and existing tickets.** Default: done and running tickets stay; not-started tickets
   of the old plan are cancelled when the new plan is approved, not before.
5. **Unanswered questions.** Default: keep `interaction_timeout_ms`; timeout moves the ticket to
   `blocked` with Retry / Re-plan / Cancel rather than removing the timeout.
