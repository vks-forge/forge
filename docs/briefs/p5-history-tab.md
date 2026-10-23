# Phase 5.1: History tab on tickets and cards (builder brief)

Items P and X4 of `next-work-queue.md`; plan step 5.1. Binding: `.claude/rules/code.md`, d-0132 (project stream is
invalidate-only), d-0134 (card events), d-0176. Copy is plain language (the owner does not code).

## Problem

Cards and tickets move through many states (Planned, In Progress, Needs you, Review, Done) and the owner cannot see
what a card or ticket went through or why. The facts exist, spread over `card_events` (kinds: ticket_state with an
optional reason, escalation, escalation_settled, interaction_opened / answered, note, step_started / finished,
grill_*, plan_ready / approved / changes_requested, replan_requested, director_action, research, budget_warning,
ticket_created, card_closed), `interactions`, `runs`, `stage_runs`, `wake_requests` and `gate_results`.

## Design

1. **Core** (`packages/core`): zod `HistoryEntry` = `{ at, kind (state | question | answer | run | check | director |
   setup | merge | plan | note), actor: { type: owner | director | engine | worker, name? }, title, detail?,
   from?, to?, ticket_id?, links: { run_id?, interaction_id?, stage_id?, card_id? }, waited_ms? }` and a pure
   `buildHistory(facts)` that merges and orders the sources and writes the plain-language title per entry (one
   copy table, e.g. "Sent back: the reviewer found zod missing from package.json", "Waited for a Worker slot (CHE-3
   had it)", "Signed off by you and merged", "Question unanswered for 2 days, timed out"). State changes with no
   stored reason get the best reason from neighbouring facts (the escalation settled at the same moment, the wake
   that started the run), never invented text.
2. **Server**: `GET /tickets/:id/history` and `GET /cards/:id/history` (card = its own phases plus one roll-up line
   per ticket event, each linking to the ticket's history), paged by time, zod response schemas.
3. **Engine** (small): where a state change happens without a reason today (e.g. an answer moving a ticket to
   In Progress, a re-plan cancel, a Director auto-action), write the reason on the `ticket_state` event payload so
   history does not have to guess. No other behaviour change.
4. **Git trailers (X4)**: Worker commits carry `Forge-Ticket: <id>` and `Forge-Run: <run id>` trailers, added by the
   commit path Forge already controls (commit identity / commit-msg hook in packages/git); a test checks the
   trailers. Language-neutral: git only.
5. **Web**: a History tab on the ticket page (`routes/ticket/tabs/`) and the card page (`routes/card/tabs/`):
   entries grouped by day, newest last with a toggle, actor icon + title + time, long detail folded behind "Show
   more", filters "Status changes only" and "Needs you only", each entry links to its run, review, question or
   ticket. Live refresh through the existing project stream invalidation. Builder invokes hallmark and
   nielsen-heuristics first.

## Tests (red first)

Core `buildHistory` cases (ordering, reason inference from neighbours, waited time, card roll-up); engine: reasons
written on the changes listed in item 3; server route tests; git trailer test; web tab tests (grouping, filters,
fold, links).

## Builder steps

- **5.1a backend**: items 1-4.
- **5.1b web**: item 5.
