# Card and ticket page redesign (d-0172)

Research and audit: `docs/briefs/card-page-redesign-research.md` (read it first: sections A
for the current code map, C for Option B). This brief is the build contract.

## Goal

The owner can always read and type in the chat. Everything that waits on the owner sits in
one place, one item at a time, whatever the number of items. The plan (or a ticket's work)
is reviewed beside the chat, not instead of it.

## Layout (Option B)

- **Header, one row (~48 px):** back link, id, title (truncates), one status pill (phase or
  state + "Needs you" when waiting), cost, and a `⋯` menu holding Change type and Close card
  (both keep their confirm dialogs). The type dropdown no longer sits in the header.
- **Main column:** the chat transcript (most of the height) and the composer, always
  visible. One scroll container for the transcript, no nested scrolling.
- **Needs-you dock, directly above the composer:** one item open at a time with `n of N ‹ ›`
  (arrow keys and buttons), a short title, reason chips, `Reasons ▾` for the full list,
  at most one primary and one secondary action, and a one-line list of the other items.
  Its height does not grow with N; with N = 0 it is not rendered. Phones: collapsed to one
  line while the composer has focus.
- **Item kinds:** plan approval (Approve plan… / Request changes), open Director question
  (options as buttons, recommended badge, "use your recommendations for the rest" if it
  exists today; typing in the composer answers it, so the separate "Other…" box goes),
  ticket escalations / held tickets / Worker questions, start-planning, step budget raise,
  offline and refresh errors (offline/refresh errors as a slim status line, not an item).
  Budget warnings stay quiet chat lines and Inbox items (d-0143).
- **Transcript:** keeps a one-line record for each item (raised, answered, approved) instead
  of buttons; drop redundant cards and step lines that repeat what the dock says.
- **Side rail (≥ 1280 px, 400–440 px wide, resizable not required):** Plan, Evidence,
  Tickets, Details as rail tabs, with the plan's approval reasons at the top of Plan.
  1024–1279 px: rail becomes tabs above the chat area as today but the dock stays above the
  composer. Phones: rail content opens as a full-screen sheet from the header.
- **Ticket page:** same frame. Main column is the ticket thread + composer; dock carries the
  ticket's waiting items (approval / sign-off, Worker questions, holds, gate failures that
  need the owner); rail carries the ticket's existing secondary panels (runs, diff/files,
  checks, details — keep what exists, only move it).

## Server (same change)

1. Needs-you events carry structured data: optional `kind`
   (`plan_approval | director_questions | step_budget | start_planning | held_ticket | …`),
   `title`, `items: string[]` (floor reasons, questions). Engine stops joining reasons with
   `'; '` / `' '` for the UI (`planning-plan.ts`, `planning-state.ts` askOwner); `reason`
   stays for old readers. Old events still parse (zod defaults).
2. `GET /cards/:id` (and the ticket detail) carries the current needs-you item(s) so the dock
   does not depend on which history window is loaded.
3. Typed floor-reason codes: not in this change (the web maps known prefixes, falls back to
   text).

## Quality bar

- Hallmark + Nielsen run before building and again on the built screens; responsive at 320,
  375, 414, 768, 1280, 1600 px; no horizontal scroll; keyboard: `j/k` or arrows in the dock,
  Ctrl+Enter sends, Esc closes sheets; focus lands sensibly after approve/answer.
- Pure view logic in `apps/web/src/domain/` (attention items, transcript records) with unit
  tests; route tests for 0, 1 and 3 waiting items, an open question answered from the
  composer, plan approval from the dock and the rail, phone collapse.
- Contract and engine tests for the structured payload; old events still render.
- READMEs, `docs/design/ui-screen-map.md` and `PRODUCT.md` updated.

## Build order

1. Server payload + detail field (one builder).
2. Card page: shared dock, rail, header, transcript records (one builder).
3. Ticket page on the shared pieces (one builder).
