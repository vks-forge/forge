# Card-first flow: build plan (MVP)

Status: **approved, ON HOLD** (d-0158; run mode d-0156 when resumed) · 2026-10-16
Decisions: d-0128 – d-0156 (d-0107 superseded by d-0139, d-0108 by d-0142, d-0145 by d-0146).
Review: `docs/briefs/card-first-flow-enhance-report.md` (accepted, d-0141).

## Why

On 2026-10-16 a chat request ("i want to create a TODO application") became a
card and a ticket instantly, with no questions or plan. Triage then parked the
ticket with "lane not enabled in M0", which offered the owner no action. The
plan-mode validation of d-0017 was never built: the Director steps have no
method, no code access and no plan artifact, and only the Express lane runs.

This plan makes the Director plan before it works. The flow:

1. The owner creates a card.
2. The Director grills the owner in the card chat.
3. It verifies the work against the code and memory.
4. It runs an enhance pass.
5. It writes a versioned plan.
6. The plan is approved, by the Director behind a deterministic floor or by the owner.
7. Tickets are created by priority and dependency.
8. The tickets run through multi-agent pipelines in every lane.
9. Anything stuck comes back with an action, never a dead end.

## Target flow

```
New card popup ─► card (phase: grilling, column Shaping)
   │ Director auto-starts: survey (read tools) → one question at a time
   ▼
verifying ─► enhance pass (by lane) ─► plan vN written (Plan tab)
   │
   ├─ floor passes + Director confident ─► approved (auto)
   └─ else ─► needs_you (questions / Approve · Request changes · edit tickets)
   ▼
approved ─► tickets inserted (priority, depends_on, lane via preCheckLane)
   │        card column Queued until deps done / slot free
   ▼
in_progress ─► pipelines per lane ─► escalations (typed, Director first)
   ▼
done   (closed = collapsed strip)
```

## Invariants carried through every slice

- **Doors.**
  - Ticket status changes only through `transition()`.
  - Card phase changes only through the new `transitionCard()`.
  - Git changes only through `merge()`.
  - Tool use only through `admit()`.
  - Nothing bypasses a door.
- **Schemas.** Zod schemas in `@forge/core` are the source of truth (rule 4), and every LLM output is parsed at the boundary.
- **No dead ends.** Every waiting state offers at least one action (d-0135).
- **Tier C stays human** (d-0012). Auto-approval sits behind the deterministic floor (d-0141, item 6).
- **Cost warns, never blocks** (d-0143).
- **Config is data.** Playbooks, agents and pipelines are versioned config rows, edited through the UI, never stored as repo files (d-0085, d-0090).
- **Process per slice.** Tests come first (red, then green). Gates: `pnpm check` green, then a CI run. READMEs and PRODUCT.md are updated in the same commit.

---

## S1 — Card-flow foundation

**Goal.** Cards are created properly, carry a stored phase and dependencies, and wake the Director. The UI updates live.

**Scope**

- **core**
  - Schemas: `CardPhase` (grilling | verifying | plan_ready | approved | queued | in_progress | done | closed, plus a `needs_you` overlay flag); `CardRelation` (depends_on); `GrillQuestion` and `GrillAnswer` events; `PlanVersion` shape; `CardPriority` (low | normal | high | urgent, mapped to ticket integer priority).
  - Pure `transitionCard()` (CAS on `phase_version`) and `findCycle()`, shared by ticket and card edges.
  - The card-type flag `plan_approval` becomes `director_or_user | user`.
- **db**
  - Migration 0021:
    - adds `cards.phase`, `cards.phase_version`, `cards.priority`, `cards.links_json`;
    - adds the `card_relations` table;
    - adds `interactions.card_id` (nullable) and new interaction kinds;
    - adds the `card_reply_queue` table;
    - backfills phase from today's rollup (d-0141, item 7). Open cards with no tickets go to `needs_you` with a "Start planning" action; nothing is auto-queued.
  - Repositories and contract tests on both adapters.
