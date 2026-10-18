# S5d — Director per-ticket pipelines, project proposals, scorecards and agent fallback (builder brief)

Status: **approved per d-0160 / d-0164 (autonomous run)** · 2026-10-18
Plan: `docs/briefs/card-first-flow-plan.md` §S5d, Invariants, Risks. Decisions: d-0151 (lane pipelines; the Director
adjusts a per-ticket copy with reasons, never the project pipeline, may propose in the Inbox), d-0149 (assignment from the
effective roster with scorecards; hard limits: every writer checked, roles bounded, Tier C owner, one merge door; routed
agents the Director cannot remove), d-0077 (the Director builds the ticket's pipeline, lighter allowed, built pipeline and
reasons recorded and shown; amended by d-0149 / d-0151 hard limits), d-0081 (scorecards per agent and pipeline shape,
read by the Director, shown to the owner, no auto-tuning), d-0080 (retry → fallback list → Director substitute → pause,
refinable in the UI), d-0153 (Runs on with an ordered fallback list), d-0073 (critic family, also for fallback and
substitute), d-0069 (routing only adds), d-0152 (list editor, no loops), d-0135 (no dead ends, one item three places),
d-0133 / d-0141 item 6 (approval floor only makes approval stricter), d-0085 / d-0090 (config rows, UI only), d-0143
(cost warns), d-0075 (replay and canary, see Q10), d-0019 (propose-then-gate, never self-apply).
Rejected approaches checked (r-0001 … r-0007): none is proposed here. r-0003 (one long-lived LLM orchestrator) is why
every Director act below is a finite, schema-checked step behind an engine door.
**Builds on S5c** (`docs/briefs/s5c-full-lane.md`, "S5c-A contract (as built)"): `TicketPipeline`, `stageCursor`,
`ensureSnapshotTx`, `ticketPipelineView`, `blockingRoute`, `decision` / `sign_off` escalations, migration 0026.
S5d starts only after **S5c-B is committed**.

Two builders, parallel, against the **contract** below; neither edits the other's files. Both read
`.claude/rules/code.md` first.
- **S5d-A backend:** core, tools, db, engine, drivers, server.
- **S5d-B web:** `apps/web` and `docs/design/ui-screen-map.md`.

## What exists today

| Concern | Where | Gap against the decisions |
|---|---|---|
| Ticket copy of the pipeline | `engine/src/tick/stage-snapshot.ts` `ensureSnapshotTx` → `build()`: effective lane list + `routeStages()`; `TicketPipeline` (`core/src/schemas/stage-run.ts`) stores `definition`, `roles`, `hash`, `config_version`, `routed` | no Director changes, no reasons, no base hash to compare tickets |
| Snapshot table | `ticket_pipelines` (0025): `pipeline_json` holds `{definition, roles}`, `routed_json`; repo `adapters/sqlite/ticket-pipelines-repository.ts` (`get/insert/appendRouted/replace`) | no column for adjustments; no batch read for stats |
| Plan entry | `core/src/schemas/plan.ts` `PlanTicket { key,title,body,acceptance,priority,depends_on,lane,size,files }`; `WritePlanOutput.tickets` (`schemas/director-steps.ts`) | the plan cannot carry a ticket's pipeline or agents (d-0149 wants them approved with the plan) |
| Planning input | `engine/src/tick/planning-input.ts` `buildStepInput` (playbook, house rules, repo rules) | `write_plan` never sees the roster, the lane pipelines or scorecards |
| Approval floor | `core/src/domain/approval-floor.ts` `checkFloor` (Tier C globs, rejected hits, overlaps, moved HEAD) | nothing about a plan that makes a pipeline lighter |
| Pipeline rules | `core/src/domain/pipeline-rules.ts` `pipelineProblems(def, {roster, lane, families_available})`, `pipeline-order-rules.ts`, `pipeline-stage-rules.ts` | reusable as-is for an adjusted copy |
| Ticket strip | `core/src/domain/ticket-pipeline-view.ts` `ticketPipelineView(snapshot, records, artifacts, ticket, roster)`; `TicketPipelineView.routed` | nothing says "changed by the Director", removed stages vanish |
| Project pipeline writes | `apps/server/src/services/pipeline-store.ts` `createPipelineStore().saveProject(slug, lane, body)` (CAS, rules first, one `ConfigSource.append`) | the door a proposal's acceptance must use |
| Non-ticket owner items | `apps/server/src/services/inbox-source.ts` derives `harness_compat`, `tool_approval`, `memory_proposal` from source rows; `INBOX_KINDS` in `core/src/schemas/inbox.ts` | no pipeline proposal kind |
| Escalations | `interactions.ticket_id NOT NULL` (0001 L134); Director-first sweep `tick/escalation-director.ts`; recover step `tick/escalation-recover-step.ts` | ticket-scoped: parks and blocks a ticket, shows Needs you on the card |
| Fallback (harness) | `domain/harness-choice.ts` `chooseHarness(primary, fallbacks, paused, installed, now)`; used by `tick/schedule.ts` L136–148, `tick/quota.ts` L95–111, `tick/dispatch-check.ts` L122–132; `tick/run-agent.ts` `modelFor()` picks the fallback entry's model by harness | only quota / paused harness; a same-harness model entry is never chosen (`id !== primary`); S5a Q4 deferred rate-limit model swaps and the Director substitute to S5d |
| Rate limit | `domain/failure-policy.ts` `decideFailure`: backoff up to `retry.rate_limit.max_attempts`, then park; `tick/outcome.ts` L138–158 | no fallback after the retries |
| Model unavailable | `core/src/schemas/errors.ts` `ErrorFamily` has no such family; `drivers/src/domain/failure-classify.ts` maps it to `unknown` (crash retries) | cannot trigger the fallback |
| What ran | `Run` (`schemas/run.ts`) has `harness`, `agent_id`, `agent_hash`; no `model` | "record which one actually ran" (d-0080) is impossible |
| Stats | `core/src/domain/project-stats.ts`, `stats-window.ts` (`rateStat`, `durationStats`), `schemas/project-stats.ts` (`RateStat`, `DurationStats`), `StatsRange` | nothing per agent or per pipeline shape; no finding verdicts |

## Orchestrator calls (binding)

- **One door for a ticket's copy: `adjustTicketPipelineTx`** (engine). Every change to `ticket_pipelines.definition` after
  the first snapshot (Director ops, substitution, lane re-snapshot) goes through it. It applies ops with the pure
  `applyAdjustments()`, runs `pipelineProblems()` on the result, and stores the definition, the hash and the full
  adjustment log in one write. It never touches a stage that is running or already passed in the current cycle.
