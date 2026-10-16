# S2 — Director planning (builder brief)

Plan: `docs/briefs/card-first-flow-plan.md` §S2. Decisions: d-0130, d-0131, d-0132, d-0133,
d-0140, d-0141 (items 1, 3, 4, 6), d-0143, d-0146, d-0150. Builds on S1 (card phase,
`transitionCard()`, `card_reply_queue`, project events, `POST /projects/:slug/cards`).

Two builders:
- **S2-A:** core, db, git, tools, engine, drivers (the planning flow).
- **S2-B:** server routes and web settings (Director settings page, flow editor, playbook view).

S3 (card page and board) runs in parallel and codes against the **event and API contract** below.
Nobody edits another builder's packages. All read `.claude/rules/code.md` first.

## Orchestrator calls (binding)

- **Read tools are engine-side pre-read, not MCP.** The risk table's fallback is the primary
  path: Director steps stay tool-less (same `claude -p` isolation flags). The `card_survey` and
  `verify` steps return *read requests*; the engine runs them through `admit()` under the new
  `director` grant and a new core port, then calls the step a second time with the results.
  Reason: deterministic, every read is recorded exactly, no MCP process per step, no
  dependence on harness tool behaviour, harness-neutral. Max two read rounds per step.
- **Defaults are builtin, not seeded rows** — same as today's config (`builtin-config.ts`,
  merged at read time). A fresh install reads flow and playbooks at config version 0.
- **Cards snapshot their flow.** When planning starts the card stores the effective flow list
  plus the config version (`flow_json`, `flow_config_version`). Editing the flow later never
  changes a card already planning.

## Contract (shared, binding)

### Card events (new kinds in `card-event.ts`; payloads are zod in core)

| kind | payload |
|---|---|
| `step_started` | `{ step_id, step_kind, label }` |
| `step_finished` | `{ step_id, step_kind, label, files_read: {path, bytes}[], config_version, summary }` |
| `grill_question` | `{ question_id, text, why?, options: {id, label, recommended: boolean}[] (2–4, exactly one recommended), allow_other: true, open_points: number }` |
| `grill_answer` | `{ question_id, option_id? , text?, by: 'owner' \| 'recommendation' }` |
| `grill_done` | `{ reason: 'nothing_open' \| 'owner_enough' \| 'use_recommendations' \| 'zero_question', assumptions: string[] }` |
| `plan_ready` | `{ version, ticket_count, auto_approve_eligible: boolean }` |
| `plan_approved` | `{ version, by: 'director' \| 'owner', ticket_ids: TicketId[] }` |
| `plan_changes_requested` | `{ version, comment }` |
| `needs_you` | `{ reason, actions: ('answer' \| 'approve_plan' \| 'request_changes' \| 'start_planning' \| 'run_as_express')[], ticket_id?: TicketId /* required when actions has run_as_express */ }` |

`budget_warning` (S1) stays. Card reads (list and detail) add `open_points: number | null` (from grill state while grilling) and `plan_version: number | null` (latest plan). `FloorResult` = `{ pass: boolean, reasons: string[] }`. Every event write emits the project invalidate (`["card",id]`,
`["cards",slug]`).

### Plan version (core `PlanVersion`, d-0132 fixed structure)

```ts
{ card_id, version: number, created_at, author: 'director',
  config_version: number, base_sha: string,          // HEAD at verify
  goal: string, scope: string[], non_goals: string[],
  decisions: { question: string, answer: string }[],
  assumptions: string[],
  verification: { blast_radius: string, files_read: string[],
                  overlaps: { card_id?: CardId, ticket_id?: TicketId, files: string[] }[],
                  matching_decisions: string[], rejected_hits: string[], risks: string[] },
  tickets: { key: string /* t1.. */, title, body, acceptance: string[],
             priority: 'low'|'normal'|'high'|'urgent', depends_on: string[] /* keys */,
             lane: 'express'|'standard'|'full', size: 'S'|'M'|'L', files: string[] }[],
  card_links: CardId[],
  enhance_report: string,                              // markdown, stored
  diff_from_previous?: { field: string, before: unknown, after: unknown }[] }
```

### HTTP (S2-B implements, S3 consumes)