- **engine**
  - Intake no longer inserts tickets for Plan or Issue cards (registry flip).
  - `create_ticket` is refused during planning phases.
  - A new card enqueues a Director wake.
  - The reply queue is durable (replaces the in-memory pending set), and new events only are queued.
- **server**
  - `POST /projects/:slug/cards`: title, description, type, priority, depends_on[], blocks[], links[]. Validated, cycle-checked (409 `dependency_cycle`), same project only.
  - `PATCH` for card relations.
  - Project-scoped SSE: an invalidate-only stream (`/projects/:slug/events`, event = query keys) with a project-scoped SSE ticket.
  - Polling remains as the fallback.
- **web**
  - Shared **Picker** component on Radix Popover (d-0154): rich rows, search, groups, keyboard, listbox/combobox roles.
  - "New card" popup on the existing `Modal` (d-0138 fields; inline validation; dependency pickers with a cycle error).
  - The "Ask the Director" box is removed from Board and Home, replaced by a New card button.
  - The SSE hook invalidates TanStack queries.

**Done when**

- A card can be created with dependencies.
- An attempted cycle is refused.
- DCP-C1 is backfilled to `needs_you` with "Start planning".
- No ticket appears at creation.
- Board, card and inbox views update within 1 s with no reload.
- Restarting the server keeps queued replies.

## S2 — Director planning (parallel with S3 after S1)

**Goal.** The Director grills, verifies, enhances, writes a versioned plan, and approves it or escalates. Approved plans become tickets.

**Scope**

- **Planning flow is a simple step list (d-0146).**
  - A small flow runner executes the card's ordered step list, one Director call per step, waiting in `needs_you` when a step needs the owner.
  - Step kinds: survey, grill, verify, enhance, write plan, approve and custom (research is added in S6).
  - Per step: on/off, `when` (always, by lane, Director decides), depth, and editable instructions.
  - Seed default flow v1: `survey → grill → verify → enhance (by lane) → write plan (locked) → approve (locked)`, then plan to tickets.
  - Stored as versioned config (company default plus project override); each card records the flow version it started with.
  - **Editable in the UI from S2:** Project settings → Director flow (reorder, toggle, edit, add custom steps). Locked steps cannot be removed.
  - The runner enforces the invariants, not the flow data.
  - This is not the ticket-pipeline engine.
