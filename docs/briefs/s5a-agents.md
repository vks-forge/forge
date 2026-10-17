# S5a — Agents (builder brief)

Status: **approved per d-0160 (autonomous run)** · 2026-10-17
Plan: `docs/briefs/card-first-flow-plan.md` §S5a, Invariants, Risks ("S5a is large: the stage
runner lands with Express parity first"). Decisions: d-0147, d-0148, d-0149, d-0153, d-0155;
d-0078 (skills + memory slice), d-0085 / d-0090 (versioned config rows, UI only), d-0060
(model matrix), d-0070 (typed artifacts), d-0080 (fallback list), d-0137 (MVP agents), d-0150.
Builds on S2 (`director` config section, Director steps) and S4a (escalations; **S5a starts
after S4a is committed**: both touch `steps.ts`, `director-config.ts`, the migration registry).

Two builders, parallel, against the **contract** below. Nobody edits the other's files. Both
read `.claude/rules/code.md` first.
- **S5a-A backend:** core, tools, db, engine, drivers, server.
- **S5a-B web:** `apps/web` and `docs/design/ui-screen-map.md`.

## What exists today

| Concern | Where | Gap against the decisions |
|---|---|---|
| Implementer model | `engine/tick/run-request.ts` `forge.models.worker[ticket.lane]` (d-0060 matrix, edited as text in Limits) | no agent record; no "Harness default" |
| Implementer harness | `tick/project-runtime.ts` `driverFor` = `project.default_harness`; quota fallback `domain/harness-choice.ts` over `harness_fallbacks` | no per-agent harness or fallback |
| Implementer instructions | none: prompt = `dispatch_prompt` step output + `renderWorkerContract()` (`tick/dispatch-run.ts`) | nothing to edit |
| Tools | `server/services/tool-policy.ts` `effectiveGrant(lane, projectGrant, undefined /* ticket */, …)` | no agent layer |
| Budget | `forge.engine.run_budget` for every run | not per agent (d-0072) |
| Models list | none; `DriverCapabilities` (`schemas/steer-mode.ts`) has no models; web `MODEL_CHOICES` hard-codes Opus / Sonnet / Haiku | d-0153 wants driver-reported models |
| `RunRequest.model` | `z.string().min(1)`, required; claude `cli-args.ts` always passes `--model`, `acp-meta.ts` always sets it | a true Harness default is impossible |
| Live probe | `drivers/adapters/claude/harness-test.ts` `liveProbe` (tool-less, `$0.05` cap, 90 s) | not reusable with a model or instructions |
| Config rows | `config_versions` via `ConfigSource` (company doc + project doc, CAS `expectedVersion`), builtins merged at read (`builtin-config.ts`, `merge-config.ts`) | the pattern agents follow |

## Orchestrator calls (binding)

- **Agents live in the existing config rows**, not a new table. Company agents are a new
  `agents` section of `ForgeConfig` (builtins in code, overrides and custom agents in the
  company doc); project agents, overrides and disables are a new `agents` section of
  `ProjectSettings`. Every agent save is one `ConfigSource.append` (CAS, author, reason), so
  versioning, history, replay and `config_version` on runs come for free. Per-agent history is
  derived from the scope's history (a pure diff), never stored twice.
- **Builtins are code, merged at read** (same as S2): a fresh install reads four agents at
  config version 0. Reset = remove the agent's key from the override doc.
- **Express parity is the gate.** Express runs the effective `implementer` agent. Its builtin
  is defined so the run request is byte-identical to today: harness `project_default`, model
  `forge_default` (= `models.worker[lane]`, so existing matrix overrides keep working), empty
  instructions, tools `lane_default`, write scope `**`, budget unset (= `engine.run_budget`),
  fallbacks empty (= existing `harness_fallbacks`).
- **Never delete.** Custom agents are archived, not deleted (runs name them). The `implementer`
  cannot be disabled or archived until S5b lane pipelines exist (409 `agent_required`).
- **Test agent and Director draft are tool-less one-shot calls.** No worktree, no MCP, no
  session persistence. Nothing they return is saved without the owner pressing Save.

## Contract (shared, binding)

### Core schemas (`schemas/agent.ts`, new; S5a-A owns, S5a-B mirrors in `apps/web/src/schemas/agents.ts`)

```ts
AgentId    = /^[a-z][a-z0-9-]{1,47}$/          // builtins: implementer, test-writer, reviewer, critic
AgentRole  = 'writer' | 'reviewer' | 'tester' | 'researcher'
ModelChoice = { kind: 'forge_default' }        // models.worker[lane]; builtin implementer only (see Q1)
            | { kind: 'harness_default' }      // send no model; follows the harness forever
            | { kind: 'model', id: string }    // a listed model or any custom id (1–120 chars)
RunsOn = { harness: 'project_default' | HarnessId, model: ModelChoice,
           fallbacks: { harness: 'project_default' | HarnessId, model: ModelChoice }[] /* ≤5, ordered */ }
AgentBudget = { usd?: number>0, minutes?: int>0, turns?: int>0 }   // absent key = engine.run_budget
AgentDefinition = {
  name (1–60), description (1–500; the Director reads it), role: AgentRole,
  instructions: string /* markdown, ≤ 20 000; '' allowed */,
  runs_on: RunsOn,
  tools: 'lane_default' | string[] /* catalogue ids */,
  write_scope: string[] /* globs; writer + tester only; reviewer/researcher must be [] */,
  inputs: ArtifactKind[], output: ArtifactKind[]      /* d-0070; stored now, used by S5b */,
  skills: string[], memory: { tags: string[] /* [] = whole slice */, include_rejected: boolean },
  budget: AgentBudget, archived: boolean (false),
  origin: 'builtin' | 'custom' | 'template:<id>' | 'director_draft' | 'duplicate:<id>' }
ArtifactKind = 'plan'|'ticket'|'diff'|'finish_claims'|'narrative'|'test_report'|'findings'|'gate_report'
ProjectAgents = { custom: Record<AgentId, AgentDefinition>,
                  overrides: Record<AgentId, { instructions?: string, runs_on?: RunsOn }>,  // d-0149
                  disabled: AgentId[] }
AgentTag  = 'builtin' | 'company' | 'overridden' | 'project' | 'disabled' | 'archived'
AgentView = { id, scope: 'company'|'project', tags: AgentTag[], definition: AgentDefinition /* effective */,
              base?: AgentDefinition /* company def under a project override */, hash: Sha256Hex,
              readiness: { ready: boolean, reasons: string[] } /* from RunsOnHarness, see below */ }
AgentInput = AgentDefinition minus { archived, origin }  (+ origin on create)
HarnessModel = { id, label, speed: 'fast'|'balanced'|'deep', cost: 'low'|'medium'|'high',
                 recommended_for: AgentRole[] }
RunsOnHarness = { id, kind, version?, signed_in: boolean, compat: CompatStatus, paused_until?,
                  ready: boolean, reasons: string[], fix_href: string,
                  models: HarnessModel[], models_checked_at?: datetime }
AgentTestResult = { ok: boolean, reply?: string /* ≤2000 */, model_used?: string,
                    harness_id, duration_ms, cost_usd?, error?: { family: ErrorFamily, message } }
```

Refinements (pure, `domain/agent-rules.ts`, property-tested): role bounds (reviewer, researcher:
no write-class tools, `write_scope` empty; tester: write scope required and non-empty; writer:
any catalogue tool); `tools` ids must exist in the catalogue (server check, the catalogue is not
core data); `forge_default` allowed only on builtin `implementer` (Q1); fallbacks unique.
`agentHash(def)` = sha256 of the canonical JSON (sorted keys).

- `ForgeConfig` gains `agents: Record<AgentId, AgentDefinition>`; `ProjectConfigShape` gains
  `agents: ProjectAgents.optional()`. `mergeConfig` is unchanged (records merge by key, lists
  replace). New pure `domain/effective-agents.ts`: `effectiveAgents(forge.agents,
  project.agents?, readiness) → AgentView[]` (project override lays `instructions`/`runs_on`
  over the company def; disabled and archived stay listed with tags; order builtin, company,
  project, by name) and `laneAgent(views, lane) → AgentView` (S5a: `implementer` for every lane;
  S5b replaces it with the lane pipeline).
- `domain/builtin-agents.ts`: `BUILTIN_AGENTS` — `implementer` (parity values above;
  description says it writes the ticket's change), `test-writer` (tester, write scope test
  globs), `reviewer` (reviewer, read tools, never sees `narrative`), `critic` (reviewer, same
  family warning text per d-0073). The last three carry real instructions (30–60 lines each)
  and are used from S5b. `domain/agent-templates.ts`: `AGENT_TEMPLATES` gallery (not in the
  roster): Security reviewer, Docs writer, Network config reviewer, Accessibility reviewer,
  Performance reviewer, Migration reviewer — each `{ id, title, summary, definition }` with real
  instructions (30–60 lines), role, tools, suggested model `{kind:'model', id:'sonnet'}`.
- `schemas/run.ts`: `RunRequest.model` becomes **optional** (absent = harness default);
  `Run` gains `agent_id?`, `agent_hash?`.
- `types/ports/driver.types.ts`: `WorkerDriver` gains `models(): Promise<readonly HarnessModel[]>`
  and `probe(req: { model?: string, instructions: string, prompt: string, timeoutMs: number,
  maxUsd: number }): Promise<AgentProbeResult>` (tool-less, no session, no MCP).
  `CompatReport` gains `models?: HarnessModel[]` (stored in the report JSON; no migration).
- `schemas/steps.ts`: step `draft_agent`; `models.director.draft_agent` default `sonnet`;
  timeout 120 000 ms. `schemas/director-steps.ts`: `DraftAgentOutput = { definition: AgentInput,
  rationale: string (≤1000), questions: string[] (≤3) }`.

### HTTP (S5a-A implements, S5a-B consumes)

Envelope as existing routes: `{ error: { code, message, issues? } }`. Every write body carries
`expected_version` (the scope's version the editor saw) and `reason` (≥3 chars); success returns
the fresh list so the client never re-derives tags.

| Method + path | Body | 200 response | Errors |
|---|---|---|---|
| `GET /settings/agents` | — | `{ agents: AgentView[], version }` | — |
| `POST /settings/agents` | `{ agent: AgentInput, origin, expected_version, reason }` | `{ id, agents, version }` | 400 `invalid_body` / `role_bounds` / `unknown_tool`; 409 `name_taken`, `version_conflict` |
| `PUT /settings/agents/:id` | `{ agent: AgentInput, expected_version, reason }` (builtin → stored as override diff) | `{ agents, version }` | 404 `agent_not_found`; 400s as above; 409 `version_conflict` |
| `POST /settings/agents/:id/reset` | `{ expected_version, reason }` | same | 409 `not_builtin`, `not_overridden` |
| `POST /settings/agents/:id/archive` · `/unarchive` | same | same | 409 `builtin_locked`, `agent_required` |
| `POST /settings/agents/:id/duplicate` | `{ name, scope: 'company'\|'project', project?, expected_version, reason }` | `{ id, agents, version }` | 409 `name_taken` |
| `GET /settings/agents/:id/history` | — | `{ versions: { version, author, reason, created_at, change: 'created'\|'edited'\|'reset'\|'archived'\|'unarchived' }[] }` | 404 |
| `GET /settings/projects/:slug/agents` | — | `{ agents: AgentView[], version: { company, project } }` | 404 `project_not_found` |
| `POST /settings/projects/:slug/agents` | create project agent (as company) | `{ id, agents, version }` | as company |
| `PUT /settings/projects/:slug/agents/:id` | project agent: `{ agent }`; company agent: `{ override: { instructions?, runs_on? } }` | `{ agents, version }` | 400 `override_fields` (other fields on a company agent) |
| `POST /settings/projects/:slug/agents/:id/reset-override` · `/disable` · `/enable` · `/archive` | `{ expected_version, reason }` | same | 409 `agent_required`, `not_overridden` |
| `GET /agents/templates` | — | `{ templates: AgentTemplate[] }` | — |
| `GET /agents/runs-on` | — | `{ harnesses: RunsOnHarness[] }` (every configured harness, ready or not) | — |
| `POST /agents/draft` | `{ description (10–2000), scope, project? }` | `{ definition: AgentInput, rationale, questions }` | 422 `draft_invalid` (parse or role bounds, with `issues`); 504 `step_timeout` |
| `POST /agents/test` | `{ agent: AgentInput, project? }` | `AgentTestResult` (a failed probe is 200 with `ok:false`) | 409 `harness_not_ready` (reasons), `test_in_progress` (one per harness) |

`version_conflict` reuses `ConfigVersionConflictError`. Agent writes go through one server
service (`services/agent-store.ts`) that reads the latest doc, applies the change with pure
`domain/agent-doc.ts` helpers, validates the merged result and appends; no route writes rows.

**Query keys.** `['agents', 'company']`, `['agents', 'project', slug]`, `['agents', 'history',
scope, id]`, `['agents', 'templates']`, `['agents', 'runs-on']`. Agent mutations also invalidate
`['settings', 'company']` (company) or `['project-settings', slug]` (project) since they share
the version counter; a compat run invalidates `['agents', 'runs-on']`.

## S5a-A backend

- **core** — `schemas/agent.ts`, `domain/{agent-rules,effective-agents,builtin-agents,
  agent-templates,agent-doc,agent-history}.ts` (+ `domain/agent-templates/*.ts` one per template,
  ≤300 lines each), `schemas/forge-config.ts`, `schemas/project.ts`, `schemas/run.ts`,
  `schemas/harness-compat.ts`, `schemas/steps.ts`, `schemas/director-steps.ts`,
  `domain/builtin-config.ts`, `types/ports/driver.types.ts`, README.
- **tools** — `domain/agent-grant.ts`: `agentGrant(def) → Grant | undefined` (`lane_default` and
  `write_scope ['**']` → undefined); `effectiveGrant` gains an `agentGrant` narrowing layer
  (allow intersects; write-class calls outside `write_scope` deny; fail closed). Property test:
  the agent layer never widens. README.
- **db** — migration **`0024-run-agent.ts`**: `runs.agent_id TEXT`, `runs.agent_hash TEXT`
  (nullable, old rows stay null); both run repositories + contract test. README.
- **engine** — `tick/run-agent.ts` (new): resolves `laneAgent()` from this tick's effective
  config, maps `RunsOn` to `{ harnessId, model? }` (`project_default` → `default_harness`,
  `forge_default` → `models.worker[lane]`, `harness_default` → no model). `dispatch-run.ts`:
  harness from the agent unless the scheduler chose a fallback; prompt =
  `[drafted, instructions ? '## Agent instructions\n' + instructions : null, contract]`;
  run row `agent_id` / `agent_hash`. `run-request.ts`: model and budget from the agent (budget
  keys fall back to `engine.run_budget`; `minutes` maps to the stall-free wall clock cap if the
  driver supports it, else ignored with a log). `schedule.ts` / `harness-choice.ts`: a non-empty
  agent `fallbacks` list replaces `harness_fallbacks` for that ticket (quota and harness-down
  paths only; the full d-0080 chain is S5d). `resume-chain.ts` resumes on the same agent hash
  when present. Memory: `MemorySource.slice(slug, filter?)` honours `memory.tags` ([] = today).
- **drivers** — claude: `models()` returns the driver's declared list (aliases `opus`, `sonnet`,
  `haiku` with labels; extend from the installed build when it reports more), called by the
  compat run and stored in `report.models`; `cli-args.ts` and `acp-meta.ts` omit the model when
  absent; `probe()` generalises `liveProbe` (`--tools ''`, `--setting-sources ''`,
  `--no-session-persistence`, `--max-budget-usd` from the request, `--model` when given,
  instructions via `--append-system-prompt`, timeout from the request). `director-step-prompts.ts`
  entry for `draft_agent`. README.
- **server** — `routes/agents.ts`, `routes/project-agents.ts`, `services/agent-store.ts`,
  `services/agent-readiness.ts` (harness row + `harness_versions` compat + `harness_state` pause →
  `RunsOnHarness`), `services/agent-test.ts` (probe: prompt "In one line, state your role and the
  first rule in your instructions.", timeout 60 s, `maxUsd` 0.10, one in flight per harness),
  `services/agent-draft.ts` (runs `draft_agent` through the Director adapter; input: description,
  scope, catalogue ids allowed per role, ready harnesses with models, existing agent names, house
  rules; output parsed with `DraftAgentOutput`, then `agent-rules`), `services/compat-record.ts`
  (store models), `services/tool-policy.ts` (agent grant from the run's `agent_id`), `schemas/api.ts`.
  Tests: every route's happy path and each listed error.

### Done when (S5a-A)
1. **Parity test** (`engine/__tests__/tick/express-parity.test.ts`): with builtins only, a
   scripted Express dispatch yields a `RunRequest` equal field by field to a golden fixture
   captured from the pre-S5a code (prompt, promptHash, model, budget, env, isolation, cwd) and
   the same driver id; with company `models.worker.express = 'opus'` the model is `opus`; claude
   `cli-args` for that request are unchanged (driver test).
2. Project override of `implementer` instructions → prompt contains the section; run records
   `agent_id: 'implementer'` and the new hash; `harness_default` → no `--model` flag.
3. Agent `tools: ['read','edit']` → a `shell` call is denied by `admit()`; `write_scope ['src/**']`
   → an edit of `docs/x.md` is denied.
4. Builtin edit → override doc holds only the diff; Reset → key removed; second save with a
   stale `expected_version` → 409.
5. `draft_agent` scripted output with a reviewer holding `edit` → 422 `draft_invalid`; valid →
   200, nothing written.
6. Test agent on a paused harness → 409 `harness_not_ready`; on a fake driver → `ok:true`.

## S5a-B web (invoke `hallmark` first; Nielsen pass on each screen before reporting)

- **Forge settings → Agents** (`/settings/agents`, nav entry after Director): list of company
  agents (name, role, description line, Runs on chip with readiness dot, tags `built-in`,
  `edited`, `archived`); actions New agent (menu: From scratch · From template · Describe it to
  the Director), Duplicate, Archive / Unarchive, Reset (builtin, edited only, confirm).
- **Project settings → Agents** (`/p/:slug/settings#agents` section, or a sub-route if the page
  passes 300 lines): effective list with tags `built-in` / `overridden` / `project` /
  `disabled`; per row Override for this project (instructions + Runs on only, "Using company
  default" with Reset), Disable here / Enable, Duplicate; New project agent.
- **Agent editor** (`components/agents/agent-editor.tsx` + siblings, one form for every
  source): Identity (name, description with "the Director reads this" hint, role), Instructions
  (markdown textarea + preview), **Runs on** (Harness Picker over `runs-on` with version /
  signed in / compat; not-ready rows disabled with the reason and **Fix in settings**; Model
  Picker grouped by `recommended_for` the agent's role with speed/cost labels, top row "Harness
  default — follows the harness", "Forge default (lane model)" only on implementer, "Custom
  model id…" free text; Fallbacks ordered list with move up/down, ≤5), Tools (catalogue checklist
  filtered by role; write tools disabled for reviewer/researcher with the reason), Write scope
  (writers/testers), Inputs/Output (chips; "used when pipelines arrive" note), Skills, Memory
  tags, Budget (blank = Forge default shown as placeholder). Save bar with reason, 409 →
  conflict banner (reuse `project-settings/conflict-banner.tsx` pattern), unsaved-changes guard.
- **Test agent** button in the editor: states "Spends one short model call (≤ $0.10) on <harness>"
  before running; shows reply, model used, time, cost; error family in plain words with the fix.
- **Template gallery** dialog: cards from `/agents/templates`; picking one opens the editor
  prefilled (origin `template:<id>`).
- **Describe it to the Director**: textarea → `POST /agents/draft` with a progress state
  ("Director is drafting…", cancel) → editor prefilled with a banner showing the rationale and
  questions; nothing saved until Save.
- **Director page models**: `model-fields.tsx` uses `runs-on` models for the Director's harness
  instead of `MODEL_CHOICES` (fallback to the old list when no compat report has models).
- Files: `routes/settings/agents-page.tsx`, `routes/project-settings/agents-section.tsx`,
  `components/agents/*`, `api/http/agents-http.ts`, `api/use-agents.ts`, `schemas/agents.ts`,
  `domain/agent-copy.ts` (tags, roles, readiness reasons in plain words), `settings-routes.tsx`,
  section nav, `__tests__/helpers/fake-forge/agent-routes.ts`.
- Tests (web project): list tags; create from scratch / template / draft posts the right body;
  builtin edit + Reset; project override, disable, enable; 409 conflict; not-ready harness row
  disabled with Fix link; Harness default and custom id; fallback reorder; role switch strips
  write tools; Test agent success and failure; keyboard reachability. Update `ui-screen-map.md`.

### Done when (S5a-B)
Every row of the HTTP table is reachable from a control; each screen has loading, empty,
error and saved states; the Nielsen checklist is filled per screen in the report.

## Rule tests
- `core/__tests__/domain/agent-rules.test.ts`: property test over `AgentRole` × catalogue tool
  classes: no reviewer or researcher definition with a write tool or write scope validates.
- `core/__tests__/domain/effective-agents.test.ts`: every `AgentTag` combination; a disabled or
  archived agent is never returned by `laneAgent`; `implementer` always resolves.
- `tools/__tests__/domain/agent-grant.test.ts`: the agent layer only narrows.

**Doors:** tickets only via `transition()`; tools only via `admit()`; agent config only via
`ConfigSource.append` through `agent-store`; no git writes.

## Gates (each builder, own scope)
`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; `pnpm prettier --write/--check <changed>`;
`pnpm vitest run --maxWorkers=2 <changed + new tests>` (`--project web` for S5a-B; heavy
project for db/server/drivers). ~2 GB free RAM: never the full suite. No commits, pushes or
worktrees. LF. READMEs of touched packages current. PRODUCT.md is left to the orchestrator.

## Open questions for the owner (build proceeds on the default)
1. **Lane model matrix.** Default: `models.worker.*` stays as "Forge default (lane model)",
   offered only to the builtin implementer, so today's settings keep working; S5b moves lane
   models into the pipelines and the Limits fields become read-only pointers.
2. **Implementer instructions.** Default: empty for parity (the method today is the dispatch
   brief plus the Worker contract); text the owner adds is appended as "Agent instructions".
3. **Test agent cost.** Default: one call capped at $0.10, 60 s, one at a time per harness,
   always on owner click, never automatic.
4. **Fallbacks in S5a.** Default: an agent's list replaces `harness_fallbacks` on quota and
   harness-down only; rate-limit model swaps and the Director substitute wait for S5d.
5. **Disable / archive the implementer.** Default: refused (`agent_required`) until S5b lane
   pipelines can name another writer.
6. **Models list.** Default: driver-declared list refreshed at each compat check, plus custom
   ids; no live "detect model" call (the claude CLI has no list command).
