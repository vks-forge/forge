# Phase 2: honest status and Needs you (builder brief)

Items N, C, Q1-Q3, S3 of `next-work-queue.md`; plan steps 2.1-2.2 of `next-work-plan.md`. Binding:
`.claude/rules/code.md`, d-0097, d-0134, d-0176. Owner-facing words are plain (the owner does not code).

## Problem (seen live 2026-10-22 on card CHE-C1)

- CHE-6 showed **In Progress** while no Worker ran: the owner's "Send back for rework" moved it to `in_progress`
  at once, but the only Worker slot was held by CHE-3 (N).
- CHE-2 sat in **Planned** 75 s behind CHE-6's install with no reason shown on the board (C). The reason exists, but
  only on the ticket page: `explainWait` (`packages/engine/src/tick/explain.ts`) returns one string per ticket
  (`cap: per-project 1/1`), not who holds the slot.
- CHE-6 stayed in **Needs you** after the owner answered "Re-plan": status `waiting_human`, no open item; the real
  owner item was the card's plan approval (Q1, Q2). The card's `needs_you` overlay counts any waiting ticket
  (`apps/server/src/services/card-view.ts`).

## Design

1. **Core** (`packages/core`): zod `TicketPhase` = `queued` (status says working but no live run, setup or check),
   `setting_up`, `waiting_slot`, `waiting_deps`, `held_by_plan` (card re-planning), `paused_quota`, `backing_off`,
   `working`, `checking`, `waiting_you` (an open owner item exists), `stuck` (waiting_human with no open item),
   `done`, `cancelled`; and `TicketWait` = `{ phase, text, holders?: TicketId[], blockers?: TicketId[], card_id?,
   since? }`. One pure function `derivePhase(facts)` from plain facts (status, live run?, setup job?, check job?,
   open owner items count, scheduler wait reason if any, card phase). Unit tests per phase.
2. **Engine**: `explainWaits(ticketIds)` batches one `planDispatch` for many tickets (the board must not run one per
   tile) and returns `TicketWait` per id. The `cap` wait names the holders: tickets with live runs, setup jobs or
   brief jobs in that project (from `state.pumps`, `state.prepJobs`, running runs). Keep `explainWait` (string) as a
   thin wrapper so the ticket page does not break. A ticket in `waiting_human` with no open interaction is logged once
   (`warn`) and gets phase `stuck` with the latest settled escalation's next step ("You chose Re-plan: waiting for the
   new plan of CHE-C1") or `held_by_plan` when its card is in a planning phase.
3. **Server**: ticket list rows, card view tickets and the ticket detail carry `wait: TicketWait`. The card's
   `needs_you` overlay and every Needs-you count are true only for open owner items (pending interactions of kinds
   the owner answers, the card's own plan approval / question). After an answer, the answer response includes a
   `next` line (what happens now) taken from the same derivation.
4. **Web** (separate step): a phase chip and the wait line on board ticket tiles and the ticket header, e.g.
   "Queued: waiting for a Worker slot (CHE-3 is working)", "Held: CHE-C1 is re-planning (waiting for your
   answers)" linking to the card; Needs-you lists read only open items; after an answer the item leaves at once and a
   short line shows `next`. Builder invokes hallmark and nielsen-heuristics first.

Not in scope: changing the ticket state machine, the history tab (P), live run timers (Y).

## Tests (red first)

Core `derivePhase` table test; engine test: answer "rework" while the only slot is busy → status stays `in_progress`
but `wait.phase = queued` with holder; engine test: waiting_human ticket whose card is re-planning → `held_by_plan`,
not counted in Needs you; server tests for list/card/detail fields and the Needs-you count; web tests for the chip
and the line.

## Builder steps

- **2.1 backend**: core + engine + server (items 1-3). Gates: tsc, eslint, prettier, unit, heavy if engine
  scenarios run there, golden unchanged.
- **2.2 web**: item 4 plus Needs-you list filtering. Gates: tsc, eslint, prettier, web tests, `pnpm -C apps/web build`.
