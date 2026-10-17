# S5b — Stage runner, lane pipelines, Standard lane (builder brief)

Status: **approved per d-0160 / d-0164 (autonomous run)** · 2026-10-17
Plan: `docs/briefs/card-first-flow-plan.md` §S5b, Invariants, Risks ("the stage runner lands
with Express parity first, then Standard"). Decisions: d-0151, d-0152 (lane pipelines + editor),
d-0136 / d-0137 (MVP pipelines, built-in agents), d-0069 (routing only escalates), d-0070 (typed
artifacts; reviewers never see narrative), d-0071 (reviewer findings), d-0073 (critic family
warning), d-0074 (script gates), d-0076 (run-together groups), d-0135 (no dead ends), d-0085 /
d-0090 (config rows, UI only), d-0006 (lanes only escalate). Superseded for storage: d-0066 /
d-0068 (pipelines as files and graphs). The MVP editor is a list (d-0152).
**Builds on S5a** (`docs/briefs/s5a-agents.md`): `AgentDefinition`, `effectiveAgents()`, the
`laneAgent()` placeholder (S5b replaces it), `tick/run-agent.ts`, `runs.agent_id/agent_hash`,
migration 0024. S5b starts only after S5a is committed, because both touch `run-agent.ts`,
`dispatch-run.ts`, `forge-config.ts`, `project.ts` and the migration registry.

There are two builders. They work in parallel against the **contract** below, and neither edits
the other's files. Both read `.claude/rules/code.md` first.
- **S5b-A backend:** core, tools, mcp, gates, db, engine, drivers, server.
- **S5b-B web:** `apps/web` and `docs/design/ui-screen-map.md`.

## What exists today

| Concern | Where | Gap against the decisions |
|---|---|---|
| Lane hold (triage) | `engine/tick/triage.ts` L101: `lane not enabled in M0`, which parks every non-Express ticket with a `lane_hold` escalation | Standard has to run |
| Lane hold (planned) | `engine/tick/plan-to-tickets.ts` `PIPELINE_PENDING` hold, plus `run-as-express.ts`, `core/domain/escalation-actions.ts` `lane_hold`, `escalation-classify.ts`, `domain/playbooks/plan-to-tickets.ts` text | held tickets never resume on their own |
| Worker → verify | `tick/outcome.ts`: run success → `verifying`; `tick/verify.ts` runs the gate job (G1 = `runtime.gates`) → `verify-merge.ts passAndMerge` | one run per ticket; no stage after the gates |
| Rework | `verify-outcomes.ts reworkOrPark`: `gate_failed` → continuation wake with findings in `reason` → `MAX_AUTO_REWORKS = 2` → `waiting_human` + `rework_cap` escalation | only G1 can send work back |
| Human review | `gate_passed` tier B/C → `review` / `needs_signoff`; `review-merge.ts approveAndMerge` → `mergeReviewed` | no human stage when the tier is A |
| Agent per run | S5a `tick/run-agent.ts` → `laneAgent(views, lane)` = `implementer` | no pipeline |
| Worker output | MCP `finish` (`mcp/domain/tools/finish.ts`, risk `write-cwd`) → run event `finish` {summary, claims} | a reviewer has no typed findings channel; `finish` is write-class |
| Ticket context tool | `mcp/domain/tools/get-ticket.ts` returns the ticket's `runs` | a reviewer could read the implementer's runs (narrative leak) |
| G1 | `gates/domain/g1-gate.ts` (claims, receipts, earlier runs on the same branch, test-diff, project checks) | no script gates (d-0074) and no red proof |
| Planning flow list | `core/schemas/director-flow.ts` + web `components/director/flow-editor.tsx` (locked steps, live issues) | this is the pattern the pipeline editor copies |
| Config rows | `ConfigSource` company + project docs, builtins merged at read, `mergeConfig` (records by key, lists replace) | pipelines are not there yet |

## Orchestrator calls (binding)

- **Pipelines live in the existing config rows.** `ForgeConfig.pipelines` holds the company
  defaults: builtins in code (`domain/builtin-pipelines.ts`) with overrides in the company doc.
  `ProjectSettings.pipelines` holds per-lane project overrides and the routing rules. Reset
  removes the lane key from the override doc. Every save is one `ConfigSource.append` (CAS,
  author, reason) through `services/pipeline-store.ts`. No new config table.
- **Snapshot per ticket.** The effective lane pipeline, plus routed stages, is snapshotted into
  `ticket_pipelines` at the ticket's first dispatch, with its hash and `config_version`. Later
  edits never change a started ticket. If `ticket.lane` is raised later, the next stage
  boundary re-snapshots the heavier lane and keeps the passed records whose stage ids still
  exist.
- **The stage runner is pure core plus thin engine IO.** `stageCursor(snapshot, records, cycle)`
  is a pure function over the persisted `stage_runs`, so no cursor column is stored. It returns
  the next effect, and the engine performs it through the existing doors. Uniqueness on
  `(ticket, stage, member, cycle)` makes a restart or a double tick start nothing twice.
- **Mapping to ticket status. `transition()` gets one small change and no new statuses.**
  - Writer stages (role writer or tester) run while the ticket is `in_progress`. Each is a
    normal Worker run that becomes `assignee_run_id`.
  - Success of a writer that has another writer after it: no status move. A `stage` wake
    dispatches the next writer.
  - Success of the last writer → `verifying` (unchanged).
  - In `verifying`: the `g1` gate stage is the existing gate job. Check-agent stages
    (reviewer/researcher) are read-only Worker runs that never become `assignee_run_id`, so
    `resolveTarget` and the gate rows still name the last writer's run. Script gates and
    groups also run here.
  - When the cursor reaches merge: `passAndMerge`, which keeps the one merge door. If the
    pipeline has a passed-through human stage, `gate_passed` carries `hold: true`, so a tier A
    ticket goes to `review`.
- **Writers come before checks** (S5b limit). The `g1` gate is required exactly once, after the
  last writer (no lane skips the independent gate, d-0006). Merge is locked last.
- **Rework is the existing gate-failure path** (d-0152). A failed G1, a failed script gate, or a
  check agent with blocking findings and `on_blocking: 'rework'` applies `gate_failed`, which
  bumps `rework_count`. The rendered findings go in the continuation wake, so the next writer
  prompt carries them through the existing `wakeDelta`. The new cycle restarts at the stage's
  `rework_to` (default: the last writer); earlier writers (the test-writer) are not re-run. At
  the cap: `waiting_human` + `rework_cap` escalation (Retry / Re-plan / Cancel).
  `on_blocking: 'hold'` parks from `verifying` with a failure escalation instead (the literal
  reading of d-0071, see Q1). "Merge anyway" arrives with S5c/S4b.
- **No agent approves its own work.** Checked at save time and again at snapshot. A check
  stage's agent id never equals a writer stage's agent id. A reviewer needs a writer before
  it. Every writer has an independent check (gate, other agent or human) before merge.
- **Reviewers never see narrative.** A check-stage prompt is rendered deterministically (no
  Director call) from the artifacts its agent lists in `inputs`. `narrative` is stripped for
  every non-writer role even if listed (fail closed). `get_ticket` omits `runs` for check-stage
  runs. A check run never resumes a writer session.
- **Lane holds lift.** Express and Standard are live (`LIVE_LANES` in engine code: a
  capability, not config). Full stays held until S5c, but its pipeline can be edited now. A
  per-tick phase releases pending `lane_hold` escalations whose lane is live (settled
  `pipeline_ready` by the engine, then `unparked` through `transition()`). Triage and
  plan-to-tickets hold only non-live lanes.
- **Human stage = escalation.** In S5b it is the existing `review` wait (approve / rework /
  cancel). The S5c sign-off kind replaces it.
- **Routing only adds checks** (d-0069). Project-level rules, `paths → add agent` (reviewer or
  researcher roles only), evaluated on the plan's files at snapshot and again on the real diff
  when `verifying` starts. Matching stages are appended right before the human or merge stage.
  Nothing is ever removed. Fired rules are recorded on the ticket.
- **Express parity is the gate.** Express = `implementer → g1 → merge` produces the same events
  and the same `RunRequest` as S5a. The only new writes are `ticket_pipelines` and `stage_runs`.
- **Agents in use are locked.** S5a's `agent_required` becomes `agent_in_pipeline`: an agent
  named by any effective pipeline or routing rule cannot be disabled or archived (409, lanes
  listed). The `implementer` is no longer special.

## Contract (shared, binding)

### Core schemas (`schemas/pipeline.ts`, `schemas/stage-run.ts`, new; S5b-A owns, S5b-B imports from `@forge/core` like `FlowStep`)

```ts
StageId   = /^[a-z][a-z0-9_-]{0,39}$/
Severity  = 'critical'|'high'|'medium'|'low'
CheckPolicy = { rework_to?: StageId /* earlier writer; default last writer before */,
                on_blocking: 'rework'|'hold' /* default 'rework' */,
                blocking: Severity[] /* default ['critical','high'] */ }
AgentStage  = { id, kind:'agent', label (1–80), agent: AgentId, proof?: 'red' /* tester only */ } & Partial<CheckPolicy> /* checks only */
ScriptGateStage = { id, kind:'script_gate', label,
                    run: { builtin:'g1' }
                       | { command (1–500), cwd?: RelativeDir, timeout_ms (1 000–1 800 000),
                           guard_paths: Glob[] /* diff touching these fails closed; a relative first argv token is auto-guarded */ } } & Partial<CheckPolicy>
GroupStage  = { id, kind:'group', label, join:'all', members: (AgentStage|ScriptGateStage)[] /* 2–4, checks only, no g1 */ } & Partial<CheckPolicy>
HumanStage  = { id, kind:'human', label, prompt (1–500) }
MergeStage  = { id:'merge', kind:'merge', label, locked: true }
Stage = AgentStage | ScriptGateStage | GroupStage | HumanStage | MergeStage
PipelineDefinition = { stages: Stage[] /* 2–12 */, description?: string (≤500) }
LanePipelines   = { express, standard, full: PipelineDefinition }
RoutingRule     = { id: StageId, paths: Glob[] (1–20), add: AgentId, label? (≤80) }
ProjectPipelines = { express?, standard?, full?: PipelineDefinition, routing: RoutingRule[] /* ≤20, default [] */ }
PipelineProblem = { code, stage_id?, message }   // codes below
PipelineView = { lane, definition, hash, tags: ('builtin'|'edited'|'project'|'company')[],
                 live: boolean, warnings: string[] /* e.g. d-0073 same-family critic */ }
Finding = { severity, file?: RelPath, line?: int>0, issue (1–1000), evidence (1–2000) }
ReviewSubmission = { verdict:'pass'|'changes', summary (1–4000), findings: Finding[] (≤100) }
StageRunStatus = 'running'|'passed'|'failed'|'error'|'waiting'|'skipped'|'adopted'
StageOutcome = { review?: ReviewSubmission, blocking?: int, gate?: { status: GateStatus, report_ref? },
                 red?: boolean, note?: string (≤1000) }
StageRun = { id:int, ticket_id, stage_id, member_id: string /* '' when not in a group */, cycle:int≥0,
             kind:'agent'|'script_gate'|'human', agent_id?, agent_hash?, run_id?, status, outcome: StageOutcome,
             started_at, ended_at? }
StageArtifact = { id:int, ticket_id, stage_run_id:int, kind: ArtifactKind, content: string /* ≤200 000 */,
                  truncated: boolean, sha256, created_at }
TicketPipeline = { ticket_id, lane, definition, hash, config_version: ConfigVersionRef,
                   routed: { rule_id, agent: AgentId, stage_id, at:'snapshot'|'diff' }[], created_at, updated_at }
StageView = { id, kind, label, agent?: { id, name }, members?: StageView[], status: StageRunStatus|'pending',
              cycle, run_id?, started_at?, ended_at?, summary?, counts?: Record<Severity, int>, artifacts: { id, kind }[] }
TicketPipelineView = { lane, hash, config_version, stages: StageView[], routed, rework: { count, cap } }
```

**Pure domain** (`core/domain/`, property-tested, each ≤300 lines):
- `pipeline-rules.ts`: `pipelineProblems(def, { roster: AgentView[], lane }) → PipelineProblem[]`.
  Codes: `merge_missing`, `merge_not_last`, `duplicate_stage_id`, `too_many_stages`,
  `no_writer`, `g1_missing`, `g1_duplicate`, `g1_before_writer`, `writer_after_check`,
  `unknown_agent`, `agent_unavailable` (disabled or archived), `role_mismatch` (`proof` on a
  non-tester; check policy on a writer), `reviewer_first`, `self_review`, `group_writer`,
  `group_size`, `human_position` (≤1, after all checks), `rework_target` (a self, forward or
  non-writer `rework_to`: the only back edge, so this is the loop rejection), `script_invalid`.
  Also `routingProblems(rules, roster)`: `routing_writer`, `unknown_agent`, `duplicate_rule_id`.
- `builtin-pipelines.ts`: `BUILTIN_PIPELINES`.
  - Express: `implementer → g1 → merge`.
  - Standard: `test-writer (proof:'red') → implementer → g1 → reviewer → merge`.
  - Full (editable now, live in S5c): `test-writer → implementer → g1 → group(reviewer, critic) →
    human → merge`.
- `effective-pipelines.ts`: `effectivePipelines(forge.pipelines, project?.pipelines, roster) →
  Record<Lane, PipelineView>`.
- `pipeline-routing.ts`: `routeStages(def, rules, paths) → { definition, fired }`; only adds.
- `stage-cursor.ts`: `stageCursor(snapshot, records, cycle) → Cursor`, one of
  `{run_writer, stage}`, `{start_gates}`, `{await, stage}`, `{run_checks, stage, members}`,
  `{merge, hold}`, `{done}`. Stages before the cycle's `rework_to` count as satisfied by an
  earlier passed or adopted record. Also `reworkTarget(snapshot, stageId)`,
  `isBlocking(outcome, policy)`, `stageInputs(agent, available)` (strips `narrative` for
  non-writers), and `adoptLegacy(ticket, snapshot)` (marks writers `adopted` for a ticket
  already in `verifying` before the deploy).
- `ticket-pipeline-view.ts`: `ticketPipelineView(snapshot, records, artifacts, ticket, roster)`.

**Edits:**
- `ForgeConfig.pipelines: LanePipelines`; `ProjectConfigShape.pipelines: ProjectPipelines.optional()`.
  `mergeConfig` is unchanged: a lane key replaces the whole definition.
- `TicketEvent gate_passed` gains `hold?: true` (`state-machine.ts`: tier A + hold → `review`).
- `WakeKind` gains `'stage'`.
- `RunEvent` gains `{ type:'review', ts, review: ReviewSubmission }`.
- `escalation.ts` settled actions gain the engine-only `pipeline_ready` (never offered as a button).
- `types/ports/storage.types.ts` gains `ticketPipelines` (`get`, `insert`, `appendRouted`),
  `stageRuns` (`listByTicket`, `getByRun`, `start` → id or `'exists'`, `finish`) and
  `stageArtifacts` (`add`, `listByTicket`, `get`).
- New port `types/ports/script-gate.types.ts`: `ScriptGateRunner.run({ worktreePath, baseSha,
  command, cwd?, timeoutMs, guardPaths, expect:'pass'|'fail' }) → GateVerdict`.
- `domain/playbooks/plan-to-tickets.ts`: the hold text applies to non-live lanes only.

### DB — migration **`0025-stage-runner.ts`**

```sql
CREATE TABLE ticket_pipelines (
  ticket_id TEXT PRIMARY KEY REFERENCES tickets (id),
  lane TEXT NOT NULL CHECK (lane IN ('express','standard','full')),
  pipeline_json TEXT NOT NULL, pipeline_hash TEXT NOT NULL, config_version TEXT NOT NULL,
  routed_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets (id),
  stage_id TEXT NOT NULL, member_id TEXT NOT NULL DEFAULT '', cycle INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('agent','script_gate','human')),
  agent_id TEXT, agent_hash TEXT, run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','passed','failed','error','waiting','skipped','adopted')),
  outcome_json TEXT NOT NULL DEFAULT '{}', started_at TEXT NOT NULL, ended_at TEXT,
  UNIQUE (ticket_id, stage_id, member_id, cycle));
CREATE INDEX idx_stage_runs_ticket ON stage_runs (ticket_id);
CREATE INDEX idx_stage_runs_run ON stage_runs (run_id);
CREATE TABLE stage_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets (id),
  stage_run_id INTEGER NOT NULL REFERENCES stage_runs (id),
  kind TEXT NOT NULL CHECK (kind IN ('plan','ticket','diff','finish_claims','narrative','test_report','findings','gate_report')),
  content TEXT NOT NULL, truncated INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX idx_stage_artifacts_ticket ON stage_artifacts (ticket_id);
```
The kind lists are written out in the migration; a test pins them equal to core at this
version (same pattern as 0022). If `wake_requests.kind` has a CHECK, rebuild that table in 0025
the way 0022 rebuilt the reply queue. `project-purge.ts` deletes artifacts → stage_runs →
ticket_pipelines before tickets. If S5a or U1 already took number 0025, use the next free one.

### Engine API (S5b-A)
- `tick/stage-snapshot.ts`: `ensureSnapshotTx(tx, ctx, ticket) → TicketPipeline`, called at
  first dispatch and when verify finds no snapshot; adopts legacy tickets.
- `tick/stage-runner.ts`: `advanceStagesTx(ctx, tx, ticket)` performs the cursor's effect:
  request a `stage` wake, start gates, start a script job, wait, or call merge.
- `tick/stage-outcome.ts`: `applyStageOutcome(ctx, tx, run, result)`, called from `outcome.ts`
  for runs with a check `stage_runs` row: records the review, applies pass / rework / hold,
  writes artifacts. A writer run that succeeds while another writer is next requests a
  `stage` wake instead of `verifying`.
- `tick/stage-artifacts.ts`: `collectArtifacts(ctx, ticket, kinds)` covers `ticket`, `plan`
  (card plan section), `diff` (`worktrees.diff`, capped), `finish_claims`, `narrative` (finish
  summary), `gate_report` (report store), `test_report` (red proof), `findings` (earlier
  cycles); persisted with sha256.
- `tick/stage-prompt.ts`: `renderCheckPrompt(agent, artifacts)` (deterministic, ends with the
  `submit_review` contract).
- `tick/stage-script-jobs.ts`: in-memory jobs like `gate-jobs.ts`, keyed
  `ticket:run:stage:member`; results go to `stage_runs` only (never `gate_results`).
- `tick/lane-hold-release.ts`: `releaseLaneHolds(ctx)`, a phase placed before triage.

### HTTP (S5b-A implements, S5b-B consumes)

Envelope and write rules as S5a: every write carries `expected_version` and `reason` (≥3
chars); a successful write returns the fresh views.

| Method + path | Body | 200 response | Errors |
|---|---|---|---|
| `GET /settings/pipelines` | — | `{ pipelines: Record<Lane, PipelineView>, version }` | — |
| `PUT /settings/pipelines/:lane` | `{ pipeline: PipelineDefinition, expected_version, reason }` | `{ pipelines, version }` | 404 `lane_unknown`; 400 `invalid_body`, `pipeline_invalid` (+`problems`); 409 `version_conflict` |
| `POST /settings/pipelines/:lane/reset` | `{ expected_version, reason }` | same | 409 `not_overridden` |
| `GET /settings/projects/:slug/pipelines` | — | `{ pipelines: Record<Lane, PipelineView & { changed: boolean }>, routing: RoutingRule[], version: { company, project } }` | 404 `project_not_found` |
| `PUT /settings/projects/:slug/pipelines/:lane` | as company | `{ pipelines, routing, version }` | as company |
| `POST /settings/projects/:slug/pipelines/:lane/reset` | `{ expected_version, reason }` | same | 409 `not_overridden` |
| `PUT /settings/projects/:slug/routing` | `{ rules: RoutingRule[], expected_version, reason }` | same | 400 `routing_invalid` (+`problems`) |
| `POST /settings/pipelines/validate` | `{ lane, pipeline, project? }` | `{ problems, warnings }` (writes nothing) | 400 `invalid_body` |
| `GET /tickets/:id/pipeline` | — | `{ pipeline: TicketPipelineView \| null }` (null before first dispatch) | 404 `ticket_not_found` |
| `GET /tickets/:id/artifacts/:artifactId` | — | `StageArtifact` (the owner may read narrative) | 404 `artifact_not_found` |

S5a agent routes gain 409 `agent_in_pipeline` (`{ lanes, rules }`) on disable and archive.
Writes go through `services/pipeline-store.ts` (reads the latest doc, applies pure
`domain/pipeline-doc.ts`, validates with the scope's effective roster, appends).

**Query keys.** `['pipelines', 'company']`, `['pipelines', 'project', slug]` (mutations also
invalidate `['settings', 'company']` / `['project-settings', slug]`), `['ticket-pipeline',
ticketId]`, `['ticket-artifact', ticketId, id]`. The engine publishes `['ticket-pipeline', id]`
and `['tickets', id]` on the project SSE stream at every stage change.

## S5b-A backend

- **core**: new `schemas/{pipeline,stage-run}.ts`, `domain/{pipeline-rules,builtin-pipelines,
  effective-pipelines,pipeline-routing,stage-cursor,ticket-pipeline-view,pipeline-doc}.ts`,
  `types/ports/script-gate.types.ts`; edits `schemas/{forge-config,project,run-event,
  wake-request,escalation}.ts`, `domain/state-machine.ts`, `types/ticket-events.types.ts`,
  `types/ports/storage.types.ts`, `domain/builtin-config.ts`, `domain/escalation-classify.ts`,
  `domain/playbooks/plan-to-tickets.ts`, `index.ts`, README.
- **tools**: `catalogue-seed-forge.ts` gains `mcp__forge__submit_review` (risk `read`);
  `lane-defaults.ts` adds it to every lane's ceiling (agent grants narrow it). README.
- **mcp**: new `domain/tools/submit-review.ts` (parses `ReviewSubmission`, appends a `review`
  run event, one per run, last wins until the run ends); `all-tools.ts`; `schemas/tool-inputs.ts`;
  `get-ticket.ts` omits `runs` when the caller's run has a check `stage_runs` row. README.
- **gates**: `adapters/script-gate-runner.ts` implements `ScriptGateRunner` (reuses
  `command-runner`, `shared/env.ts` stripped env, PATH resolution; a diff touching `guardPaths`
  fails closed; `expect:'fail'` serves the red proof). Index and README.
- **db**: `migrations/0025-stage-runner.ts` and the registry; sqlite
  `{ticket-pipelines,stage-runs,stage-artifacts}-repository.ts`; memory equivalents;
  `sqlite-storage.ts`, `memory-storage.ts`, `project-purge.ts` (both). Contract tests for all
  three repositories on both adapters.
- **engine**: the files in Engine API, plus edits:
  - `run-agent.ts`: `stageAgent()` replaces `laneAgent()`.
  - `dispatch-run.ts`: stage-aware. A check stage takes no `assignee_run_id` and makes no
    ticket move from `verifying`; the `stage_runs` row is written in the run-row transaction;
    the prompt comes from `stage-prompt.ts` for checks, and from `dispatch_prompt` with an
    optional `agent { id, role, instructions }` for non-implementer writers.
  - `outcome.ts` branches to `applyStageOutcome`; `verify.ts`: snapshot, diff-time routing,
    cursor after a gate pass; `verify-outcomes.ts`: `reworkOrPark` takes a findings source (G1,
    script or review); `verify-merge.ts`: `hold` flag; `review-merge.ts`: marks the human stage
    passed; `wake-candidates.ts` / `schedule.ts`: `stage` wakes for `in_progress` and
    `verifying`; `triage.ts` and `plan-to-tickets.ts`: hold only non-live lanes (reason names
    the lane and "goes live in the next update"); `restart.ts`: running `stage_runs` whose run
    ended are settled, lost script jobs re-run; `domain/invariants.ts`: an `in_progress` ticket
    waiting on a `stage` wake is legal; `engine.ts`: new phases; README (remove the M0 text).
  - Budgets: each stage run uses its agent budget, falling back to `engine.run_budget`.
- **drivers**: claude `director-step-prompts.ts` `dispatch_prompt`: when `agent` is present,
  write the brief for that role (a tester writes failing tests only). README.
- **server**: new `routes/pipelines.ts`, `routes/project-pipelines.ts`, `routes/ticket-pipeline.ts`,
  `services/pipeline-store.ts`, `services/ticket-pipeline-view.ts`; edits
  `services/agent-store.ts` (`agent_in_pipeline`), `routes/routes.ts`, `schemas/api.ts`,
  `services/run-wiring.ts` / data wiring (wire `ScriptGateRunner`; `assemble.ts` is at its
  300-line limit). Tests: every route's happy path and each listed error.

### Done when (S5b-A)
1. **Express parity** (`engine/__tests__/tick/express-parity.test.ts`, extended): the scripted
   Express ticket yields the S5a golden `RunRequest`, the event sequence `triaged, dispatched,
   verifying, gate_passed(A), merged`, one `ticket_pipelines` row and two passed `stage_runs`
   (implementer, g1).
2. **Standard end to end** (`engine/__tests__/tick/standard-pipeline.test.ts`, scripted fake
   driver + fake gates): test-writer run (edits a test file, finish claims, red proof
   `expect:'fail'` passes) → `stage` wake → implementer run → `verifying` → G1 pass → reviewer
   run (`submit_review` pass with one `low`) → tier A `merged`. With a tier B diff the ticket
   ends in `review`, and `approveAndMerge` → `done`. The reviewer prompt contains no sentinel
   from the implementer's finish summary. Artifacts are stored for every stage.
3. **Held tickets resume**: a seeded Standard ticket in `waiting_human` with a pending
   `lane_hold` → one tick → escalation settled `pipeline_ready`, ticket `planned`, then
   dispatched to the test-writer. A Full one stays held with its actions.
4. **Review rework**: reviewer `high` with evidence → `gate_failed`, `rework_count` 1,
   implementer re-runs with the findings in its wake (test-writer not re-run); same at 2; the
   third time → `waiting_human` + `rework_cap` escalation. `on_blocking:'hold'` → parked from
   `verifying` at once.
5. **Save-time validation**: `PUT` refuses each of `merge_missing`, `rework_target`,
   `self_review`, `writer_after_check`, `g1_missing`, `unknown_agent`, `group_writer` with 400
   `pipeline_invalid`, and nothing is appended.
6. **Routing**: a `**/*.tf → reviewer-net` rule adds a stage at snapshot from plan files, and at
   diff time when only the diff touches `.tf`; never removes; `routed` recorded.
7. **Human stage**: tier A + human → `review`; approve → `done`, human record passed.
8. **Script gate**: exit 1 → rework; diff touching the guarded script → fail closed.
9. **Restart** mid-reviewer: no duplicate `stage_runs`; the stage completes.
10. Disabling the reviewer while Standard names it → 409 `agent_in_pipeline`.

## S5b-B web (invoke `hallmark` first; Nielsen pass on each screen before reporting)

- **Forge settings → Pipelines** (`/settings/pipelines`, nav after Agents): Express / Standard /
  Full tabs, each with the list editor, a `Built-in` / `Edited` tag and Reset (confirm). Full
  shows "Runs from the next update; Full tickets wait until then" while `live:false`.
- **Project settings → Pipelines** (its own settings tab/URL): the same tabs with "Changed from
  company default" + Reset per lane, and a **Routing rules** section: paths (glob chips) →
  agent Picker filtered to reviewer/researcher roles, add / remove / reorder.
- **Pipeline editor** (`components/pipelines/pipeline-editor.tsx` + siblings, modelled on
  `flow-editor.tsx`): ordered rows with kind icon, label, agent name and role chip, move
  up/down, remove; merge locked last with the reason; G1 pinned "required after the last
  writer". **Add stage** menu: Agent · Script gate · Run-together group · Human sign-off. Stage
  details: agent Picker over the effective roster (disabled/archived rows with reasons); red
  proof toggle for testers; checks: "On blocking findings: send back (up to 2 times) / hold for
  me", blocking severities, "Send back to" (writers above only); script: command, folder,
  timeout, guarded paths; group: members (2–4 checks); human: prompt. Live problems from core
  `pipelineProblems` plus a debounced `POST /settings/pipelines/validate`, each in words next
  to its row; warnings as a notice; Save disabled while problems exist; save bar with reason,
  409 conflict banner, unsaved-changes guard.
- **Ticket pipeline strip** (`routes/ticket/pipeline-strip.tsx`, on the ticket page): one chip
  per stage (pending / running / passed / failed / waiting / adopted), cycle badge "Rework 1 of
  2", routed stages marked "added by rule". A chip opens `stage-detail.tsx`: agent, run link,
  time, findings by severity with file:line, artifacts (lazy load, diff in mono, narrative
  labelled "Worker's own account"). Hidden while `pipeline:null` ("Starts when the ticket is
  dispatched").
- Files: `routes/settings/pipelines-page.tsx`, project settings pipelines section,
  `components/pipelines/{pipeline-editor,stage-row,stage-details,add-stage-menu,group-members,
  routing-rules-editor,pipeline-problems}.tsx`, `domain/pipeline-edit.ts`,
  `domain/pipeline-copy.ts`, `api/http/pipelines-http.ts`, `api/use-pipelines.ts`,
  `api/use-ticket-pipeline.ts`, settings routes/nav wiring,
  `__tests__/helpers/fake-forge/pipeline-routes.ts`.
- Tests (web project): editor add / move / remove each kind; locked merge cannot move; problem
  shown and Save disabled; validate-endpoint problem shown; Reset (company and project); 409;
  routing add + save, Picker excludes writers; strip statuses, rework badge, stage detail with
  findings and artifact load, hidden before dispatch; keyboard reachability. Update
  `ui-screen-map.md`.

### Done when (S5b-B)
Every HTTP row is reachable from a control; each screen has loading, empty, error and saved
states; the Nielsen checklist is filled per screen in the report.

## Rule tests
- `core/__tests__/domain/pipeline-rules.test.ts`: property test over random stage lists: no
  list with a check agent equal to a writer agent, a writer without a later independent check,
  no merge-last, or a non-backward `rework_to` validates; every builtin lane is valid.
- `core/__tests__/domain/stage-cursor.test.ts`: monotonic within a cycle; idempotent on
  re-applied records; a new cycle restarts at `rework_to`; merge only after every check passed.
- `core/__tests__/domain/pipeline-routing.test.ts`: routing only adds.
- `core/__tests__/domain/state-machine.test.ts`: `gate_passed {hold}` keeps tier C at
  `needs_signoff` and sends A to `review`.
- `engine/__tests__/tick/stage-prompt.test.ts`: a non-writer prompt never includes `narrative`.

**Doors:** tickets only via `transition()`; merge only in `verify-merge.ts`; tools only via
`admit()`; pipeline config only via `ConfigSource.append` through `pipeline-store`.

## Gates (each builder, own scope)
`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; prettier `--write/--check <changed>`;
`vitest run --maxWorkers=2 <changed + new tests>` sequentially, one package at a time
(`--project web` for S5b-B; heavy for db/server/gates). ~2 GB free RAM: never the full suite;
on memory failure drop to `--maxWorkers=1` and defer heavy suites (d-0164). No commits, pushes
or worktrees. LF. READMEs current. PRODUCT.md is left to the orchestrator.

## Open questions for the owner (build proceeds on the default)
1. **Reviewer findings: rework or advisory?** d-0071 says reviewers never send work back and a
   critical/high finding holds the merge for the owner; d-0152 says rework uses the gate-failure
   path. Default: built-in check stages use `on_blocking:'rework'` (critical/high with evidence,
   up to 2 reworks, then the owner); `hold` can be set per stage; "Merge anyway" with S5c.
2. **Writers after checks.** Default: refused in S5b (`writer_after_check`); revisit with S5d.
3. **G1 required.** Default: every pipeline runs G1 after its last writer; not removable.
4. **Red proof.** Default: advisory (already-passing new tests → reviewer finding + ticket note).
5. **Full lane.** Default: editable now, held until S5c, with Run as Express.
6. **Lane model matrix.** Default: unchanged.
7. **Replay and canary (d-0075).** Default: not in S5b; tickets record pipeline hash + config version.
8. **Routing scope.** Default: project-level only, check agents only, before human/merge.

## S5b-A contract (as built)

Everything in "Contract (shared, binding)" holds unless listed under **Deviations**. Error envelope
as S5a: `{ error: { code, message, issues?, ...details } }`; `pipeline_invalid` and `routing_invalid`
carry `error.problems: PipelineProblem[]`, `agent_in_pipeline` carries `error.lanes: Lane[]` and
`error.rules: string[]`. Every write answers 200 with the fresh views. Writes are authored `owner`.
Owner decision d-0165: built-in check stages use `on_blocking: 'rework'`; `hold` is per stage.

### Shared shapes (core `@forge/core`; mirror in the web)

- `schemas/pipeline.ts`: `StageId`, `Severity`, `CheckPolicy`, `AgentStage`, `ScriptGateStage`,
  `GroupStage`, `HumanStage`, `MergeStage`, `Stage`, `PipelineDefinition`, `LanePipelines`,
  `RoutingRule`, `ProjectPipelines` (`routing` defaults `[]`), `PIPELINE_PROBLEM_CODES`,
  `PipelineProblem`, `PipelineTag`, `PipelineView`. All stage objects are strict. A group member may
  carry its own `on_blocking` / `blocking`; the group's `rework_to` governs. Defaults are applied at
  read (`checkPolicy()`), never stored: `on_blocking` rework, `blocking` critical and high.
- `schemas/stage-run.ts`: `Finding`, `ReviewSubmission`, `StageRunStatus`, `StageOutcome`, `StageRun`,
  `StageArtifact`, `RoutedStage`, `TicketPipeline` (adds `roles: Record<AgentId, AgentRole>`),
  `StageViewSchema`, `TicketPipelineView`; `StageView` (type, `types/stage-view.types.ts`).
- Problem codes: the brief's list plus `review_tool_missing` (a check agent whose tools lack
  `mcp__forge__submit_review`); routing problems: `routing_writer`, `unknown_agent`,
  `agent_unavailable`, `duplicate_rule_id`, `review_tool_missing`.
- `PipelineView.tags`: company scope is `['builtin']` or `['edited']`; project scope appends
  `'project'` (the project's own list) or `'company'` (inherited). `changed` (project views) is true
  only for a lane with a project list. Builtins carry no `description`.
- Escalation settled action `pipeline_ready` (by `auto`) is new in `EscalationAction`; web copy and
  `escalation-actions.tsx` must accept it (it currently breaks the web typecheck at
  `components/escalation/escalation-actions.tsx:117` and `domain/escalation-copy.ts:26`). The lane-hold
  title is now "Held: the lane goes live in the next update"; hold reasons start `pipeline_pending:`.
- `RunEvent` `review`, `WakeKind` `stage`, `TicketEvent gate_passed {hold?: true}`, `LIVE_LANES`
  (`@forge/engine`: express, standard).

### Routes

| Route | Body | 200 | Errors |
|---|---|---|---|
| `GET /settings/pipelines` | none | `{ pipelines: Record<Lane, PipelineView>, version: number }` | none |
| `PUT /settings/pipelines/:lane` | `{ pipeline, expected_version, reason }` | same shape | 404 `lane_unknown`; 400 `invalid_request` (+`issues`), `pipeline_invalid` (+`problems`); 409 `version_conflict` |
| `POST /settings/pipelines/:lane/reset` | `{ expected_version, reason }` | same shape | 404 `lane_unknown`; 409 `not_overridden`, `version_conflict` |
| `POST /settings/pipelines/validate` | `{ lane, pipeline, project? }` | `{ problems, warnings }` (writes nothing) | 400 `invalid_request` (also a bad lane); 404 `project_not_found` |
| `GET /settings/projects/:slug/pipelines` | none | `{ pipelines: Record<Lane, PipelineView & {changed}>, routing: RoutingRule[], version: { company, project } }` | 404 `project_not_found` |
| `PUT /settings/projects/:slug/pipelines/:lane` | as company | same as project GET | as company + 404 `project_not_found` |
| `POST /settings/projects/:slug/pipelines/:lane/reset` | as company | same | 409 `not_overridden` |
| `PUT /settings/projects/:slug/routing` | `{ rules: RoutingRule[] (<=20), expected_version, reason }` | same | 400 `routing_invalid` (+`problems`) |
| `GET /tickets/:id/pipeline` | none | `{ pipeline: TicketPipelineView \| null }` (null before the first dispatch) | 404 `ticket_not_found` |
| `GET /tickets/:id/artifacts/:artifactId` | none | `StageArtifact` with content (narrative included, the owner may read it) | 404 `artifact_not_found` (unknown, not a positive int, or another ticket's) |

`expected_version` is the scope's own (company number; project number for project writes). A list
equal to the shipped list (company) or the company list (project) is not stored: the save succeeds and
the lane reads `builtin` / not `changed`, so Reset then answers 409 `not_overridden`. A list is validated
against the scope's effective roster (disabled and archived agents are problems).
Agent routes: disable and archive answer 409 `agent_in_pipeline` (`lanes`, `rules`) when any effective
pipeline or routing rule names the agent (company archive also checks every project's own lists);
`agent_required` is gone, archiving a built-in is `builtin_locked`.

### Query keys and live updates

`['pipelines','company']`, `['pipelines','project',slug]` (mutations also invalidate
`['settings','company']` / `['project-settings',slug]`), `['ticket-pipeline',id]`,
`['ticket-artifact',id,artifactId]`. **The engine does not yet publish `['ticket-pipeline', id]` on the
SSE stream**: the strip should refetch on the existing `['tickets', id]` invalidation. Left for the
orchestrator.

### Stage rows as the web reads them

`StageView.status`: `pending` (no row, or a restarted stage), `running`, `passed`, `failed`, `error`,
`waiting` (human stage waiting, or a check held for the owner), `adopted`, `skipped`. A failed or held
attempt stays visible after a rework until the stage runs again. Merge reads `passed` only when the ticket
is done. A tester's red proof is a hidden row (`member_id: 'proof'`) whose `test_report` artifact hangs off
the tester stage's view; group members have `member_id` = member id under `stage_id` = group id.
`rework.cap` is 2.

### Behaviour the web should word

Standard now runs (test-writer with red proof, implementer, G1, reviewer). Full is editable but held
(`live: false`) with Run as Express; the engine releases holds of live lanes by itself. A human stage puts
even a tier A ticket in `review`; approve ends it done. A reviewer that never calls `submit_review`, a
script that cannot run, or a stage agent that is missing parks the ticket with a failure escalation (Retry
re-runs that stage). A held check (`on_blocking: hold`) parks from verifying; Retry runs it again.

### Removed (d-0166)

`GET /projects/:slug/stats` (handler, tests, README line). `GET /projects/:slug/cost` stays in
`routes/project-stats.ts`. Web call site still using it: `apps/web/src/api/http/work-http.ts`
(`stats.get`, `project(slug, '/stats?range=...')`) with the `ProjectStats` types in
`types/work-api.types.ts` and `__tests__/helpers/work-fixtures.ts`.

### Deviations from the brief

1. Body validation failures answer 400 `invalid_request` (the server's envelope), not `invalid_body`;
   a malformed ticket id on the two ticket routes is 404 `ticket_not_found`.
2. Unusable stage agent: fail closed. A stage whose agent is missing, disabled or archived parks the
   ticket at dispatch or in verifying; S5a's "falls back to the shipped implementer" test now pins the park.
3. `TicketPipeline` stores `roles` (the cursor needs writer vs check without the roster); `Cursor` adds
   `run_proof` and `cycle`; `currentCycle()`, `cycleStart()`, `PROOF_MEMBER` are exported; the cursor
   functions live in `stage-cursor.ts`, `stage-policy.ts`, `stage-kinds.ts`.
4. No merge stage row is written (Express writes exactly one snapshot and two stage rows); the view derives
   it. Artifacts are stored only for pipelines with a check agent (Express writes none).
5. A held check records a `waiting` row; after release the cursor restarts that check in a new cycle. The
   owner's rework from review is a `failed` human row (or against `merge` when there is no human stage).
6. `invariants.ts` and `restart.ts` needed no edit: a pending `stage` wake already explains an in-progress
   ticket, and a crash-settled check run is retried by a stage wake onto the same attempt row.
7. `submit_review` joins the built-in reviewer, critic and template tool lists; catalogue hash in the seed.
8. A lane raised mid-run adopts the heavier lane's earlier writers instead of running them out of order.
9. Existing tests that used a Standard ticket as the "held" fixture now use Full; `laneAgent()` is replaced
   by `stageAgent()` / `shippedImplementer()`.
10. `ProjectRuntime.scriptGates` (optional) carries the script runner; `project-registry.ts` wires it.
