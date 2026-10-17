# S5c — Full lane, Director check, sign-off and decision escalations (builder brief)

Status: **approved per d-0160 / d-0164 (autonomous run)** · 2026-10-18
Plan: `docs/briefs/card-first-flow-plan.md` §S5c (with S4b), §S4a, §S5b, Invariants, Risks. Decisions: d-0137 (Full =
test-writer → implementer (parallel writers allowed) → gates → reviewer ∥ critic → Director check → sign-off → merge;
high/critical holds the merge as a ticket escalation), d-0141 items 6 and 9 (Tier C named human, Director signs A/B
only, critic optional and labelled, Director check reads typed artifacts only), d-0135 (decision and sign-off kinds, one
item in three places, no dead ends), d-0071 as amended by d-0165 (reviewer blocking findings rework, then the owner),
d-0070 (no narrative for non-writers), d-0073 (critic family), d-0076 (parallel writers, Director decides within
limits), d-0097 (layered limits), d-0012 (merge policy, single merge door), d-0006 (lanes only escalate), d-0151 /
d-0152 (lane pipelines, list editor, no loops), d-0085 / d-0090 (config rows, UI only), d-0143 (cost warns).
**Builds on S5b** (`docs/briefs/s5b-pipelines.md`, "S5b-A contract (as built)"): `stageCursor`, `stage_runs`,
`ticket_pipelines`, `submit_review`, `LIVE_LANES`, migration 0025. S5c starts only after **S5b-B is committed**; S5c-B
extends its pipeline web files (`api/http/pipelines-http.ts`, `api/use-pipelines.ts`, `api/use-ticket-pipeline.ts`,
`schemas/pipelines.ts`, `components/pipelines/*`, the ticket pipeline strip).

There are two builders. They work in parallel against the **contract** below, and neither edits the other's files.
Both read `.claude/rules/code.md` first.
- **S5c-A backend:** core, tools, mcp, gates, db, engine, drivers, server.
- **S5c-B web:** `apps/web` and `docs/design/ui-screen-map.md`.

## What exists today