- `GET /cards/:id/plan` → `{ versions: {version, created_at}[], current: PlanVersion | null, floor: FloorResult | null }`; `GET /cards/:id/plan/:version` → `{ plan }`.
- `POST /cards/:id/grill/answer` `{ question_id, option_id? , text? }` → 200 `{ card }`. Exactly one of option_id/text. 409 `question_not_open`.
- `POST /cards/:id/grill/shortcut` `{ kind: 'use_recommendations' | 'write_plan_now' }` → 200 `{ card }`.
- `POST /cards/:id/plan/approve` `{ version }` → 200 `{ card, ticket_ids }`. 409 `stale_plan` if not latest; 409 `phase_mismatch` unless `plan_ready`.
- `POST /cards/:id/plan/request-changes` `{ version, comment (≥ 5 chars) }` → 200 `{ card }`.
- `PATCH /cards/:id/plan/:version/tickets` `{ tickets: {key, title?, priority?, removed?: boolean}[], order?: string[] }` → 200 `{ plan }`. Allowed only in `plan_ready`; writes a new version (author owner edit, diff recorded). Removing a ticket others depend on → 409 `ticket_has_dependents`.
- `POST /cards/:id/start-planning` → 200 `{ card }`: for backfilled cards (S1 "Start planning"); snapshots the flow, phase → grilling, enqueues a wake.
- `POST /tickets/:id/run-as-express` → 200: releases a held non-Express planned ticket into Express (see "Held tickets").
- Director config: existing `GET/PUT /settings/company` and `/settings/projects/:slug` carry the new `director` section (no new routes needed unless the section needs its own history view; reuse `/history`).

All writes go through the engine/service doors, never raw repo writes from the route.

## S2-A (core, db, git, tools, engine, drivers)

### core
- `schemas/director-flow.ts`: `FlowStepKind` = `survey | grill | verify | enhance | write_plan | approve | custom`; `FlowStep { id, kind, label, enabled, when: 'always' | {lanes: Lane[]} | 'director_decides', depth?: 'light'|'normal'|'deep', playbook_id?: string, instructions?: string, locked: boolean }`; `DirectorFlow = FlowStep[]` with refinements: exactly one `write_plan` and one `approve`, both `locked`, both enabled, `approve` last and `write_plan` immediately before it; unique ids; custom steps need instructions.
- `schemas/forge-config.ts`: new `director` section: `{ flow: DirectorFlow, playbooks: Record<PlaybookId, {title, body}>, house_rules: string, approval_mode: 'director_or_user' | 'always_ask', grill: { max_questions_per_round: number, max_rounds: number }, budget_warning_usd: number, read_caps: { max_files: number, max_bytes: number }, step_timeouts_ms: Record<StepName, number> }`, project-overridable (`config-override.ts`). Builtins in `builtin-config.ts` — default flow v1: `survey → grill → verify → enhance (when: {lanes:[standard, full]}) → write_plan (locked) → approve (locked)`, and the six playbooks `plan-grill`, `verify-plan`, `enhance-decisions` (port the method of `.forge/skills/enhance-decisions/SKILL.md`, lane-scaled), `write-plan` (d-0132 structure), `plan-to-tickets`, `approve-plan`. Write the playbooks as real, usable method text (each 30–80 lines), not placeholders.
- `schemas/steps.ts`: add `card_survey`, `grill_turn`, `verify`, `enhance`, `write_plan`, `approve_plan`, `custom_step` with zod outputs; `models.director` gets keys for each (default: opus for survey/verify/enhance/write_plan/approve_plan, sonnet for grill_turn/custom_step).
  - `card_survey` / `verify` output: `{ read_requests?: ({op:'read', path} | {op:'grep', pattern, glob?} | {op:'glob', pattern})[] (≤ 20), findings?: ... }` — when `read_requests` is present and rounds remain, the engine reads and re-calls.
  - `grill_turn` output: `{ done: boolean, done_reason?, question?: GrillQuestion, assumptions: string[] }` (zero-question path = `done` on the first call with reason `zero_question`).
  - `approve_plan` output: `{ decision: 'approve' | 'ask_owner', questions: string[] }` — tool-less, input is the plan plus typed findings and the floor result only.
