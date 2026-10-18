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


## S5c-A contract (as built)

Everything in "Contract (shared, binding)" holds unless listed under **Deviations**. Error envelope as S5a/S5b:
`{ error: { code, message, issues?, ...details } }`. The act routes keep their S4a code `invalid_body` for a bad body
(the brief's `invalid_request` applies to the settings routes). Writes are authored `owner`.

### Shared shapes (core `@forge/core`; mirror in the web)

- `schemas/pipeline.ts`: `DirectorCheckStage` (`{ id, kind:'director_check', label, on_blocking?, blocking? }`, default policy
  **hold**, no `rework_to`), `SignOffStage` (`{ id, kind:'sign_off', label, signer:'director_or_owner'|'owner', prompt }`),
  `Stage` gains both. `GroupStage.members` is now max 4 (it was 8; the rule `group_size` still says 2 to 4). Problem codes
  added: `group_mixed`, `writer_scope_overlap`, `writer_group_proof`, `director_check_position`, `director_check_duplicate`,
  `sign_off_position`, `critic_same_family`. A mixed group (writer plus check) reports `group_mixed` on the group and still
  `group_writer` on the writer member. A group is a **writer group** when every member is an agent stage whose agent has
  role writer or tester; it needs 2 to 4 distinct agents, no `proof`, and write scopes that cannot meet (`scopesOverlap()`,
  conservative; `**` and the same agent twice overlap). `PipelineRuleContext.families_available: string[]` is required.
  `critic_same_family` is a **problem** only when `families_available` holds two or more families; with one family it stays
  the `PipelineView.warnings` text (`SAME_FAMILY_WARNING`, now also for any reviewer whose id or name contains `critic`, or
  whose origin is `duplicate:critic` / `template:*critic*`).
- Built-in Full: `test-writer(red) -> implementer -> g1 -> review-group [review: reviewer, critique: critic (on_blocking hold)]
  -> check-plan (director_check) -> sign-off (sign_off, director_or_owner) -> merge`. Saved lists with a `human` stage are
  unchanged and valid. Routed (rule) checks are inserted before the first of `director_check`, `sign_off`, `human`, `merge`.
- `schemas/stage-run.ts`: `STAGE_RUN_KINDS = agent | script_gate | human | director`. `StageOutcome` adds `check`
  (`TicketCheckOutput`), `unplanned` (<=200), `signed_by` (`director|owner`), `sign_reason`, `override`
  (`{by:'owner', action:'merge_anyway'|'continue', comment, at}`), `same_family: true`, and `attempts` (the Director
  check's failed tries, for the retry bound). `Finding` moved to `schemas/finding.ts` (still exported from `@forge/core`).
- `StageView` (`TicketPipelineView.stages[]`, members too): `kind` adds `director_check` and `sign_off`; new keys
  `findings?` (the current round's findings of that row, **capped at 20**, with `file`, `line`, `evidence`; `counts` still
  counts all), `warnings: string[]` (always present; holds the same-family text on a critic that ran on the Worker's
  family), `signed_by?`, `override?`, `scope?` (a **writer-group member's** write scope, absent elsewhere), `check?` (the
  Director check's `TicketCheckOutput`: acceptance verdicts, findings, confidence), `unplanned?` (files outside the plan),
  and `summary` for a sign-off is the signing reason. `MAX_VIEW_FINDINGS = 20`.
- `schemas/ticket-check.ts` (new file): `TicketCheckOutput` as in the contract (a `pass` that lists a `met:'no'` or a
  critical or high finding is refused as invalid output), `AcceptanceCheck`, `MAX_ACCEPTANCE_CHECKS`.
- `schemas/escalation.ts`: `EscalationKind` adds `decision` and `sign_off`; `DECISION_CAUSES = findings_hold | scope_drift`;
  `EscalationDecision { kind:'decision', cause, summary, stage_id, stage_label, findings (<=20, the blocking ones),
  unplanned? (<=50), rework:{count,cap} }`; `SIGN_OFF_CAUSES = tier_b | tier_c | owner_stage | director_declined`;
  `EscalationSignOff { kind:'sign_off', cause, tier, summary, director_note?, checks:{passed, counts:Record<Severity,int>,
  overrides} }`; `ESCALATION_ACTIONS` adds `merge_anyway` and `continue`; `EscalationActBody` adds
  `{action:'merge_anyway', comment}` and `{action:'continue', comment}` (comment trimmed, **at least 5 characters**);
  `rework{comment}`, `approve`, `sign_off{signer?}` and `cancel{cascade?}` are valid on the new items. `EscalationAnswer`
  carries `comment`. The card event `escalation_settled` payload gains optional `comment`. `InteractionKind` adds
  `decision` and `sign_off`; `interactions.kind` has no CHECK, so no table changed.
- Action tables (`escalation-actions.ts`): `DECISION_ACTIONS.findings_hold = [merge_anyway, rework, replan, cancel]`,
  `.scope_drift = [continue, replan, cancel]`; `SIGN_OFF_ACTIONS(tier)`: C `[sign_off, rework, cancel]`, A/B `[approve,
  rework, cancel]`; `replan` is dropped for a ticket with no card (as for every kind). `ticketWaitActions` for `review` /
  `needs_signoff` returns the pending sign-off item's actions when there is one.
- `schemas/director-config.ts`: `DirectorConfig.sign_off = { max_tier: 'none'|'A'|'B' }` (default `B`; `C` is not a value).
  `STEP_NAMES` adds `ticket_check`; `ModelMatrix.director.ticket_check` (`opus`, also in `.forge/config/forge.yaml`);
  `step_timeouts_ms.ticket_check = 300000`; playbook `check-against-plan` (v1) in `director.playbooks`. A project override
  may only lower `sign_off.max_tier` (see PUT below); the merged effective value is held to the company's.

### Routes (all as the contract table unless noted)

| Route | Behaviour as built |
|---|---|
| `POST /interactions/:id/act` | body union as above; 200 `{ escalation: EscalationView }` (the item after the action: `status`, `settled`, `actions`). 400 `invalid_body` (+`issues`) for a short or blank `comment`. 404 `interaction_not_found`. 409 `not_pending` (+`settled`), `action_not_offered` (also for `merge_anyway` / `continue` / `approve` / `sign_off` from any author other than the owner, and for an action the item's payload does not offer), `stale`, `head_moved`, `merge_refused` (+`detail`), `ticket_has_dependents` (+`dependents`). |
| `POST /tickets/:id/act` | unchanged shape; `approve`, `sign_off`, `rework` and `cancel` now **settle the pending sign-off item** in the same step, so both doors agree. After an item is settled a second act on the same item through `/interactions/:id/act` is 409 `not_pending`; a second act through the ticket door on a ticket that is already done is 409 `action_not_offered`. |
| `GET /cards/:id/escalations` | `{ items }` includes `decision` and `sign_off` items (pending first). |
| `GET /projects/:slug/inbox` | a ticket in `review` / `needs_signoff` is listed **once**, through its sign-off item (`question:<interaction id>` with `escalation` = the view); a plain `ticket_review` / `ticket_signoff` row appears only when no sign-off item is pending. A held ticket is listed through its decision. |
| `GET /tickets/:id` | `escalations` includes the item; `wait_actions` come from the pending sign-off item (finished work) or from the pending owner items (held). |
| `GET /tickets/:id/pipeline` | `TicketPipelineView` as above (new kinds and keys). |
| `GET /settings/pipelines`, project variant | Full `live: true`; the shipped Full list is the new one. |
| `PUT /settings/pipelines/:lane`, project variant, `POST /settings/pipelines/validate` | the new problem codes in `error.problems` / `problems`; `critic_same_family` is a 400 / a problem when two model families are connected (families come from the drivers' declared models) and a warning otherwise. |
| `PUT /settings/company`, `PUT /settings/projects/:slug` | `doc.director.sign_off.max_tier` is `none|A|B`; `C` -> 400 `invalid_request`; a project value above the company's -> 400 `invalid_request` with the reason. |

### Query keys and live updates

`tracked-storage.ts` announces `['ticket-pipeline', ticketId]` **and** `['ticket', ticketId]` (project slug stream) after a
commit that wrote a pipeline snapshot (`insert`, `replace`, `appendRouted`), a stage row (`start`, `finish`) or a stage
artifact (`add`). A finished row is resolved to its ticket by id before the commit. Escalation writes announce `['card', id]`,
`['inbox', slug]`, `['ticket', id]` as before. The strip should refetch on `['ticket-pipeline', id]`. Acting mutations should
also invalidate `['ticket-pipeline', id]` (the web's side).

### Behaviour the web should word

- **Rows and statuses.** The Director check is a row with kind `director`: `running` while the step runs; `passed`
  (with `check`, `unplanned`); `waiting` when it holds the ticket for the owner (blocking findings, or scope drift);
  `skipped` for a ticket with no plan ("no plan to check against"); `error` between retries. A held row the owner overruled
  reads `passed` with `override`. The sign-off stage is a `director` row `passed` with `signed_by:'director'` and the reason in
  `summary`, or a `human` row `waiting` while the owner signs (then `passed` with `signed_by:'owner'`). Merge still reads
  passed only when the ticket is done.
- **Findings route.** A reviewer's blocking findings send work back twice (`rework`), then **hold**: the ticket is
  `waiting_human` with `parked_from: verifying`, one `decision` item `findings_hold`. The critic and the Director check hold
  at once. A failed G1 or script gate never holds: it reworks, then the `rework_cap` failure (Retry / Re-plan / Cancel). A
  script gate set to hold parks as a plain failure. `rework` from a hold sends the ticket back without spending a rework; the
  comment and the held findings reach the Worker.
- **Scope drift.** `out_of_plan` with unplanned files raises `decision/scope_drift` with `unplanned`; `continue` (reason
  required) proceeds on the record, `replan` sends the card back to grilling, `cancel`.
- **Who signs.** The Director signs tier A and B only when the sign-off stage is `director_or_owner`, the tier of the real diff
  is within `director.sign_off.max_tier`, every check passed outright, the Director check passed with every criterion
  confirmed and no owner override stands. Otherwise one `sign_off` item (cause `director_declined`, `director_note` says why;
  `tier_c` for tier C; `owner_stage` for a plain human stage; `tier_b` for Express/Standard tier B) waits for the owner. Tier B
  signed by the Director ends `done` with the card note "Signed off by the Director (tier B): ...".
- **Parallel writers.** Writer-group members appear as `members` of a group chip (`scope` on each). With the default
  per-project limit of 1 they run one after another; reviewer and critic too.
- **Errors.** A Director check that errors is retried by its error family and then parks the ticket with a failure item
  (Retry runs the check again); it never passes and the Director never signs over it.

### Deviations from the brief

1. **Act routes keep `400 invalid_body`** (S4a's code, pinned by existing tests), not `invalid_request`; the settings routes use `invalid_request`.
2. **`review-rework.test.ts`:** beyond the third step the brief names, the "hold at once" case now asserts a `decision` item instead of a `failure` one: the contract raises `findings_hold` for every hold, so the old assertion could not stay. Reworks 1 and 2 are byte-identical; the golden fixture, `express-parity`, `standard-pipeline` and `pipeline-stages` tests are untouched.
3. **Script gates:** `on_blocking:'hold'` on a script gate keeps S5b's behaviour (park with a plain failure, Retry runs it again) instead of becoming a decision, because a gate never offers Merge anyway (`blockingRoute` has no `hold` for a gate).
4. **`TicketCheckOutput` and `Finding` live in their own files** (`schemas/ticket-check.ts`, `schemas/finding.ts`), not in `director-steps.ts` / `stage-run.ts`: `stage-run` needs the first and the first needs `Finding`, which would be an import cycle. Both are exported from `@forge/core`.
5. **`raiseDecisionTx` / `raiseSignOffTx` live in `tick/escalation-finished.ts`** (and the sign-off facts in `tick/sign-off-raise.ts`), not `escalation-raise.ts`: the raise has to park through `parkVerifyingTx`, which imports `escalation-raise`. `overrideTx` is in `tick/escalation-override.ts`; `reworkTx` stays in `escalation-effects.ts` and also covers a held ticket.
6. **Extra optional fields:** `StageOutcome.attempts` (retry bound of the Director check) and `StageView.check` / `StageView.unplanned` (the web's checklist needs them on the strip).
7. **An `unclear` criterion** keeps the Director from signing (the check still passes; it is a medium finding), in line with "fail closed"; the brief only says "passed with no override".
8. **Director-signed tier A** leaves no card note (the sign-off row says who signed); only tier B writes the note, as the brief says.
9. **`unplannedFiles`** returns `[]` when the plan entry lists no files (no claim about scope); a deleted file that matches the plan is not unplanned.
10. **Wake encoding:** the member of a group rides in the wake key (`...:stage#member:cycle:runs` for stage wakes, `...~member` for rework wakes); a retry after a crash reads the member from the crashed run's stage row. No wake-table change.
11. **`families_available` is `[]` for a started ticket's snapshot check** (the critic-family rule is a save-time rule: a ticket never parks because a second harness was connected later). The pipeline save door and `validate` pass the real set.
12. **Sign-off ceiling:** a project override above the company's is refused at `PUT` (400); when a later company change makes an already stored project value too high, the merged value is clamped to the company's instead of making the project unservable.
13. **Existing tests adapted** because Full is live: the eight scenario files that held a Full ticket now stub `LIVE_LANES` (`vi.mock('#/domain/live-lanes.js')`) to still exercise the hold path kept for a lane without a runner; `lane-hold-release.test.ts` now expects a Full hold to be released; `pipeline-groups-routing.test.ts` expects the reviewer and critic one tick apart; the core cursor fixture `full` is the older human-stage list and `fullLane` is the shipped one.
14. **Tracked storage** announces `['ticket-pipeline', id]` and `['ticket', id]` for a stage write; a late blocking result of a check on a held ticket is recorded `waiting` (covered by the owner's decision) rather than `failed`.
15. **Notes:** `escalation-director.ts` skips the new kinds only by their owner-stage start (they are raised with `escalated_at` set) plus an explicit owner-only guard in `lookAt`; the Director-check job is in memory (`EngineState.checkJobs`) and counted by `gateJobsInFlight()`.