- **Playbooks.** A `director_playbooks` section in company config, seeded with v1 of `plan-grill`, `verify-plan`, `enhance-decisions` (lane-scaled), `write-plan`, `plan-to-tickets` and `approve-plan`.
  - The step input carries the playbook text, the project rules (active decisions, rejected approaches, and the repo's `CLAUDE.md`/`AGENTS.md`, read-only) and the card's structured grill state.
  - Each step records the config version it used.
  - A read-only playbook view in the UI.
- **Read tools.** Forge-owned `read_file`, `grep` and `glob`:
  - delivered as an MCP server, or engine-side pre-read, whichever the S2 probe favours;
  - every call goes through `admit()` under a new `director` grant;
  - they read git-tracked files at HEAD only, capped per step in files and bytes;
  - each step logs one summary event listing the files read, as evidence.
  - Only the survey and verify steps get the tools.
  - `ENABLE_TOOL_SEARCH=false`; per-step timeouts come from config.
  - **Probe first:** confirm that `claude -p` with Forge MCP tools and `--permission-prompts none` behaves as expected on 2.1.301.
- **Steps.** New Director step names `card_survey`, `grill_turn`, `verify`, `enhance`, `write_plan`, `approve_plan` (tool-less, over typed findings) and `plan_to_tickets`, each with a zod output schema.
- **Grill state.** Stored on the card: open points, answers, assumptions.
  - Zero-question path for clear, small cards.
  - "Use recommendations for the rest" and "Enough, write the plan".
  - No auto-answer: an unanswered card follows the d-0112 nudges.
- **Plan versions.** Stored with a diff against the previous version, plus the stored enhance report.
- **Approval floor.** Deterministic: no tier-C glob hit, no rejected/ hit, no overlap of planned files with another approved card, and HEAD has not moved under those files since verify.
  - If the floor passes and the step says approve, the plan is auto-approved.
  - Otherwise the card goes to `needs_you` with questions.
  - "Always ask" forces the owner.
- **Plan to tickets.** Tickets are inserted as `inbox` with priority and `depends_on`, then given a `triaged` event carrying the plan's lane after `preCheckLane`/`decideLane` (can only raise).
  - **Non-Express planned tickets stay held** with Run as Express / Wait for pipeline actions until S5a lands.
- **Budget.** The card budget counts Director steps; crossing it gives a warning only (d-0143).
- **Director settings page (d-0150).** Models per step type, harness, house rules, the flow editor, approval mode, grill style, budget warning and limits. Locked invariants are shown greyed with their reasons.

**Done when**

- On a test project, "TODO app" produces a grill (questions with options), a plan v1 with files read as evidence, and an auto-approval or Needs you per the floor.
- Request changes produces v2 with a diff.
- Approval creates ordered tickets with dependencies.
- Every step is recorded with its config version.

## S3 — Card page and board UI (parallel with S2 after S1)

**Goal.** The chat-first card page and the new board, live and animated.

**Scope**

- **Card page.**
  - Chat is the main column; Plan / Tickets / Details are in a side panel (tabs on a phone).
  - Message renderers:
    - Grill question: option buttons, Recommended badge, Other, Use recommendations, open-point count.
    - Your answer.
    - System line.
    - Plan ready, with a Review button.
    - Pinned Needs-you banner.
    - Budget warning.
- **Plan tab.** The fixed sections of d-0132, a version picker with diff, Approve / Request changes, and light ticket edits (rename, reorder, remove, priority).
- **Board.**
  - Columns: Shaping / Needs you / Queued / In progress / Done, plus a collapsed Closed strip. All fit at 1440 px.
  - Card face: phase line, priority marker, progress bar, Blocked by / Blocks chips.
  - Hover or focus highlights the card's dependency chain.
  - Cards glide between columns with shared-layout animation, respecting reduced motion. Stress-test with 50+ cards.
  - The current uncommitted board redesign is folded in.
- Every native `<select>` is replaced by the Picker (d-0154).
- `ui-screen-map.md` is updated (Ask bar and New column removed).
- Hallmark and Nielsen passes are required.

**Done when**

- Playwright screenshots at 375, 768 and 1440 px are clean.
- Every state is reachable by keyboard.
- Phase changes animate live from the SSE stream.

## S4a — Ticket escalations (question, failure, setup)

**Goal.** Stuck tickets get the Director first, then a typed escalation with actions, shown in one place everywhere.

**Scope**

- **Director first.** It answers a Worker question from the plan, decisions, memory and code; retries or adjusts within the plan on failure; waits or reroutes on quota and approval waits.
- **Escalation kinds** on `Interaction`:
  - `question`: suggested answer, option buttons.
  - `failure`: diagnosis, what was tried; Retry / Re-plan / Cancel.
  - `setup`: unapproved tool, missing login; "Fix in settings", auto-resume once fixed.
- **One item, three places.** Card chat, ticket AnswerPanel and Inbox. Answering in one settles it everywhere, live.
- **Existing parks.** Tickets parked by the M0 rule (DCP-1) get Run as Express / Re-plan, and rework-cap parks get Retry / Re-plan / Cancel.
- **Rule.** A waiting state with no action fails a test.

## S5a — Agents (d-0147 – d-0149, d-0153, d-0155)

- **Agent store.** Versioned config records with the d-0148 fields, at company and project level, with override, disable and duplicate (d-0149).
- **Agents area UI.** Forge settings → Agents and Project settings → Agents (effective list with tags).
- **"Runs on" (d-0153):**
  - harness picked from connected harnesses only, with health;
  - models listed from the driver (`capabilities()`), refreshed on each compatibility check;
  - a true "Harness default" and custom model ids;
  - an ordered fallback list;
  - Test agent (a one-turn probe).
- **New agents.** Template gallery (seed data) and Director-drafted agents (d-0155).
- **Express ported.** Express runs its implementer from the agent store, with no behaviour change.

## S5b — Stage runner, lane pipelines, Standard lane (d-0151, d-0152)

- **Stage runner.** The ticket-pipeline engine (separate from the planning flow runner) over agent, script-gate, run-together-group and human stages, with typed artifacts (d-0070).
- **Fixed invariants:**
  - no agent approves its own work;
  - one merge door;
  - `transition()` for every move;
  - lanes only escalate.
- **Three lane pipelines per project.**
  - List editor with routing rules and save-time validation.
  - Company defaults with Reset.
- **Standard lane goes live** with the test-writer, implementer, reviewer and gates. The Express-only hold is removed and held tickets resume.

## S5c — Full lane, sign-off and decision escalations (with S4b)

- **Full pipeline:**
  - optional critic, labelled same-family until a second harness exists;
  - parallel writers within `max_concurrent_per_project`;
  - Director check against the plan, using typed artifacts only;
  - sign-off: the Director signs Tier A/B, Tier C stays human.
- **S4b:** decision and sign-off escalation kinds. A high or critical finding holds the merge.

## S5d — Director per-ticket adjustments and scorecards

- The Director adjusts a per-ticket copy of the lane pipeline, with reasons recorded and shown in the plan.
- It proposes "add to project pipeline" when it repeats the same adjustment (d-0151).
- Scorecards (d-0081). The fallback execution path (d-0080) uses the S5a fallback lists.

## S6 — Research in planning (d-0144)

- **Research port.** Web search and fetch behind an adapter interface in core, so the provider can be changed. First adapter: decided at S6 brief time (e.g. self-hosted SearXNG plus fetch).
- **`research` stage** in the planning flow:
  - It runs between grill turns when the Director flags a question needing outside facts, and before `write_plan` when the plan rests on outside claims.
  - Its own grant: no code tools. Fetched content is fenced as untrusted data.
- **Evidence.** Cited on the card (URL, quote, retrieval time) and shown in the plan's verification section. Unsupported claims are marked unverified.
- **Agents.** Worker agents get research only when their agent definition grants it (d-0078).
- **Budget.** Counts toward the card budget, as a warning only (d-0143).

---

## Before S1

1. **Commit the current verified work** (owner approval per commit):
   - settings redesign, notifications, folder picker, Add project popup, any-folder projects;
   - delete project, inbox fixes, tooltip, notification steps, board redesign (WIP, folded into S3);
   - decisions d-0127 – d-0143 and these briefs.

   Run a clean `pnpm check` first. It was stopped earlier by low memory.
2. Push, and confirm CI is green on all three OSes.

## Run mode

- **Autonomous (chosen, d-0156):** slices run in the order above. Each slice gets a builder brief, red-then-green tests, and the gates run by the orchestrator. Each slice is committed and pushed, with one push per slice. The run stops only for a decision that belongs to the owner.
- **Check-in:** a report after each slice, and the owner says go before the next.

## Risks

| Risk | Mitigation |
|---|---|
| The read-tool probe fails (claude ignores MCP tools under `-p`) | Fall back to engine-side pre-read: the survey step returns file requests and the engine reads them through `admit()`, then a second step. |
| A long grill exceeds the Director context | Structured grill state on the card, not raw history. |
| Prompt injection from repo text | Approval runs in a tool-less step behind the deterministic floor. Read tools are git-tracked only. |
| S5a is large | The stage runner lands with Express parity first, then Standard. |
| Animation jank with many cards | Stress test and virtualisation in S3. |