- `domain/approval-floor.ts`: pure `checkFloor({ plan, tierCGlobs, otherPlannedFiles, changedSinceBase }) → { pass: boolean, reasons: string[] }`: no planned file matches a tier-C glob; `verification.rejected_hits` empty; no overlap with files of other cards whose plan is approved and not done; `changedSinceBase` (files under the plan that changed between `base_sha` and HEAD) empty. Property tests. Budget is NOT in the floor (d-0143).
- `domain/plan-diff.ts`: pure field diff between versions.
- `domain/flow-cursor.ts`: pure next-step resolution (skip disabled, evaluate `when` against the card's predicted lane; `director_decides` resolved by a boolean the step input carries back).
- Ports: `types/ports/repo-reader.types.ts` `RepoReader { headSha(root), listTracked(root, glob?), readAtHead(root, path, maxBytes), grepAtHead(root, pattern, glob?, maxHits), changedFiles(root, fromSha, toSha, paths) }`.
- Interaction: no new kinds needed for grill (grill lives in card events + card `needs_you`).

### tools
- New `director` grant (`domain/director-grant.ts`): allows only `read_file`, `grep`, `glob` on paths inside the project root; deny everything else; fail closed. `admit()` is the only door; the engine calls it for each read request.

### git
- `adapters/git-cli/repo-reader.ts` implementing `RepoReader` with `git ls-files`, `git show HEAD:<path>`, `git grep` at HEAD, `git diff --name-only`. Path traversal and untracked files refused. Contract test with the fixture repo helpers (canonical temp dir).

### db
- Migration `0022-card-planning.ts`: `cards.flow_json` TEXT NULL, `cards.flow_config_version` INTEGER NULL, `cards.flow_cursor` INTEGER NULL, `cards.grill_state_json` TEXT NOT NULL DEFAULT '{}'; table `card_plans(card_id, version, plan_json, created_at, author, PRIMARY KEY(card_id, version))`. Repos on both adapters + contract tests. README.

### engine
- `tick/card-planning.ts` (+ small siblings, ≤ 300 lines each): the flow runner. Claims `card_reply_queue` items for cards in grilling/verifying/plan_ready-with-changes, resolves the step from `flow_cursor`, runs it via `runStep`, writes events, advances the cursor, transitions phase only through `transitionCard()`: grilling (survey, grill) → verifying (verify, enhance, write_plan) → plan_ready → approved. A grill question sets `needs_you` and stops until a `grill_answer` arrives (the answer route enqueues). Each `step_finished` records `config_version` and `files_read`.
- Step input always carries: the step's playbook body + step instructions, `house_rules`, project rules (active decisions + rejected records from the project's `.forge/memory` if present, and repo `CLAUDE.md`/`AGENTS.md` read via `RepoReader` at HEAD, capped), the card, its structured grill state (open points, answers, assumptions — not raw chat), previous step summaries, and for `request_changes` the comment plus the previous plan.
- Discussion cards: never run the flow (card chat only).
- `card_chat` (today's step) runs only for cards not in a planning phase.
- Approval: after `write_plan` → store `PlanVersion`, `plan_ready` event; compute floor; if `approval_mode === 'director_or_user'` and floor passes, run `approve_plan`; `approve` → `approvePlan(by: director)`; else `needs_you` with questions/actions `approve_plan`, `request_changes`.
- `domain`/`tick/plan-to-tickets.ts` `approvePlan(card, version, by)`: insert tickets in topological order via `insertInboxTicket` with priority (urgent 3, high 2, normal 1, low 0) and `blocked_by` mapped from plan keys; then a `triaged` event with lane = the stricter of plan lane and `preCheckLane`/`decideLane` (can only raise). Card → approved → queued/in_progress via `transitionCard()`; `plan_approved` event. Idempotent per (card, version).
- **Held tickets:** triage's non-Express park stays until S5a, but a planned non-Express ticket gets wait reason `pipeline_pending` and its inbox item offers `run_as_express` (service: re-triage to express through `transition()`), so no dead end.
- Request changes: `plan_changes_requested` event, phase plan_ready → grilling via `transitionCard()`, grill re-asks only changed points, then the next version with `diff_from_previous`.
- Budget: Director step spend counts on the card; crossing `budget_warning_usd` writes `budget_warning` once (no refusal).
- Nudges: an open grill question with no answer follows d-0112 timing (reuse the existing idle-card nudge if present; otherwise a `note` event after 24 h). Never auto-answer.

### drivers
- `director-step-prompts.ts`: instructions for each new step (short; the playbook text in the input carries the method). `director-step-args.ts` unchanged (tool-less). Per-step timeout from config. Update the director-llm adapter header and README (read tools are engine-side).

## S2-B (server + web settings)

### server
- Routes per the HTTP contract (new files under `routes/`, bodies in `schemas/api.ts`), services calling the engine doors; project events emitted after each write. Tests: each route's happy path and every listed error.

### web (invoke the `hallmark` skill first)
- **Forge settings → Director** (`/settings/director`) and **Project settings → Director** (override, with "Using company default" / Reset): model per step (Picker over the harness's models where available, else text), harness, house rules (textarea), approval mode, grill limits, budget warning, read caps, step timeouts. Locked invariants listed greyed with their reasons (d-0150 list).
- **Flow editor** (inside the Director page): ordered list; drag or move up/down; toggle; `when` Picker; depth; instructions editor; Add step (custom: name + instructions); locked steps show a lock and cannot move/remove; client validation mirrors the core refinements; save → new config version; version history with Reset to default.
- **Playbooks**: read-only view with title and markdown body per playbook, version shown.
- Tests (web project): edit and save, locked steps refuse, validation, reset, project override.

## Done when
- With the scripted LLM in engine tests: "TODO app" card → survey with a read round (files_read recorded) → grill questions with options → answers → verify → enhance → plan v1 → floor pass → auto-approve → ordered tickets with dependencies; floor fail → `needs_you`; request changes → v2 with diff; Discussion card never planned; restart mid-grill resumes.
- Settings pages edit and version the flow; a card started before an edit keeps its snapshot.

## Gates (each builder, own scope)
`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; `pnpm prettier --write/--check <changed>`;
`pnpm vitest run --maxWorkers=2 <changed + new tests>` (heavy project for git/server). ~2 GB free RAM:
never the full suite. No commits/pushes/worktrees. LF. READMEs current; S2-A owns the PRODUCT.md line.