| Concern | Where | Gap against the decisions |
|---|---|---|
| Full lane held | `engine/src/domain/live-lanes.ts` L16 `LIVE_LANES = ['express','standard']`; `tick/lane-hold-release.ts` releases holds of live lanes | Full must run; its held tickets resume |
| Built-in Full | `core/src/domain/builtin-pipelines.ts` L53–76: `test-writer → implementer → g1 → group(reviewer, critic) → human → merge` | no Director check; a `human` stage makes the owner review **every** Full ticket, even tier A (against d-0137 / d-0141 item 9) |
| Human stage | `core/domain/stage-cursor.ts` L187–193 (`human` → `{merge, hold:true}`); `tick/verify-merge.ts` L242–251; `tick/stage-records.ts` L112–236 (`holdForHuman` / `approveHuman` / `sendBackFromHuman`) | only an owner wait; no Director signer |
| Review / sign-off waits | ticket status `review` / `needs_signoff`; actions from `core/domain/escalation-actions.ts` L34–43, L122–123; `POST /tickets/:id/act` (`tick/escalation-act.ts` L224–279) | **not an interaction**: absent from card chat; Inbox shows `ticket_review` / `ticket_signoff` (`apps/server/src/services/inbox-source.ts` L57–80). Breaks d-0135 "one item, three places" |
| Hold for owner | `tick/stage-send-back.ts` L139–150 `holdForOwnerTx` → `parkVerifyingTx` → failure cause `not_retried` (Retry / Re-plan / Cancel) | no "Merge anyway"; Retry re-runs the check (d-0071's owner choice missing) |
| Rework cap | `stage-send-back.ts` L112: `gate_failed` at cap → `waiting_human` + `rework_cap` | a reviewer's findings at the cap offer no Merge anyway |
| Escalation kinds | `core/src/schemas/escalation.ts` L195 `EscalationKind = question \| failure \| setup`; actions already hold `approve`, `sign_off` | no `decision`, no `sign_off` kind; `interactions.kind` has no CHECK (0001 L132), so no table change |
| Groups | `core/domain/pipeline-stage-rules.ts` L134–166 `group_writer` refuses writers in a group; `pipeline-rules.ts` L105–124 `writer_after_check` | no parallel writers (d-0076) |
| Check group dispatch | `tick/dispatch-check.ts` L98–180 starts **every** agent member in one loop after the scheduler placed only the first | **contradiction**: reviewer ∥ critic runs 2 Workers under the default `max_concurrent_per_project: 1` (`builtin-config.ts` L50; d-0097) |
| One live run per ticket | `tick/outcome.ts` L63–69 drops the settle of a non-assignee run while the assignee is active; `tick/restart.ts` L87; `tick/wake-candidates.ts` L43, L97 | a parallel writer's settle would be lost |
| Critic family | `core/domain/effective-pipelines.ts` L52–83: critic = id `critic` or `duplicate:critic`; warning only at pipeline level | a hand-made critic is missed; no per-ticket label (d-0073 asks for both) |
| Live ticket strip | `apps/server/src/services/tracked-storage.ts` watches cards / tickets / interactions only; `StageRunRepository.finish(id, …)` has no ticket id | `['ticket-pipeline', id]` is never published; the web ticket key is `['ticket', id]` (`apps/web/src/api/use-tickets.ts` L33), not `['tickets', id]` |
| Director steps | `core/schemas/steps.ts` L23–38, `forge-config.ts` L25–40, `builtin-director.ts` L25–42, `steps/run-step`; `escalation-recover-step.ts` is the pattern | no `ticket_check` step |
| Plan entry | `core/schemas/plan.ts` L30–39 (`acceptance`, `files`); `tick/plan-keys.ts`, `stage-artifacts.ts` L80–97 | the typed source for the Director check |
| Tier C signer | `core/domain/state-machine.ts` L156–168 (`done` from `needs_signoff` needs a signer) | the door does not stop the Director from being a "signer" |

## Orchestrator calls (binding)

- **Full goes live.** `LIVE_LANES` gains `full`. Held Full tickets are released by the existing per-tick phase
  (`pipeline_ready`). The `lane_hold` cause stays for old rows only.
- **New built-in Full**: `test-writer (red) → implementer → g1 → group "review-group" [reviewer, critic
  (on_blocking:'hold')] → director_check "check-plan" → sign_off "sign-off" (signer:'director_or_owner') → merge`.
  The critic stays **optional** (the editor can remove it) and carries the same-family label while only one model
  family is connected (d-0073). Saved owner lists that use `human` keep working unchanged.
- **Findings: rework vs hold** (reconciles d-0071 with d-0165). One pure rule, `blockingRoute()`:
  - **Deterministic gates** (G1, script gates) send work back up to `MAX_AUTO_REWORKS`; at the cap the existing
    `rework_cap` failure (Retry / Re-plan / Cancel). **Never** Merge anyway on a gate: gates still block.
  - **Check agents and Director check with `on_blocking:'rework'`** (the built-in reviewer, d-0165) send work back up
    to the cap. At the cap the ticket is **held**: it parks from Verifying with a `decision` escalation, cause
    `findings_hold`.
  - **`on_blocking:'hold'`** (the built-in critic and Director check; any stage the owner sets) holds at once.
  - A held ticket offers **Merge anyway** (owner only, reason required, recorded), **Send back**, **Re-plan**, **Cancel**.
  - This is the one intended change to Standard: a reviewer's findings at the cap end in `findings_hold` instead of
    `rework_cap`. Every earlier step is unchanged (Done when 2).
- **Director check is a Director step, not a Worker run.** A tool-less `ticket_check` step over typed artifacts only
  (plan entry acceptance and files, ticket, diff, gate_report, test_report, findings). `narrative` and `finish_claims`
  are never passed in (d-0141 item 9).
  - The engine computes unplanned files deterministically (diff paths not matched by the plan's `files`).
  - An unmet acceptance becomes a `high` finding; `unclear` becomes `medium`.
  - `out_of_plan` with a non-empty unplanned list raises a `decision`, cause `scope_drift` (Continue / Re-plan /
    Cancel): the d-0135 "bigger than planned" case.
  - A ticket with no plan entry gets the stage `skipped` ("no plan to check against"); the Director may not sign it.
  - Runs as an in-memory job like `stage-script-jobs.ts`, outside any transaction. Counts toward the card budget as a
    warning only.
- **Sign-off stage.** `signOffDecision()` is pure and deterministic, no second LLM call. The **Director signs** only when
  all hold: signer is `director_or_owner`; the tier from the real diff is ≤ Director setting `sign_off.max_tier`
  (default `B`; a project may only lower it); every check in this cycle passed; the Director check passed with no
  override; the step did not error. Otherwise a `sign_off` escalation goes to the owner with the reason the Director
  declined. **Tier C is always the owner**: `transition()` refuses `done` from `needs_signoff` when the signer is the
  reserved id `director`, and `passAndMerge` refuses Director signing on tier C (fail closed). When the Director signs:
  tier A merges as today; tier B records `gate_passed(B)` then `mergeReviewed(…, 'director')` (same checks, same door),
  and a card note records "Signed off by the Director (tier B): …reasons".
- **Every owner wait for finished work becomes a `sign_off` interaction.** When `passAndMerge` leaves a ticket in
  `review` / `needs_signoff`, one `sign_off` escalation is raised at the owner stage (no Director first look).
  `POST /interactions/:id/act` with `approve` / `sign_off` / `rework` / `cancel` settles it; `POST /tickets/:id/act`
  keeps working and settles the pending item, so both doors agree. The start-up backfill (`escalation-backfill.ts`)
  raises one for every ticket already in `review` / `needs_signoff`. The Inbox drops the `ticket_review` /
  `ticket_signoff` duplicate while a pending `sign_off` exists.
- **Owner-only.** `decision` and `sign_off` start at the owner stage; the Director sweeps (`escalation-director.ts`) skip
  them. `actOnEscalation` refuses `merge_anyway`, `continue`, `approve` and `sign_off` from any actor but `owner`
  (`action_not_offered`). `merge_anyway` and `continue` need `comment` (≥5 chars), recorded in `answer_json`, the card
  event `escalation_settled`, and `outcome.override { by:'owner', comment, at }` on the held stage row, which then
  reads `passed`.
- **Parallel writers = a writer group in the same worktree with disjoint write scopes** (open question 3).
  - A `group` whose members are all writers (2–4, role `writer`, distinct agents, no `proof`, scopes pairwise disjoint,
    none `**`) runs its members concurrently in the ticket worktree; `admit()` already enforces each member's
    `write_scope` (`tools/src/domain/agent-grant.ts` L51–58).
  - Each member is its own scheduler candidate: one `stage` wake per member, placed by `pickNext` against global,
    per-project and per-harness caps. The In Progress cap counts the ticket once; with the default per-project 1 the
    members run one after another.
  - G1 judges the integrated worktree; the other members' runs count as the ticket's earlier runs (`earlierRunIds`).
  - A check's default `rework_to` of a writer group re-runs every member.
  - The same placement fix applies to **check groups** (the contradiction above).
- **Doors unchanged.** Ticket status only through `transition()`, with two small additions: `rework` becomes legal from
  `waiting_human` when `parked_from === 'verifying'` (owner sends a held ticket back; no rework bump), and the tier C
  "no Director signer" precondition. Merge only through `verify-merge.ts`. Pipeline config only through `pipeline-store`.

## Contract (shared, binding)

### Core schemas (S5c-A owns; S5c-B imports from `@forge/core`)

```ts
// schemas/pipeline.ts
DirectorCheckStage = { id, kind:'director_check', label, on_blocking?:'rework'|'hold' /* default 'hold' */, blocking?: Severity[] }
SignOffStage = { id, kind:'sign_off', label, signer:'director_or_owner'|'owner', prompt (1–500) }
GroupStage.members: (AgentStage|ScriptGateStage)[]       // unchanged shape; writers allowed when ALL are writers
Stage = Agent | ScriptGate | Group | Human | DirectorCheck | SignOff | Merge
PIPELINE_PROBLEM_CODES += 'group_mixed','writer_scope_overlap','writer_group_proof','director_check_position',
  'director_check_duplicate','sign_off_position' /* one human-or-sign_off, after every check and the director check */,
  'critic_same_family' /* only when ≥2 model families are connected; else a warning */
PipelineRuleContext += { families_available: string[] }
// schemas/stage-run.ts
STAGE_RUN_KINDS = ['agent','script_gate','human','director']
StageOutcome += { check?: TicketCheckOutput, unplanned?: string[] (≤200), signed_by?: 'director'|'owner',
                  sign_reason?: string (≤500), override?: { by:'owner', action:'merge_anyway'|'continue', comment, at },
                  same_family?: true }
StageView += { warnings: string[], signed_by?, override?, scope?: string[] /* writer member */ }
StageView.kind += 'director_check' | 'sign_off'
// schemas/agent.ts
ArtifactKind += 'check_report'
// schemas/director-steps.ts
TicketCheckOutput = { verdict:'pass'|'changes'|'out_of_plan', summary (1–2000),
  acceptance: { criterion (1–500), met:'yes'|'no'|'unclear', evidence (1–1000) }[] (≤30),
  findings: Finding[] (≤30), confidence: 0..1 }   // refine: 'pass' ⇒ no met:'no', no critical/high
// schemas/steps.ts STEP_NAMES += 'ticket_check'; ModelMatrix.director.ticket_check; step_timeouts_ms.ticket_check = 300_000
// schemas/director-config.ts
DirectorConfig.sign_off = { max_tier: 'none'|'A'|'B' }   // default 'B'; project override may only lower; C is not a value
// schemas/escalation.ts
EscalationKind = 'question'|'failure'|'setup'|'decision'|'sign_off'
DECISION_CAUSES = ['findings_hold','scope_drift']
EscalationDecision = { kind:'decision', cause, summary, stage_id: StageId, stage_label,
  findings: Finding[] (≤20, the blocking ones), unplanned?: string[] (≤50), rework: { count, cap } }
EscalationSignOff = { kind:'sign_off', cause:'tier_b'|'tier_c'|'owner_stage'|'director_declined', tier: Tier,
  summary, director_note?: string, checks: { passed:int, counts: Record<Severity,int>, overrides:int } }
ESCALATION_ACTIONS += 'merge_anyway','continue'
EscalationActBody += { action:'merge_anyway', comment } | { action:'continue', comment }
```

**Pure domain** (`core/domain/`, each ≤300 lines, property-tested where marked):
- `escalation-actions.ts`: `DECISION_ACTIONS = { findings_hold: ['merge_anyway','rework','replan','cancel'],
  scope_drift: ['continue','replan','cancel'] }`; `SIGN_OFF_ACTIONS(tier)`: C → `['sign_off','rework','cancel']`, else
  `['approve','rework','cancel']`; `escalationActions` covers every kind. `ticketWaitActions` for `review` /
  `needs_signoff` returns the pending `sign_off` item's actions when there is one, else the current tables.
- `stage-route.ts` (new, property test): `blockingRoute({ klass, policy, reworkCount, cap }) → 'rework' | 'hold' |
  'rework_cap'`. `checkPolicy` defaults `director_check` to `hold`.
- `sign-off.ts` (new, property test): `signOffDecision({ signer, tier, maxTier, checksPassed, checkPassed, overrides,
  stepError }) → { by:'director'|'owner', reason }`; never `director` for tier C.
- `stage-cursor.ts`: new cursors `{run_writers, stage, members, cycle}`, `{director_check, stage, cycle}`,
  `{sign_off, stage, cycle}`; `human` keeps `{merge, hold:true}`; a row with `outcome.override` counts as passed.
- `pipeline-rules.ts` / `pipeline-stage-rules.ts`: the codes above. `scopesOverlap(a, b)` is conservative (literal prefix
  before the first wildcard; `**` overlaps everything). `critic_same_family` is a problem when
  `families_available.length ≥ 2`, else a warning.
- `effective-pipelines.ts`: a critic is any `reviewer`-role agent whose id or name contains `critic`, or whose origin is
  `duplicate:critic` / `template:*critic*`. `live` is true for all three lanes.
- `escalation-classify.ts`: `classifyPark` maps reasons starting `findings_hold:` / `scope_drift:` to
  `{ kind:'decision', cause }`; `ParkClass` becomes a union.
- `unplanned-files.ts`: `unplannedFiles(planFiles, diffPaths)`, glob-aware, ignores deletions of planned files.

**Edits:** `state-machine.ts` (the `rework` edge and the tier C `director` signer precondition);
`types/ports/stage-storage.types.ts` gains `StageRunRepository.get(id)`; `types/ports/director-llm.types.ts` gains the
`ticket_check` input (`{ artifacts: {kind, content, truncated}[], unplanned: string[], playbook, house_rules }`);
`domain/builtin-director.ts` adds the `check-against-plan` playbook v1 and timeouts; `.forge/config/forge.yaml` adds
`models.director.ticket_check: opus` (keep that file's CRLF endings; the yaml equality test pins it).

### DB — migration **`0026-full-lane.ts`** (0025 is the highest; verify before writing)

Rebuild `stage_runs` (kind CHECK adds `'director'`) and `stage_artifacts` (kind CHECK adds `'check_report'`). Foreign keys
are ON (`adapters/sqlite/better-sqlite-driver.ts` L34), so keep this order:
1. create `stage_runs_new`, copy rows keeping ids;
2. create `stage_artifacts_new` referencing `stage_runs_new(id)`, copy;
3. drop `stage_artifacts`, then `stage_runs`;
4. rename `stage_runs_new` → `stage_runs`, then `stage_artifacts_new` → `stage_artifacts`;
5. recreate `idx_stage_runs_ticket`, `idx_stage_runs_run`, `idx_stage_artifacts_ticket` and the UNIQUE key.

The kind lists are written out in SQL and a test pins them equal to core (as 0025). The migration must keep every
existing row of a real database (test with seeded 0025 rows). Repositories (sqlite and memory) gain `stageRuns.get(id)`,
with contract tests on both adapters.

### Engine API (S5c-A)

- `tick/stage-director-check.ts`: `startDirectorCheck(ctx, t, state, stage)` / `applyDirectorCheck(ctx, t, job)`. Job key
  `ticket:run:stage:cycle`; row kind `director`; step output and unplanned list stored as artifact `check_report`. A
  failure goes through `decideFailure` (retry, then park with a failure). A lost job re-runs after restart.
- `tick/stage-sign-off.ts`: `signOff(ctx, t, state, stage, hooks)` evaluates `signOffDecision`. Director signs: a
  `director` row passed, then `hooks.merge(…, { hold:false, directorSigned:true })`. Owner signs: `holdForHuman`
  (generalised to `human` or `sign_off`) plus `raiseSignOff`.
- `tick/escalation-raise.ts`: `raiseDecisionTx(ctx, tx, t, payload)` parks from Verifying with reason `<cause>: …`,
  inserts the interaction at the owner stage, logs `escalation`. `raiseSignOffTx` does not park.
- `tick/escalation-effects.ts`: `overrideTx` (`merge_anyway` / `continue`) marks the held row passed with the override,
  settles, then `unparked`. `reworkTx` covers a held ticket (held row `failed`, then `rework`, then a continuation wake
  carrying findings and comment). `approve` / `sign_off` on a `sign_off` item → `approveAndMerge`, then settle.
- `tick/stage-send-back.ts`: `sendBackTx` consults `blockingRoute` before `gate_failed`; `holdForOwnerTx` raises
  `findings_hold` instead of the generic failure.
- `tick/verify-merge.ts`: `passAndMerge(ctx, t, rows, { hold, directorSigned })`; `mergeReviewed` accepts signer
  `director` for tier A/B only.
- Parallel placement: `tick/schedule.ts` + `domain/pick-next.ts` build candidates per `(ticket, member)` for writer and
  check groups; `wake-candidates.ts` treats a member wake as live while that member has no running row;
  `dispatch-check.ts` starts only the member it was placed for; `dispatch-stage.ts` / `chooseWriter` handle
  `run_writers`; `outcome.ts` L63–69 lets a writer-group member's run settle while siblings run; `restart.ts` resumes
  member runs by their stage row.
- `domain/live-lanes.ts`: all three lanes.

### HTTP (S5c-A implements, S5c-B consumes)

Envelope as S5a/S5b: `{ error: { code, message, issues?, ...details } }`. Writes return the fresh views.

| Method + path | Body | 200 response | Errors |
|---|---|---|---|
| `POST /interactions/:id/act` | union + `{action:'merge_anyway', comment}`, `{action:'continue', comment}`; `approve` / `sign_off{signer?}` / `rework{comment}` / `cancel` valid on `sign_off` items | `{ escalation: EscalationView }` | 400 `invalid_request`; 404 `interaction_not_found`; 409 `not_pending` (+`settled`), `action_not_offered`, `stale`, `head_moved`, `merge_refused`, `ticket_has_dependents` |
| `POST /tickets/:id/act` | unchanged | `{ ticket_id, action }`; also settles the pending `sign_off` item | unchanged |
| `GET /cards/:id/escalations` | none | `{ items }` incl. `decision` / `sign_off` | 404 `card_not_found` |
| `GET /inbox…` | unchanged | items carry `decision` / `sign_off` views; no `ticket_review` / `ticket_signoff` duplicate while one is pending | unchanged |
| `GET /tickets/:id` | none | `wait_actions` from the pending `sign_off` / `decision` item | unchanged |
| `GET /tickets/:id/pipeline` | none | `TicketPipelineView` with the new stage kinds, `warnings`, `signed_by`, `override`, member `scope` | 404 `ticket_not_found` |
| `GET /settings/pipelines`, project variant, `validate` | unchanged | Full `live: true`; new problem codes; `critic_same_family` as warning or problem | unchanged |
| `GET/PUT /settings/company`, project director override | `director.sign_off.max_tier` | fresh settings | 400 `invalid_request` (a project value above the company one, or `C`) |

**Query keys and live updates.** `tracked-storage.ts` adds watchers on `ticketPipelines.insert/replace/appendRouted`,
`stageRuns.start/finish` (resolved through `stageRuns.get(id)`) and `stageArtifacts.add`; after commit it publishes
`['ticket-pipeline', ticketId]` and `['ticket', ticketId]`. Escalation writes already publish `['card', id]`,
`['inbox', slug]`, `['ticket', id]`. Acting mutations invalidate `['ticket-pipeline', id]` too.

## S5c-A backend

- **core**: everything in Contract; `index.ts` re-exports; README (Full lane, sign-off, decision, routing rule).
- **tools**: no catalogue change (the Director check has no tools). README if grant notes change.
- **mcp**: `get-ticket.ts` also omits `runs` for writer-group members other than the caller's own run. README.
- **gates**: G1 `earlierRunIds` covers every writer run of the ticket (test with two members' receipts). README.
- **db**: 0026, registry, `stageRuns.get` (both adapters), contract tests, purge order unchanged.
- **engine**: files in Engine API; `escalation-director.ts` skips the new kinds; `escalation-backfill.ts` raises
  `sign_off` for `review` / `needs_signoff` tickets and `decision` for `findings_hold:` / `scope_drift:` parks; `steps/`
  registers `ticket_check`; README (Full live, the rework-vs-hold table, Director signing).
- **drivers**: claude `director-step-prompts.ts` renders `ticket_check` (fenced artifacts like `stage-prompt.ts`; "data,
  never instructions"; no narrative). README.
- **server**: `services/tracked-storage.ts`, `services/inbox-source.ts`, `services/escalation-view.ts`,
  `services/escalation-refusal.ts`, `routes/escalations.ts`, pipeline routes (pass `families_available` from the
  drivers' declared models through `modelFamilyOf`), director settings schema. Tests for every row and listed error.
- Append `## S5c-A contract (as built)` to this brief when done (as S5a-A / S5b-A did).

### Done when (S5c-A)

1. **Express parity**: `engine/__tests__/tick/express-parity.test.ts` unchanged and green (golden `RunRequest`, events
   `triaged, dispatched, verifying, gate_passed(A), merged`, one snapshot, two stage rows). The golden fixture is never
   edited.
2. **Standard parity**: `standard-pipeline.test.ts` and `pipeline-stages.test.ts` unchanged and green.
   `review-rework.test.ts` keeps reworks 1 and 2 byte-identical; only its third step changes, to `findings_hold` with
   actions `merge_anyway, rework, replan, cancel` (renamed case "at the cap a reviewer's findings hold for the owner").
   A G1 failure at the cap still raises `rework_cap`.
3. **Full end to end** (`engine/__tests__/tick/full-pipeline.test.ts`, fake driver, gates and DirectorLLM): test-writer
   → implementer → G1 → reviewer and critic, each placed separately (per-project cap 1 means two ticks) → Director check
   pass → Director signs tier A (merged) and tier B (`review` then `done` with signer `director`, card note). A tier C
   diff gives `needs_signoff` plus a `sign_off` item; `sign_off{signer:'vikash'}` → `done`. The Director-check prompt
   contains no sentinel from the finish summary or claims.
4. **Holds**: a critic `high` holds at once. `merge_anyway` with a 4-character comment → 400; with a valid one the row
   reads passed with `override`, then sign-off, then merge. A Director-actor `merge_anyway` → `action_not_offered`.
   `rework` from the hold → `in_progress`, rework_count unchanged, findings and comment in the wake.
5. **Scope drift**: unplanned files plus `out_of_plan` → `decision/scope_drift`; `continue` proceeds; `replan` goes to
   the card.
6. **Fail closed**: a Director-check error, retried then exhausted → failure park, never a pass. A ticket with no plan →
   check `skipped` and owner sign-off. `transition` refuses tier C `done` with signer `director`.
7. **Held Full resumes**: a seeded Full ticket with a `lane_hold` → one tick → settled `pipeline_ready` and dispatched.
8. **Parallel writers**: a group of `frontend-writer` (`apps/web/**`) and `backend-writer` (`packages/**`) with
   per-project cap 2 starts both runs; each settle is kept; G1 passes with both runs' receipts; a finding re-runs both.
   With cap 1 they run one after another. A save with overlapping scopes → 400 `pipeline_invalid` /
   `writer_scope_overlap`.
9. **One item, three places**: a `sign_off` item appears in `GET /cards/:id/escalations`, Inbox (once) and ticket
   `wait_actions`. Approving through `/tickets/:id/act` settles it; a second act → 409 `not_pending`. The backfill
   raises items for old `review` tickets.
10. **Live strip**: a stage write publishes `['ticket-pipeline', id]` (server test on tracked storage).
11. **Restart** during the Director check or a writer member: no duplicate rows; the stage completes.

## S5c-B web (invoke `hallmark` first; Nielsen pass on each screen before reporting)

- **Escalation card** (`components/escalation/`): new `escalation-decision.tsx` (blocking findings by severity with
  file:line and evidence, rework count, unplanned files) and `escalation-signoff.tsx` (tier badge, checks summary, "Why
  the Director did not sign"). `escalation-dialogs.tsx` adds `MergeAnywayDialog`: reason required (≥5 chars), says
  "Recorded on the card. Only you can do this. Gates still passed." Continue uses the same dialog worded for scope
  drift. Tier C keeps the signer field. The same card renders in card chat (`routes/card/tabs/conversation-tab.tsx`,
  `domain/card-escalation-lines.ts`), on the ticket page (answer panel, Review tab) and in the Inbox row. Settled items
  collapse to "Merged anyway by you: <reason>" or "Signed off by …".
- **Copy**: `domain/escalation-copy.ts` adds `merge_anyway: 'Merge anyway'`, `continue: 'Continue as is'`, titles for both
  causes and every sign-off cause. The web typecheck breaks until this lands; coordinate with S5c-A as S5b did.
- **Ticket Review tab**: `domain/route-tabs.ts` `ticketHasReview` is also true while a `decision` / `sign_off` item is
  pending; the tab shows the item above the review facts.
- **Pipeline editor** (S5b-B files): Add stage gains **Director check** (blocking severities, "On blocking findings: hold
  for me / send back") and **Sign-off** ("Director signs tier A/B, you sign tier C" or "Always you"). The group editor
  allows a **writer group** (writer agents only, scope chips per member, the overlap problem in words). The critic
  shows the same-family warning as a badge. Full loses the "held" notice.
- **Ticket pipeline strip**: the Director check chip opens an acceptance checklist (met / not met / unclear with
  evidence) and the unplanned files; the sign-off chip reads "Signed by the Director" or "Waiting for you"; an override
  badge; writer-group members side by side with their scopes; the per-ticket same-family label. Refetches on
  `['ticket-pipeline', id]`.
- **Director settings** (Forge Director page and the project director override): "Director sign-off: up to tier B /
  tier A only / never", with a locked line "Tier C always needs you".
- Tests (web project): each new card in the three places; Merge anyway validation and confirm; Continue; sign-off
  approve and tier C signer; Review tab appears for a held ticket; editor adds a Director check, a sign-off and a writer
  group with an overlap problem (Save disabled); strip chips for check, sign-off, override and members; settings select
  and locked C; keyboard reachability. Update `ui-screen-map.md` (Ticket Review, Inbox, Pipelines).

### Done when (S5c-B)

Every HTTP row is reachable from a control. Every new waiting state shows at least one action. Each screen has loading,
empty, error and settled states. The Nielsen checklist is filled per screen in the report.

## Rule tests

- `core/__tests__/domain/escalation-actions.test.ts`: every `EscalationKind` × cause × tier has a non-empty row; no
  pending item has zero actions (d-0135).
- `core/__tests__/domain/stage-route.test.ts` (property): a gate never routes to `hold`; a check never routes past the
  cap to `rework`; `hold` policy always routes to `hold`.
- `core/__tests__/domain/sign-off.test.ts` (property): `by:'director'` never for tier C, never above `maxTier`, never
  with a failed or skipped check or an override.
- `core/__tests__/domain/state-machine.test.ts`: tier C `done{signer:'director'}` refused; `rework` from a held ticket
  legal, from any other `waiting_human` illegal.
- `core/__tests__/domain/pipeline-rules-properties.test.ts`: no valid list has a mixed group, overlapping writer scopes
  or a Director check before G1; all built-ins are valid.
- `core/__tests__/domain/stage-cursor-groups.test.ts`: writer groups await every member; an override counts as passed.
- `engine/__tests__/tick/stage-director-check.test.ts`: the step input never contains `narrative` or `finish_claims`.

**Doors:** tickets only via `transition()`; merge only in `verify-merge.ts`; tools only via `admit()`; pipeline config
only via `ConfigSource.append` through `pipeline-store`; owner-only actions checked in `actOnEscalation`.

## Gates (each builder, own scope)

`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; prettier `--write/--check <changed>`;
`vitest run --maxWorkers=2 <changed + new tests>` sequentially, one package at a time (`--project web` for S5c-B; heavy
for db, server and gates). About 2 GB free RAM: never the full suite; on a memory failure drop to `--maxWorkers=1` and
defer heavy suites (d-0164). Foreground only, each command under ~9.5 min. No commits, pushes, stashes or worktrees.
LF line endings (keep CRLF where an existing file uses it). READMEs current. PRODUCT.md is left to the orchestrator.

## Open questions for the owner (build proceeds on the default)

1. **Rework vs hold.** Default: gates rework, then `rework_cap` (no Merge anyway). The reviewer reworks up to 2, then
   holds with Merge anyway (d-0165, then d-0071). The critic and Director check hold at once.
2. **Standard at the cap.** Default: a reviewer's at-cap ending changes from `rework_cap` to `findings_hold`.
   Alternative: keep `rework_cap` and add Merge anyway to it.
3. **Parallel writers.** Default: same worktree, disjoint scopes enforced by `admit()`, no integration step.
   Alternative (d-0076's note): a worktree and branch per writer, merged by the engine.
4. **Director signs tier B.** d-0012 (Director-authored) says tier B needs a human click; d-0141 item 9 and d-0137 (owner)
   say the Director signs A/B. Default: the Director signs B only at a `sign_off` stage with signer `director_or_owner`
   (built-in Full). Express and Standard tier B keep the owner's review. `max_tier` can lower this.
5. **Director check without a plan.** Default: skipped, and the owner signs.
6. **Writer group rework.** Default: every member re-runs. Later: only members whose scope covers the finding's files.
7. **Critic family.** Default: a warning while one family is connected; `critic_same_family` refuses once two are.
8. **Approval mode "always ask".** Default: it does not force owner sign-off; `sign_off.max_tier` controls that.
