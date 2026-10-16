# S3 — Card page and board UI (builder brief)

Plan: `docs/briefs/card-first-flow-plan.md` §S3. Decisions: d-0132, d-0133, d-0135, d-0139,
d-0154. Web only (`apps/web`). Runs in parallel with S2; code against the **event and HTTP
contract in `docs/briefs/s2-director-planning.md`** and the S1 card view fields. Stub the
server in tests with the existing fetch-stub / fake-forge helpers. Invoke the `hallmark`
skill first, then run a Nielsen pass (`nielsen-heuristics`) on each screen before reporting.

Do not touch Forge settings or Project settings routes (S2-B owns them).

## Card page (`routes/card/*`)
- Layout: chat is the main column; a side panel with tabs **Plan / Tickets / Details**; below
  768 px the panel becomes tabs **Chat / Plan / Tickets / Details**.
- Message renderers by card event kind:
  - `grill_question`: question text, optional "why", 2–4 option buttons (Recommended badge on
    the recommended one), "Other…" free text, "Use your recommendations for the rest",
    "Enough, write the plan", open-point count. Answered questions collapse to the chosen
    answer. Only the latest open question is actionable.
  - `grill_answer` as the owner's bubble; `by: recommendation` labelled.
  - `step_started`/`step_finished` as quiet system lines ("Read 12 files" expandable list).
  - `plan_ready`: card with version, ticket count and a **Review plan** button (opens Plan tab).
  - `plan_approved`, `plan_changes_requested`, `grill_done`, `budget_warning`, `note` as system lines.
  - `needs_you`: a pinned banner at the top of the chat with the reason and its action buttons
    (every listed action wired; no dead ends, d-0135). `start_planning` calls
    `POST /cards/:id/start-planning`.
- Free-text chat composer stays (posts `user_message` as today).
- Pending Director state: "Director is thinking…" indicator while a step runs (from the last
  `step_started` without a matching `step_finished`).

## Plan tab
- Fixed sections of d-0132 in order: Goal, Scope / Non-goals, Decisions, Assumptions,
  Verification (blast radius, files read, overlaps, matching decisions, rejected hits, risks),
  Tickets (ordered list: title, what, priority, depends on, lane/size, acceptance criteria) with a
  small dependency graph (simple SVG layered by depth; no new chart library), Card links.
- Version picker (v1, v2…) with a diff view against the previous version.
- In `plan_ready`: **Approve plan** (confirm dialog "Creates N tickets in this order: …"),
  **Request changes** (comment dialog), light ticket edits (rename inline, reorder up/down,
  remove, priority Picker) via `PATCH /cards/:id/plan/:version/tickets`; show 409 errors inline.
- Floor result shown when present (pass, or reasons).

## Board (`routes/board/*`)
- Columns from server `column`: **Shaping / Needs you / Queued / In progress / Done** plus the
  existing collapsed Closed strip. All fit at 1440 px without horizontal scroll.
- Card face: title, phase line ("Grilling · 3 open points", "Plan v2 ready", "4/7 tickets"),
  priority marker, progress bar (done/total tickets), **Blocked by** / **Blocks** chips.
- Hover or keyboard focus on a card highlights its dependency chain (dims others).
- Cards glide between columns on phase change with `motion` shared-layout (`layoutId`), and
  status chips morph; `prefers-reduced-motion` → no movement, instant swap.
- Stress: a test renders 60 cards without errors; keep renders cheap (memoised tiles).
- Keyboard: every state and action reachable; visible focus.
- Update `docs/design/ui-screen-map.md` (Ask bar and New column gone; new columns, card page layout).

## Tests (vitest web, AAA)
Grill question renders options and posts the answer; shortcuts post; plan tab sections and
version diff; approve confirm posts and shows tickets; request changes; ticket edit 409
shown; needs_you banner actions all wired; board columns from `column`; dependency
highlight; reduced motion path; 60-card render.

## Visual check
After gates, build (`pnpm -C apps/web build`) is done by the orchestrator. Builder: capture
Playwright screenshots at 375, 768, 1440 px of board and card page against the Vite dev server
with fake data if a script exists; otherwise say so.

## Gates
`pnpm typecheck`; `pnpm lint --fix` then `pnpm lint`; `pnpm prettier --write/--check <changed>`;
`pnpm vitest run --project web --maxWorkers=2 <changed + new tests>` plus existing tests of
modified files. ~2 GB free RAM; never the full suite. No commits/pushes/worktrees. LF.
`apps/web/README.md` current. Do not edit PRODUCT.md (orchestrator adds the line).