- **What the Director may change** (d-0149 / d-0151 hard limits; S5b Q3; Q1). Ops are `add`, `remove`, `swap`, `move`.
  - **Locked:** `merge`, the `g1` gate, every script gate, `human` and `sign_off` stages, and routed stages
    (`route-*`). The rule in one line: the Director may change what an LLM agent does, never a deterministic check, a
    person's step or an owner rule.
  - **Free within the rules:** agent stages (writers and checks), groups, `director_check`. The result must pass
    `pipelineProblems()` (writers before checks, G1 once after the last writer, no self-review, roles, groups).
  - Ops never change `ticket.lane` or the tier; sign-off and the tier C rule are untouched (`transition()` still refuses
    a `director` signer on tier C).
- **When the Director adjusts.**
  1. **In the plan** (the main path, d-0149): `write_plan` sees the roster, the three lane pipelines, the locks and the
     scorecards, and may set `PlanTicket.pipeline = { ops }`, each op with a reason. The engine validates the ops against
     the ticket's lane at write time; an invalid op is dropped and listed under the plan's risks ("Pipeline change
     dropped for t2: …"). The Plan tab shows the change, so it is approved with the plan.
  2. **At first dispatch** `ensureSnapshotTx` applies the plan's ops to the lane list as it is now. An op that no longer
     holds (the owner edited the lane since) is recorded `dropped` with the problem; if the combined result fails the
     rules, every op is dropped and the base list runs (fail closed means the owner's list, never a broken one). A card
     `note` says what changed or was dropped. A snapshot never parks because of Director ops.
  3. **At run time** only the fallback substitute (below) adjusts, by a `swap`. Other runtime changes go through
     re-planning (d-0151, Q3).
  4. **Lane raised later:** the heavier lane re-snapshots (existing) and re-applies the recorded `plan` and `fallback`
     ops through the same door; ops whose anchor is gone are recorded `dropped`.
- **Lighter pipelines need the owner** (Q2). A plan whose ops include a `remove` adds the floor reason "t2 runs a
  lighter pipeline than its lane (removes reviewer)". `swap` keeps the role, so it is not "lighter". Per d-0141 item 6 the floor only makes approval stricter: the Director may still plan it; the
  owner approves it.
- **"Add to project pipeline" proposals are deterministic and owner-only.** No LLM call decides to propose. At snapshot,
  each applied `plan` op gets a key (`adjustmentKey(lane, op)`, e.g. `add:security-reviewer@after:g1`,
  `remove:review`, `swap:implement:frontend-writer`). When the same key was applied on at least `propose_after` tickets
  (default 3) from at least `propose_min_cards` cards (default 2) in the last `propose_window_days` (default 30), all on
  the same lane and the same `base_hash` (the lane list the ops were applied to), the engine inserts one
  `pipeline_proposals` row: the op, the proposed full lane list (the op applied to the project's current effective
  list, which must pass `pipelineProblems()`, else no proposal), and up to three quoted reasons with their ticket ids.
  Fallback substitutions never count (they are about availability, not shape).
  - **Surface: own table + Inbox kind + Pipelines banner, not an escalation.** An `Interaction` needs a ticket
    (`ticket_id NOT NULL`), parks it, runs the Director-first sweep and turns the card to Needs you (d-0135); a project
    proposal blocks nothing and belongs to no ticket. The Inbox already derives project items from source rows
    (`memory_proposal`, `tool_approval`), so `pipeline_proposal` is one more derived kind. A memory proposal was also
    rejected: approving it changes no config, so a second step would be needed.
  - **Accept** calls `pipelineStore.saveProject(slug, lane, { pipeline: proposed, expected_version, reason })` (the one
    config door: rules, CAS, author `owner`, reason "Accepted Director proposal #12: …"). If the lane's current
    effective hash is no longer `base_hash`, the proposal is marked `stale` (409) and nothing is written. **Reject**
    needs a reason and suppresses the same `(project, lane, key, base_hash)` forever; a changed lane list starts a new
    count. The Director never writes `ConfigSource`.
- **Scorecards are computed on read, never stored, never applied** (d-0081). One pure core function over tickets, their
  snapshots, stage rows, runs and finding marks inside a window. The Director reads a compact form in `write_plan` and
  `pick_substitute`; the owner reads the full form on Agents and Pipelines. Nothing changes a default.
- **Finding verdicts** (d-0081's open point, Q6): the owner's mark per finding ("Real" / "False alarm") is authoritative;
  without a mark a finding is `acted_on` (its cycle ended in a rework and the same stage passed in the next cycle),
  `overruled` (the row carries an owner `merge_anyway` override) or `unjudged`. A later-bug link waits for issue sync.
- **Fallback path** (d-0080), per stage attempt, in order:
  1. **Retry the same agent**: unchanged `decideFailure` backoff (`rate_limit`, `crash`, `stall`, `unknown`).
  2. **Fallback list**: after `rate_limit` retries run out, or at once on the new family `model_unavailable`, the engine
     moves to the next usable entry of `[primary, ...runs_on.fallbacks]` (`nextFallback()`): not tried in this attempt,
     harness installed and not paused, and for a critic not the Worker's family when two families are connected
     (d-0073; one family: allowed, `same_family` label). Same-harness model entries now count. The retry starts now,
     with the slot carried on the stage row (`StageOutcome.fallback`). `quota` keeps today's path (harness parked,
     `chooseHarness`, wait for the reset; Q7).
  3. **Director substitute**: when the list is exhausted and the agent's `runs_on.on_exhausted` is not `pause`, the
     ticket parks with failure cause `no_agent_available` in the Director stage. The Director-first sweep runs the
     tool-less `pick_substitute` step over a **pre-filtered** candidate list (same role, usable, harness ready, writer
     scope within the original's, not the agent of a writer it would check, critic family rule) with their scorecards.
     A valid pick becomes a `swap` op (`cause:'fallback'`, the reason recorded) through `adjustTicketPipelineTx`, the
     escalation settles with the engine-only action `substitute` (by `director`), and `retryTx` re-dispatches. A pick
     outside the list, `pause`, a step error or `director_first: false` hands the item to the owner.
  4. **Pause**: the owner item `failure/no_agent_available` lists every try (`attempts`), offers Retry (restarts the
     chain from the primary), Re-plan, Cancel. Inbox and desktop notification as every owner item (d-0079).
  - Every run records `model` and `fallback_slot` (0 = primary, `-1` = substitute) so the strip and scorecards say what
    actually ran.
- **Doors unchanged.** Ticket status only via `transition()` (no new status or edge); merge only in `verify-merge.ts`;
  tools only via `admit()` (a substitute runs under its own definition's grant, `services/agent-grant-for-run.ts`);
  project pipelines only via `pipeline-store` → `ConfigSource.append`; ticket copies only via `adjustTicketPipelineTx`.
- **Express parity is a hard rule.** `engine/__tests__/tick/express-parity.test.ts` and its golden `RunRequest` are
  never edited. An Express ticket with no plan ops writes the same rows plus the new snapshot fields (`base_hash` =
  `hash`, `adjustments: []`), which the test's `toMatchObject` tolerates; run rows gain `model`, `fallback_slot: 0`.

## Contract (shared, binding)

### Core schemas (S5d-A owns; S5d-B imports from `@forge/core`)

```ts
// schemas/pipeline-adjust.ts (new)
AdjustReason = z.string().trim().min(10).max(500)
PipelineAdjustOp = discriminatedUnion('op', [
  { op:'add', stage: AgentStage | GroupStage, after: StageId, reason },   // stage.id unique; Director ids 'dir-<slug>'
  { op:'remove', stage_id: StageId, reason },
  { op:'swap', stage_id: StageId, member_id?: StageId, agent: AgentId, reason },  // same role only
  { op:'move', stage_id: StageId, after: StageId, reason },
])
PlanPipeline = { ops: PipelineAdjustOp[] (1..6) }
ADJUST_PROBLEM_CODES = ['locked_stage','adjust_unknown_stage','adjust_unknown_agent','adjust_role_change',
  'adjust_scope_wider','adjust_duplicate_id','adjust_rules' /* result fails pipelineProblems; problems attached */]
AdjustProblem = { code, stage_id?, message, problems?: PipelineProblem[] }
PipelineAdjustment = { seq: int, op: PipelineAdjustOp, by:'director', cause:'plan'|'fallback',
  key: string (≤120), status:'applied'|'dropped', problem?: string (≤500), plan_version?: int, at: datetime }
// schemas/plan.ts
PlanTicket += { pipeline?: PlanPipeline }          // optional: every stored plan still parses
// schemas/stage-run.ts
TicketPipeline += { base_hash: sha256 /* lane list + routing, before Director ops */, adjustments: PipelineAdjustment[] (≤40) }
StageOutcome += { fallback?: { slot: int (-1..5), tried: { slot, harness, model?, family }[] (≤8) } }
StageView += { changed?: { by:'director', op:'add'|'swap'|'move', cause:'plan'|'fallback', reason },
               ran_on?: { harness, model?, slot: int } }
TicketPipelineView += { adjustments: PipelineAdjustment[], removed: { id, label, reason }[], base_hash }
// schemas/run.ts
Run += { model?: string (≤120), fallback_slot?: int (-1..5) }
// schemas/errors.ts
ErrorFamily += 'model_unavailable'          // drivers classify; never retried on the same model
// schemas/agent.ts
RunsOn += { on_exhausted?: 'director_substitute'|'pause' }   // absent = director_substitute; NO default written,
                                                             // so existing agent hashes do not change
// schemas/escalation.ts
FAILURE_CAUSES += 'no_agent_available'
ESCALATION_ACTIONS += 'substitute'           // engine/Director only, never offered as a button (like pipeline_ready)
// schemas/pipeline-proposal.ts (new)
PROPOSAL_STATUSES = ['pending','accepted','rejected','stale']
PipelineProposal = { id: int, project: string, lane: Lane, key, base_hash, op: PipelineAdjustOp,
  proposed: PipelineDefinition, evidence: { ticket_id, card_id?, reason }[] (1..3), count: int,
  status, created_at, decided_at?, decided_reason? (≤500), config_version?: ConfigVersionRef }
PipelineProposalView = PipelineProposal & { current: PipelineDefinition, stale: boolean }
// schemas/scorecard.ts (new)
SCORECARD_SLICES = ['all','type','tier','lane']
ScorecardRow = { by: slice, value?: string, tickets: int, runs: int, insufficient: boolean /* tickets < 5 */,
  clean_rate: RateStat | null      // writer/tester/shape: done with 0 reworks ÷ finished tickets it took part in
  pass_rate: RateStat | null       // check agent: rows passed first time ÷ finished rows
  reworks_per_ticket: number | null, holds: int, overrides: int,
  cost: { total_usd: number, per_ticket_usd: number | null, coverage: RateStat },
  duration: DurationStats, fallback_runs: int, substituted: int,
  findings?: { by_severity: Record<Severity,int>, real: int, false_alarm: int, acted_on: int, overruled: int, unjudged: int } }
AgentScorecard = { agent_id, name, role, rows: ScorecardRow[] }
ShapeScorecard = { hash, lane, label /* "Standard", "Standard + security-reviewer" */, stages: string[],
  director_changed: boolean, rows: ScorecardRow[] }
ScorecardReply = { range: '30d'|'90d', agents: AgentScorecard[], shapes: ShapeScorecard[], computed_at }
FindingMark = { stage_run_id: int, finding_index: int, verdict: 'real'|'false_alarm', marked_at }
// schemas/inbox.ts
INBOX_KINDS += 'pipeline_proposal'
// schemas/director-config.ts
DirectorConfig.pipelines = { adjust: boolean /* true */, propose_after: int 2..10 /* 3 */,
  propose_min_cards: int 1..5 /* 2 */, propose_window_days: int 7..90 /* 30 */ }
// schemas/director-steps.ts
PickSubstituteOutput = { decision:'substitute'|'pause', agent?: AgentId, reason (10..500) }  // refine: substitute ⇒ agent
// schemas/steps.ts
STEP_NAMES += 'pick_substitute'; models.director.pick_substitute = 'sonnet'; step_timeouts_ms.pick_substitute = 120_000
```

**Pure domain** (`core/domain/`, each ≤300 lines; property-tested where marked):
- `pipeline-adjust.ts` (property): `applyAdjustments(base, ops, ctx) → { definition, applied: PipelineAdjustment[],
  problems: AdjustProblem[] }` and `adjustProblems(op, def, ctx)`. `ctx` = `PipelineRuleContext` plus `routed` ids and
  `locked(stage)`. `scopeWithin(inner, outer)` is conservative (identical glob, or inner's literal prefix starts with an
  outer `…/**` prefix; `**` is within only `**`).
- `adjustment-key.ts` (property): `adjustmentKey(lane, op)`; equal ops on equal anchors give equal keys; reasons never
  enter the key.
- `proposal-trigger.ts` (property): `shouldPropose({ key, lane, base_hash, history, settings, suppressed, now })`
  where `history` is `{ ticket_id, card_id?, at, key, base_hash, lane }[]`.
- `agent-fallback.ts` (property): `fallbackChain(runsOn, resolveHarness) → { slot, harness, model }[]` and
  `nextFallback({ chain, tried, paused, installed, now, familyGuard }) → slot | null`.
- `substitute-candidates.ts`: `substituteCandidates({ stage, failedAgent, roster, snapshot, ready, families })`.
- `scorecards.ts` + `scorecard-findings.ts`: `computeScorecards(input: ScorecardInput) → ScorecardReply` (input type in
  `types/scorecard-input.types.ts`); reuses `rateStat`, `durationStats`, `statsWindow`. A figure with no data is `null`,
  a run with no cost adds to `coverage`, never a guessed price (as `cost-rollup.ts`).
- `ticket-pipeline-view.ts`: fills `changed`, `ran_on`, `removed`, `adjustments`.
- `approval-floor.ts`: `ApprovalFloorInput` gains `lighter: { key, removed: string[] }[]`; one reason per entry.
- `escalation-actions.ts`: `no_agent_available` → `['retry','replan','cancel']` (`replan` dropped without a card).

**Ports** (types only): `types/ports/stage-storage.types.ts` — `TicketPipelineRepository.adjust(ticketId, { definition,
hash, adjustments, at })`, `listByTickets(ids ≤500)`; `StageRunRepository.listByTickets(ids ≤500)`. New
`types/ports/proposal-storage.types.ts` — `PipelineProposalRepository { insert (→ id | 'exists'), get, list(project,
status?), decide(id, { status, reason?, config_version?, at }) }` and `FindingMarkRepository { set(mark), clear(stageRunId,
index), listByStageRuns(ids) }`; both join `StorageTx`. `types/ports/director-llm.types.ts` — `PickSubstituteInput`
(`{ stage, failed: { agent_id, role, tried }, candidates: { id, name, role, description, write_scope, family, card: ScorecardRow | null }[], playbook, house_rules }`).

### DB — migration **`0027-director-pipelines.ts`** (0026 is the highest; verify before writing)

```sql
ALTER TABLE ticket_pipelines ADD COLUMN base_hash TEXT;
UPDATE ticket_pipelines SET base_hash = pipeline_hash;
ALTER TABLE ticket_pipelines ADD COLUMN adjusted_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE runs ADD COLUMN model TEXT;
ALTER TABLE runs ADD COLUMN fallback_slot INTEGER;
CREATE TABLE pipeline_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('express','standard','full')),
  key TEXT NOT NULL, base_hash TEXT NOT NULL, op_json TEXT NOT NULL, proposed_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL, count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','stale')),
  created_at TEXT NOT NULL, decided_at TEXT, decided_reason TEXT, config_version TEXT);
CREATE UNIQUE INDEX idx_pipeline_proposals_key ON pipeline_proposals (project, lane, key, base_hash);
CREATE TABLE finding_marks (
  stage_run_id INTEGER NOT NULL REFERENCES stage_runs (id), finding_index INTEGER NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets (id),
  verdict TEXT NOT NULL CHECK (verdict IN ('real','false_alarm')), marked_at TEXT NOT NULL,
  PRIMARY KEY (stage_run_id, finding_index));
```

The CHECK lists are pinned equal to core by a test (as 0025/0026). The unique key covers every status, so a rejected or
accepted key is never proposed again for the same base. `project-purge.ts` (both adapters) deletes `finding_marks` before
`stage_runs` and `pipeline_proposals WHERE project = ?` before `projects`. Seeded-0026 test: every row kept, `base_hash`
backfilled. Memory adapter mirrors all of it; contract tests on both adapters for every new method.

### Engine API (S5d-A)

- `tick/pipeline-adjust.ts`: `adjustTicketPipelineTx(tx, ctx, ticket, ops, cause, planVersion?)` → the stored
  `TicketPipeline`; refuses a running or passed stage of the current cycle (`stageCursor`); writes a card `note`.
- `tick/stage-snapshot.ts`: `build()` sets `base_hash`; `ensureSnapshotTx` applies the plan entry's `pipeline.ops` via
  the door, re-applies recorded ops on a lane raise, then calls `maybeProposeTx`.
- `tick/pipeline-proposals.ts`: `maybeProposeTx(tx, ctx, ticket, snapshot)` (history from `ticketPipelines.listByTickets`
  over `tickets.listByProject` in the window; `shouldPropose`; insert).
- `tick/planning-input.ts` / `planning-plan.ts`: `write_plan` input gains `pipelines: { lanes, roster, locks, scorecards }`
  (scorecards compact: `all` and this card's ticket types, 90d); `composePlan` validates each ticket's ops
  (`applyAdjustments` against the lane's effective list) and drops invalid ones into `risks`. `planning-floor.ts` passes
  `lighter`. Playbook `adjust-pipeline` v1 in `domain/builtin-director.ts` (Director settings → playbooks, editable).
- `tick/agent-fallback.ts`: `nextSlotTx(tx, ctx, ticket, run, family)`; called from `tick/outcome.ts` where
  `decideFailure` returns park for `rate_limit`, and at once for `model_unavailable`; writes `StageOutcome.fallback`,
  requests a `retry` wake now. `tick/run-agent.ts` `modelFor` and `tick/schedule.ts` read the slot from the stage row
  (slot beats harness matching); `dispatch-run.ts` records `model` and `fallback_slot` on the run.
- `tick/escalation-substitute-step.ts`: `lookAtNoAgent(ctx, row)`; `escalation-director.ts` routes cause
  `no_agent_available` there instead of `lookAtFailure`; Director spend counts on the card (warning only).
- `tick/scorecards.ts`: `loadScorecardInput(tx, project, range)` (batched reads, cap 2000 tickets) for the planning
  input and the substitute step. `domain/failure-policy.ts`: `model_unavailable` is never retried on the same model.

### HTTP (S5d-A implements, S5d-B consumes)

Envelope as S5a–S5c: `{ error: { code, message, issues?, ...details } }`; body failures 400 `invalid_request`. Writes
are authored `owner` and return the fresh views.

| Method + path | Body | 200 response | Errors |
|---|---|---|---|
| `GET /tickets/:id/pipeline` | none | `TicketPipelineView` + `adjustments`, `removed`, `base_hash`, `StageView.changed` / `ran_on` | 404 `ticket_not_found` |
| `PUT /tickets/:id/findings/:stageRunId/:index/mark` | `{ verdict: 'real'\|'false_alarm'\|null }` (null clears) | `{ pipeline: TicketPipelineView }` | 404 `ticket_not_found`, `finding_not_found` (row not this ticket's, no review, index out of range) |
| `GET /settings/projects/:slug/pipeline-proposals?status=pending\|all` | none | `{ proposals: PipelineProposalView[] }` | 404 `project_not_found` |
| `POST /settings/projects/:slug/pipeline-proposals/:id/accept` | `{ expected_version, reason? (≤500) }` | `{ proposal, pipelines: ProjectPipelinesReply }` | 404 `proposal_not_found`; 409 `not_pending`, `proposal_stale`, `version_conflict`; 400 `pipeline_invalid` (+`problems`, roster changed) |
| `POST /settings/projects/:slug/pipeline-proposals/:id/reject` | `{ reason (3..500) }` | `{ proposal }` | 404; 409 `not_pending` |
| `GET /projects/:slug/scorecards?range=30d\|90d&agent=<id>?` | none | `ScorecardReply` (filtered to one agent when `agent` is set) | 400 `invalid_request`; 404 `project_not_found`, `agent_not_found` |
| `GET /projects/:slug/inbox…` | unchanged | items of kind `pipeline_proposal` (id `pipeline_proposal:<id>`, `needs_action: true`, `updated_at` = `created_at`) | unchanged |
| `GET/PUT /settings/company`, project director override | `director.pipelines` | fresh settings | 400 `invalid_request` |
| agent create / edit (company and project) | `runs_on.on_exhausted` | unchanged | unchanged |
| `GET /cards/:id/escalations`, `POST /interactions/:id/act` | `no_agent_available` items; `retry` / `replan` / `cancel` | unchanged | `substitute` from an owner → 409 `action_not_offered` |

**Live updates.** `services/tracked-storage.ts` publishes `['ticket-pipeline', id]` and `['ticket', id]` on
`ticketPipelines.adjust` and finding marks, and `['pipeline-proposals', slug]` plus `['inbox', slug]` on proposal insert
and decide. Accept also invalidates `['pipelines','project',slug]` and `['project-settings',slug]`. Scorecards have no
live key: `['scorecards', slug, range]` refetches on focus and after a mark.

## S5d-A backend

- **core**: everything in Contract; `index.ts` re-exports; README (adjustments, locks, proposals, scorecards, fallback).
- **tools**: no catalogue change (`pick_substitute` is tool-less). README unchanged unless grant notes move.
- **db**: 0027, registry, repos (sqlite + memory), purge order, contract tests.
- **engine**: files in Engine API; README (the four-step fallback table, proposal rule, the lock rule).
- **drivers**: `domain/failure-classify.ts` maps "model not found / not available / unknown model / invalid model" to
  `model_unavailable` (fail closed: unmatched text stays `unknown`); claude `director-step-prompts.ts` renders
  `pick_substitute` and the `write_plan` pipelines block (fenced as data). README.
- **server**: `routes/pipeline-proposals.ts`, `routes/scorecards.ts`, the mark route in `routes/ticket-pipeline.ts`;
  `services/pipeline-store.ts` gains `acceptProposal` / `rejectProposal` (the only writers of decided proposals);
  `services/scorecard-source.ts`; `services/inbox-source.ts`; `services/ticket-pipeline-view.ts`; tracked storage;
  director settings schema. Tests for every row and listed error.
- `.forge/config/forge.yaml` adds `models.director.pick_substitute: sonnet` (keep CRLF; the yaml equality test pins it).
- Append `## S5d-A contract (as built)` to this brief when done.

### Done when (S5d-A)

1. **Express parity**: `express-parity.test.ts` unchanged and green; golden fixture never edited.
2. **Standard / Full parity**: `standard-pipeline.test.ts`, `pipeline-stages.test.ts`, `full-pipeline.test.ts`,
   `review-rework.test.ts` unchanged and green (no plan ops). The one intended change: the rate-limit exhaustion test
   now ends in `failure/no_agent_available` (Director stage first) instead of the old park reason; other families as
   before.
3. **Plan ops applied** (`engine/__tests__/tick/director-adjust.test.ts`): a plan entry adding `security-reviewer` after
   `g1` on Standard → snapshot has the stage, `adjustments[0].status = 'applied'`, `base_hash ≠ hash`, card note; the strip
   shows `changed { by:'director', cause:'plan' }`. Removing `g1`, `merge`, a script gate, `sign-off` or a routed stage
   → dropped with `locked_stage`. The owner edits the lane between approval and dispatch so the anchor is gone → op
   `dropped`, base list runs, ticket not parked.
4. **Plan step**: `write_plan` input contains roster, lanes, locks and scorecards; an invalid op is dropped into `risks`;
   a `remove` op adds the floor reason and the plan waits for the owner even with approval mode `director_or_user`.
5. **Lane raise** re-applies ops through the door; an op without its anchor is `dropped`.
6. **Proposal** (`pipeline-proposal.test.ts`): the same op on 3 tickets from 2 cards in 30 days → one pending proposal
   with three evidence reasons; a 4th ticket adds none; 3 tickets of one card → none; accept → project lane equals
   `proposed`, config version bumped, author `owner`; the next ticket's `base_hash` is the new list and the count
   restarts; accept after an owner edit → 409 `proposal_stale`, status `stale`, nothing written; reject → never re-proposed
   for that base.
7. **Fallback list** (`agent-fallback.test.ts`): `rate_limit` past `max_attempts` → next run on slot 1 with slot 1's
   model (same harness allowed); `model_unavailable` → slot 1 at once; run rows carry `model` and `fallback_slot`; a
   paused harness slot is skipped; a critic never falls back onto the Worker's family when two families are connected.
   Quota keeps today's behaviour (existing quota tests unchanged).
8. **Substitute**: list exhausted → `no_agent_available` in the Director stage → `pick_substitute` picks a listed
   candidate → `swap` with `cause:'fallback'`, escalation settled `substitute` by `director`, retry run on the substitute.
   A pick not in the list, `pause`, a step error, `on_exhausted:'pause'` or `director_first:false` → owner item with
   Retry / Re-plan / Cancel; Retry restarts at slot 0.
9. **Scorecards** (`server/__tests__/routes/scorecards.test.ts` over seeded rows): clean rate, pass rate, reworks, cost
   coverage, findings counts; an owner mark beats the derived verdict; a `merge_anyway` row counts `overruled`; under 5
   tickets reads `insufficient: true`; filter by `agent`.
10. **Inbox**: a pending proposal appears once as `pipeline_proposal`; accepted / rejected disappear.
11. **Restart** during a substitute step or between a fallback park and its retry: no duplicate rows, no second swap.

## S5d-B web (invoke `hallmark` first; `nielsen-heuristics` pass on each screen before reporting)

- **Ticket pipeline strip** (`routes/ticket/pipeline-strip.tsx`, `stage-chip.tsx`, `stage-detail.tsx`): a "Director"
  badge on changed chips with the reason on open; removed stages as ghost chips ("Removed by the Director: …"); a
  "Ran on fallback 2 (sonnet)" / "Substitute for implementer" line from `ran_on`; a header line "Changed by the Director
  (2 changes)" opening the adjustment log (applied and dropped). Refetches on `['ticket-pipeline', id]`.
- **Finding marks** (`routes/ticket/review-findings.tsx`): per finding "Real" / "False alarm" toggle, clearable, keyboard
  reachable, optimistic with rollback on error.
- **Plan tab** (`routes/card/plan/plan-tickets.tsx`, `plan-ticket-editor.tsx`, `plan-diff-view.tsx`): per ticket a
  pipeline line ("Standard + security-reviewer") with each op and reason; a lighter pipeline flagged "Needs your
  approval: removes reviewer". Ticket edit by the owner may remove an op (not add one).
- **Proposals**: Inbox row (`routes/inbox/inbox-row.tsx`, `components/inbox/kind-chip.tsx`, `domain/inbox-links.ts`)
  with before/after lists and Accept / Reject in place; a banner on the lane tab of Project settings → Pipelines
  (`routes/project-settings/pipelines-section.tsx`, `components/pipelines/lane-pane.tsx`) with the same diff, the three
  evidence reasons linked to tickets, Accept (optional note), Reject (reason required), and a stale state that says "The
  lane changed since; nothing was applied".
- **Scorecards**: Project settings → Agents rows show clean or pass rate, reworks, cost per ticket and `n`
  (`components/agents/agent-row.tsx`); the agent editor gains a Scorecard panel with the slice picker (all / type / tier /
  lane) and 30d / 90d; Pipelines lane pane gets a shape table (Director-changed shapes marked). `insufficient` rows read
  "Too few tickets to judge". Follow the `dataviz` skill for any chart; numbers before charts.
- **Runs on** (`components/agents/fallback-list.tsx`, `runs-on-section.tsx`): "When every fallback fails: Let the
  Director pick a substitute / Pause and tell me".
- **Escalation copy** (`domain/escalation-copy.ts`, `components/escalation/`): `no_agent_available` title "No agent could
  run this stage" with the tries list; settled `substitute` line "The Director switched to <agent>: <reason>". The web
  typecheck breaks until the copy lands; coordinate with S5d-A as before.
- **Director settings** (Forge Director page and project override): "Suggest project pipeline changes after N tickets
  from M cards in D days", and "Let the Director adjust ticket pipelines" on/off.
- Tests (web project): each strip state; mark toggle; plan line and lighter flag; proposal accept, reject (reason
  required) and stale in both places; scorecard empty, insufficient, loaded, error; Runs on option; settings fields;
  keyboard reachability. Update `ui-screen-map.md` (Ticket, Plan tab, Inbox, Project settings → Pipelines and Agents).

### Done when (S5d-B)

Every HTTP row is reachable from a control. Every new waiting state shows at least one action. Each screen has loading,
empty, error and settled states. The Nielsen checklist is filled per screen in the report.

## Rule tests

- `core/__tests__/domain/pipeline-adjust.test.ts` (property): no op sequence removes or alters `merge`, `g1`, a script
  gate, `human`, `sign_off` or a routed stage; every applied result passes `pipelineProblems`; `swap` never changes a
  role or widens a writer scope; applying the same ops to the same base twice is identical.
- `core/__tests__/domain/adjustment-key.test.ts` (property): key ignores reason and seq; differs by lane and anchor.
- `core/__tests__/domain/proposal-trigger.test.ts` (property): never below threshold, never with fewer cards than the
  minimum, never across two base hashes, never for a suppressed key, never for `cause:'fallback'`.
- `core/__tests__/domain/agent-fallback.test.ts` (property): never returns a tried slot or a paused harness; order kept;
  `null` when exhausted; family guard holds.
- `core/__tests__/domain/scorecards.test.ts`: null over zero for no data; cost coverage; mark precedence; window edges.
- `core/__tests__/domain/escalation-actions.test.ts`: `no_agent_available` has a non-empty row (d-0135).
- `core/__tests__/domain/approval-floor.test.ts`: a lighter entry always fails the floor; no ops never adds a reason.
- `engine/__tests__/tick/escalation-substitute-step.test.ts`: the engine refuses a pick outside the candidate list.

**Doors:** tickets only via `transition()`; merge only in `verify-merge.ts`; tools only via `admit()`; ticket copies only
via `adjustTicketPipelineTx`; project pipelines only via `pipeline-store` → `ConfigSource.append`; proposal decisions only
via `pipeline-store`; the Director never writes config.

## Gates (each builder, own scope)

`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; prettier `--write/--check <changed>`;
`vitest run --maxWorkers=2 <changed + new tests>` one package at a time (`--project web` for S5d-B; heavy for db, server,
gates). On a memory failure drop to `--maxWorkers=1` and defer heavy suites, naming them in the report (d-0164); never the
full suite locally (d-0119). Foreground only, each command under ~9.5 min. No commits, pushes, stashes or worktrees. LF
endings (keep CRLF where a file uses it). READMEs current. PRODUCT.md is left to the orchestrator.

## Risks

| Risk | Mitigation |
|---|---|
| Prompt injection in repo text talks the planner into a lighter pipeline | Removals fail the approval floor (owner approves); locked stages cannot be touched; the ops and reasons are on the plan, the strip and the card |
| Proposal noise (one big card repeats an op) | Threshold counts tickets from ≥2 cards; same base only; a rejection suppresses forever for that base |
| Accepting a proposal skips d-0075 replay/canary | Same as an owner edit in the editor today (validation only); named as Q10 |
| Scorecards mislead on small samples | `insufficient` under 5 tickets, shown and passed to the Director as such; no auto-tuning |
| A substitute writer writes outside the planned area | Same role only, scope within the original's (`scopeWithin`), `admit()` enforces the substitute's own scope |
| Fallback model changes who wrote the code | `model` and `fallback_slot` on every run, `ran_on` on the strip, counted in scorecards |
| Agent hash churn from the new `on_exhausted` key | Optional, no default written; absent reads as `director_substitute` |
| Scorecard read cost on large projects | 90-day window, 2000-ticket cap, batched `listByTickets`; computed per request, no cache table |
| `model_unavailable` misclassified | Narrow regex; unmatched text stays `unknown` (crash path), never a silent swap |

## Open questions for the owner (build proceeds on the default)

1. **What the Director may change.** Default: agent stages, groups and the Director check; locked are merge, G1, script
   gates, human and sign-off stages, and routed stages. Alternative: d-0077's literal "no floor" (anything but merge).
2. **Lighter pipelines.** Default: a plan that removes a stage fails the approval floor, so the owner approves it.
   Alternative: the Director may approve lighter plans itself.
3. **Runtime adjustments.** Default: only the fallback substitute adjusts a running ticket; anything else re-plans.
   Later: `ticket_recover` may add a check or swap an agent.
4. **Proposal threshold.** Default: 3 tickets from at least 2 cards within 30 days, same lane and base list (editable in
   Director settings).
5. **Proposal surface.** Default: own table, Inbox `pipeline_proposal` item and a Pipelines banner (not an escalation, not
   a memory proposal). Routing-rule proposals ("paths → add agent") later.
6. **Finding verdicts.** Default: the owner's mark wins; otherwise acted on (fixed by rework) or overruled (merge anyway);
   a later-bug link waits for issue sync.
7. **Quota after the list.** Default: wait for the reset (today's behaviour), no Director substitute.
8. **Substitute limits.** Default: same role, writer scope within the original's, critic family rule kept.
9. **Scorecard window and sample.** Default: 90 days (30 selectable), fewer than 5 tickets is "too few to judge".
10. **Replay/canary for accepted proposals (d-0075).** Default: not in S5d; accepting is an owner edit validated like the
    editor. d-0141 item 9 exempts only seed pipelines, so this stays open until replay exists.

## S5d-A contract (as built)

Everything in "Contract (shared, binding)" holds unless listed under **Deviations**. Error envelope as S5a-S5c:
`{ error: { code, message, issues?, ...details } }`; body failures are 400 `invalid_request`. Writes are authored `owner`.
All new shapes are exported from `@forge/core`.

### Shared shapes

- `schemas/pipeline-adjust.ts`: `AdjustReason` (trimmed 10..500), `PipelineAdjustOp` (`add {stage: AgentStage|GroupStage, after,
  reason}`, `remove {stage_id}` (a top-level stage or a group member), `swap {stage_id, member_id?, agent}`, `move {stage_id,
  after}`), `PlanPipeline {ops 1..6}`, `ADJUST_PROBLEM_CODES`, `AdjustProblem {code, stage_id?, message, problems?}`,
  `PipelineAdjustment {seq, op, by:'director', cause:'plan'|'fallback', key, status:'applied'|'dropped', problem?,
  plan_version?, at}`, `MAX_PLAN_OPS = 6`, `MAX_ADJUSTMENTS = 40` (the log keeps the newest 40).
- `TicketPipeline += base_hash, adjustments`. `StageOutcome.fallback = {slot -1..5, tried[{slot, harness, model?, family}] <= 8}`
  (on the stage row: the entry of the agent's chain the attempt is on, and what was tried). `Run += model?, fallback_slot?`
  (0 primary, 1+ fallback, -1 substitute; runs from before 0027 have neither).
- `StageView += changed?, ran_on?, row_id?, marks?`; `TicketPipelineView += adjustments, removed, base_hash`.
  `changed = {by:'director', op:'add'|'swap'|'move', cause, reason}` sits on the added, swapped or moved stage (a swapped group
  member carries it, not the group); `removed = [{id, label, reason}]` (the label is the stage id made readable: the op carries
  no label); `ran_on = {harness, model?, slot}` from the stage's latest run row (`slot` 0 when absent); **`row_id`** is the stage
  row the view shows (the key of the mark route) and **`marks`** is `[{index, verdict}]` by position in `findings` (both added
  beyond the brief: without them the mark toggles cannot be built).
- `schemas/pipeline-proposal.ts`: `PROPOSAL_STATUSES`, `ProposalEvidence`, `PipelineProposal`, `PipelineProposalView` (`current`,
  `stale`), `AcceptProposalBody {expected_version, reason? <= 500}`, `RejectProposalBody {reason 3..500}`.
- `schemas/scorecard.ts`: as the brief (`ScorecardRow`, `AgentScorecard`, `ShapeScorecard`, `ScorecardReply`, `FindingMark`,
  `FindingVerdict`, `MarkFindingBody {verdict: 'real'|'false_alarm'|null}`, `MIN_SCORECARD_TICKETS = 5`).
- `ErrorFamily += model_unavailable`; `RunsOn.on_exhausted?`; `FAILURE_CAUSES += no_agent_available`; `ESCALATION_ACTIONS +=
  substitute`; `INBOX_KINDS += pipeline_proposal`; `PlanTicket.pipeline?`; `DirectorConfig.pipelines {adjust, propose_after 2..10,
  propose_min_cards 1..5, propose_window_days 7..90}` (defaults true, 3, 2, 30); `STEP_NAMES += pick_substitute` (model `sonnet`,
  timeout 120 s, also in `.forge/config/forge.yaml`, CRLF kept); playbooks `adjust-pipeline` and `pick-substitute` (version 1,
  editable in Director settings); `checkFloor` input `lighter?: {key, removed[]}[]`.

### Migration 0027

`0027-director-pipelines` is additive (no table rebuilt): `ticket_pipelines.base_hash` (backfilled = `pipeline_hash`) and
`adjusted_json DEFAULT '[]'`, `runs.model` and `runs.fallback_slot` (nullable), `pipeline_proposals` (unique
`(project, lane, key, base_hash)` in every status; `project` is the slug), `finding_marks` (primary key `(stage_run_id,
finding_index)`). Test: seeded 0026 rows survive (ids, FKs, indexes), CHECK lists equal core's.

### Routes

| Route | Body | 200 | Errors |
|---|---|---|---|
| `GET /tickets/:id/pipeline` | none | `{ pipeline: TicketPipelineView \| null }` (the S5b wrapper is kept) with `adjustments`, `removed`, `base_hash`, per stage `changed`, `ran_on`, `row_id`, `marks` | 404 `ticket_not_found` |
| `PUT /tickets/:id/findings/:stageRunId/:index/mark` | `{verdict: 'real'\|'false_alarm'\|null}` | `{ pipeline: TicketPipelineView }` | 404 `ticket_not_found`, `finding_not_found` (another ticket's row, a row with no review, index out of range, bad ids); 400 `invalid_request` |
| `GET /settings/projects/:slug/pipeline-proposals?status=pending\|all` (default `pending`) | none | `{ proposals: PipelineProposalView[] }` newest first; `stale` is true when the lane's hash is no longer `base_hash` (or the status is `stale`) | 404 `project_not_found`; 400 `invalid_request` |
| `POST /settings/projects/:slug/pipeline-proposals/:id/accept` | `{expected_version, reason?}` | `{ proposal: PipelineProposal, pipelines: ProjectPipelinesReply }` (`proposal.config_version` is `c<company>:p<project>`) | 404 `project_not_found`, `proposal_not_found` (also another project's, a bad id); 409 `not_pending`, `proposal_stale` (marked stale, nothing written), `version_conflict`; 400 `pipeline_invalid` (+`problems`) |
| `POST /settings/projects/:slug/pipeline-proposals/:id/reject` | `{reason 3..500}` | `{ proposal }` | 404 as above; 409 `not_pending`; 400 `invalid_request` |
| `GET /projects/:slug/scorecards?range=30d\|90d&agent=<id>` | none | `ScorecardReply`; with `agent` only that agent's card and `shapes: []` | 400 `invalid_request`; 404 `project_not_found`, `agent_not_found` |
| `PATCH /cards/:id/plan/:version/tickets` | each ticket edit also takes `drop_pipeline_ops: number[]` (0-based positions of the Director's ops to take off; the owner may remove an op, never add one) | `{plan}` | as S5a |
| `GET /projects/:slug/inbox` | | items of kind `pipeline_proposal`: id `pipeline_proposal:<id>`, `needs_action: true`, `updated_at = created_at`, title "Pipeline change proposed for <lane>: add X after Y", detail "Made the same change on N tickets" | unchanged |
| `PUT /settings/company`, `PUT /settings/projects/:slug` | `director.pipelines` (and agents' `runs_on.on_exhausted`) | fresh settings | 400 `invalid_request` for a value out of its bounds or an unknown key |
| `POST /interactions/:id/act` | `retry` / `replan` / `cancel` on a `no_agent_available` item | unchanged | an owner `substitute` is not in the body union (400); the engine door also answers `action_not_offered` |

Accept order: project found, proposal found, pending, the lane hash against `base_hash` (stale first), then the ordinary lane
save (`expected_version` is the project's own version; version conflict and rule problems come from there), then the decision.

### Live updates

`tracked-storage.ts`: `ticketPipelines.adjust` and a mark `set` announce `['ticket-pipeline', id]` and `['ticket', id]`; a mark
`clear` is resolved through its stage row to the same keys. A proposal insert announces `['pipeline-proposals', slug]` and
`['inbox', slug]`; a proposal decision announces those two plus `['pipelines','project',slug]` and `['project-settings', slug]`.
Scorecards have no live key.

### Escalation and Inbox

- Failure cause **`no_agent_available`**: park reason `no_agent_available: <agent> could not run this stage on any of its N place(s)
  (<family>)`; payload `EscalationFailure` with `attempts[{at, what: "place N: <harness> (<model>)", result: <family>}]`,
  `error_family` (`rate_limit` or `model_unavailable`), `lane`; title "No agent could run this stage". Actions `retry`, `replan`
  (only with a card), `cancel`. It starts in the Director stage; with the agent's `on_exhausted: 'pause'` or the owner's
  `director_first: false` it starts with the owner (`escalated_at` set, Inbox and card event at once).
- Settled by the Director: answer `{action: 'substitute', by: 'director', note: "<agent>: <reason>"}` (never a button); the card
  event `escalation_settled` carries it. The owner's Retry restarts the chain at slot 0 (the tried entries on the stage rows are cleared).
- A rate limit past `retry.rate_limit.max_attempts` (counted per slot) on a stage-bound run now ends in this cause instead of
  `retry_cap` (also with no fallbacks listed). A run with no stage row keeps the old path. Quota is unchanged.

### Director steps

- `write_plan` input gains `pipelines`: `{adjust: false}` when the owner switched it off, else `{adjust: true, playbook, lanes:
  {express, standard, full: PipelineDefinition}, locked: {lane: stageIds[]}, roster: [{id, name, role, description,
  write_scope}], scorecards: AgentScorecard[]}` (compact: the `all` row and one row per ticket type, 90 days; agents with no
  ticket in the window are left out). A ticket may carry `pipeline: {ops}`. Ops are vetted when the plan is written (only ops
  that apply to the ticket's lane stay; each dropped one is a risk "Pipeline change dropped for t2: <op> (<reason>)"), and the
  approval floor reads "t2 runs a lighter pipeline than its lane (removes reviewer)" when a ticket has a `remove` op, so the
  plan waits for the owner (`auto_approve_eligible: false`).
- `pick_substitute` input `PickSubstituteInput` `{stage:{id,label}, failed:{agent_id, role, tried[]}, candidates:[{id, name, role,
  description, write_scope, family, card: ScorecardRow|null}], playbook, house_rules}`; output `{decision:'substitute'|'pause',
  agent?, reason 10..500}` (substitute needs the agent). The engine accepts only an agent in `candidates`.

### Behaviour the web should word

- The strip: an added stage reads "Added by the Director: <reason>"; removed stages come from `removed`; a swapped stage with
  `cause: 'fallback'` reads "Substitute for <original agent>"; `ran_on.slot > 0` reads "Ran on fallback N (<model>)"; `slot -1`
  is a substitute run. A dropped adjustment is in `adjustments` (`status: 'dropped'`, `problem`) only, never on a stage.
- Scorecards: `insufficient` rows read "Too few tickets to judge"; every figure may be `null` (no data). `duration` is the run
  duration (median, p90); `cost.per_ticket_usd` is null while no run of the row recorded a cost. Shape labels read "Standard",
  "Standard + security-reviewer", "Standard - reviewer", "Standard implementer -> frontend-writer".
- A proposal is never made for a ticket whose routing rules added stages (its base list is not the lane's own).

### Deviations from the brief

1. `adjustmentKey` is lane-prefixed (`standard:add:security-reviewer@after:g1`) so the key differs by lane as the rule test asks; the
   brief's examples lacked the prefix.
2. `applyAdjustments(base, ops, ctx, meta)` takes the log metadata (`cause`, `at`, `seq?`, `plan_version?`) as a fourth argument and
   returns `{definition, log, applied, dropped, problems}` (`log` has one entry per op in order). `ctx` adds `routed` and `frozen`.
3. `shouldPropose` takes `suppressed` as `{lane, key, base_hash}[]` and history entries carry the `reason`; it answers
   `{propose, count, cards, matching}`. `nextFallback` takes `{chain, tried, paused, installed, now, familyGuard?}`;
   `substituteCandidates` reuses the swap rule of `applyAdjustments` (so the list and the later swap cannot disagree) and adds the
   critic family rule on top.
4. Added beyond the brief: `StageView.row_id` and `marks`; `TicketPipelineRepository.adjust` takes optional `roles`; `RunRepository.listByTickets`;
   `FindingMarkRepository.listByTickets`; `drop_pipeline_ops` on the plan edit; core `scopeWithin`.
5. A lane raise re-applies the recorded ops and the log of the new copy is those re-applied entries (renumbered), not the old log plus them.
6. No existing test pinned a rate-limit exhaustion ending (engine, server or e2e), so no test changed its expected cause; the new
   engine tests pin `no_agent_available`. The golden fixture, `express-parity`, Standard and Full tests are untouched.
7. The proposal history counts plan ops only (fallback swaps never), and the lane base must equal the ticket's `base_hash`.
8. `ErrorFamily` `model_unavailable` is mapped to HTTP 500 in `http-errors.ts` like `crash`.
