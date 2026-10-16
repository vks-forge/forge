# S1 — Card-flow foundation (builder brief)

Plan: `docs/briefs/card-first-flow-plan.md` §S1. Decisions: d-0128, d-0129, d-0132,
d-0134, d-0138, d-0141 (items 1, 2, 5, 7), d-0143, d-0154. Review:
`docs/briefs/card-first-flow-enhance-report.md`.

Two builders work in parallel against the API contract below:
- **S1-A:** backend (core, db, engine, server).
- **S1-B:** web.

Neither edits the other's packages. Both read `.claude/rules/code.md` first.

## API contract (shared, binding for both)

### Card view (every card read returns these fields in addition to today's)

```ts
phase: 'grilling' | 'verifying' | 'plan_ready' | 'approved' | 'queued' | 'in_progress' | 'done' | 'closed';
needs_you: boolean;        // overlay: Director waits on the owner (or a ticket does)
phase_version: number;     // CAS counter
priority: 'low' | 'normal' | 'high' | 'urgent';
links: string[];           // http(s) URLs
depends_on: CardId[];      // this card waits for these
blocks: CardId[];          // reverse view: these wait for this card
column: 'shaping' | 'needs_you' | 'queued' | 'in_progress' | 'done' | 'closed'; // derived (d-0139)
```

### Column rollup (d-0139)

| Card state | Column |
|---|---|
| `needs_you` is true | `needs_you` (wins over everything except closed) |
| phase grilling, verifying or plan_ready | `shaping` |
| phase approved or queued | `queued` |
| phase in_progress | `in_progress` |
| phase done | `done` |
| phase closed | `closed` |

A card's `needs_you` is true when the card itself waits on the owner, or any of its tickets is `waiting_human` or has a pending interaction.

### `POST /projects/:slug/cards` — create a card (replaces chat intake for the UI)

Body (strict):
```json
{ "title": "4..120 chars", "description": ">= 20 chars markdown",
  "type": "plan|discussion|issue", "priority": "low|normal|high|urgent",
  "depends_on": ["DCP-C1"], "blocks": [], "links": ["https://..."],
  "dedupe_key": "uuid" }
```

On success:
- **201** `{ card }`.
- Phase is `grilling` for plan and issue cards. A discussion card is also stored as `grilling` but is never grilled (d-0141, item 3); the Director only talks.
- **No ticket is created.**
- A Director wake is enqueued (durable).
- `card_events` gets the `user_message`, with the title plus description as text.

Errors:
- 400 `invalid_request` (zod issues);
- 404 `project_not_found` / `card_not_found` (an unknown dependency id);
- 400 `cross_project_dependency`;
- 409 `dependency_cycle` with `{ cycle: CardId[] }`;
- the same `dedupe_key` returns the first card (200).

### `PUT /cards/:id/relations` — set dependencies

Body `{ depends_on: CardId[], blocks: CardId[] }`. Same validation, same cycle error. Returns 200 `{ card }`.

### `GET /projects/:slug/events` — project live stream (SSE, invalidate-only)

- Authenticated with a **project-scoped SSE ticket**, the same mechanism as the existing run-scoped ticket (`services/auth/sse-tickets.ts`), minted by an endpoint next to the run one.
- Each message: `event: invalidate`, `data: {"keys":[["cards","<slug>"],["card","DCP-C1"],["tickets","<slug>"],["inbox","<slug>"]]}`.
- Heartbeat comment every 25 s.
- No replay: on reconnect the client refetches everything.
- The server emits after any write to cards, card events, card phase, relations, tickets, interactions or inbox states of that project.

Existing endpoints keep working. `POST /intake` (chat) is kept for API compatibility but now creates a card with no ticket, the same as above.

## S1-A backend

### core (`packages/core`)

- **`schemas/card.ts`:** add `CardPhase`, `CardPriority`, the new `Card` fields, `CardColumn` values per the rollup, and `CardRelation` (`{ from: CardId, to: CardId, kind: 'depends_on' }`).
- **`schemas/card-type.ts`:**
  - `issue.tickets_on_intake` becomes false;
  - `plan_approval` becomes the enum `'director_or_user' | 'user'`;
  - the `pr_issue` fast path is unchanged.
- **`domain/card-phase.ts`:** pure `transitionCard(card, event)` → Result. CAS on `phase_version`; legal moves only; `needs_you` set or cleared by events. Property tests.
- **`domain/graph-cycle.ts`:** pure `findCycle(edges, newEdges)` → `CardId[] | TicketId[] | null`, generic over the id type. Used for card relations now and ticket relations later (d-0110). Property tests.
- **`domain/card-rollup.ts`:** the column rollup per the table above.
- **Grill and plan event schemas:** add `GrillQuestion`, `GrillAnswer` and `PlanVersion` placeholders only if needed by types; S2 owns the content.

### db (`packages/db`)

- **Migration `0021-card-flow.ts`:**
  - **`cards` columns:** `phase` TEXT NOT NULL with a CHECK; `phase_version` INTEGER NOT NULL DEFAULT 0; `needs_you` INTEGER NOT NULL DEFAULT 0; `priority` TEXT NOT NULL DEFAULT 'normal'; `links_json` TEXT NOT NULL DEFAULT '[]'.
  - **`card_relations` table:** (from_card, to_card, kind, created_at); PK (from_card, to_card, kind); both columns reference cards; same-project enforced in code.
  - **`card_reply_queue` table:** (id, card_id, event_id, reason, enqueued_at, claimed_at NULL, done_at NULL). A durable queue of new events only.
  - **`interactions.card_id`** TEXT NULL. New interaction kinds are added by S2/S4, not here.
- **Backfill** (d-0141, item 7):
  - cards with tickets: phase from today's rollup, `in_progress` or `done`;
  - closed cards: `closed`;
  - open cards with no tickets: phase `plan_ready` and `needs_you = 1`, with a "Start planning" note event;
  - nothing is enqueued, so old cards are never auto-grilled.
  - DCP-C1 has a ticket (DCP-1, waiting_human), so it maps to `in_progress` with `needs_you`.
- **Repositories** on both adapters: card phase update (CAS), relations CRUD, reply queue (enqueue, claim, complete; claim is atomic). Add the contract tests.
- `packages/db/README.md` updated.

### engine (`packages/engine`)

- **`tick/intake.ts`:** a new request creates the card (phase `grilling`), writes the `user_message` and **enqueues a Director wake**. No ticket for any type except `pr_issue`.
- **`tick/card-chat*.ts`:** the pending set moves from `state.chat.pending` (memory) to the durable `card_reply_queue`. `card-chat-post` enqueues; `runCardChats` claims and completes. A restart resumes unclaimed and stale-claimed items (claim older than 10 min).
- **`tick/card-chat-actions.ts` / `core/domain/card-chat-actions.ts`:** `create_ticket` is refused while the card phase is grilling, verifying or plan_ready (refusal note: "tickets are created when the plan is approved").
- **Phase changes** go only through `transitionCard`.
- **Card budget** (d-0143): crossing it writes a `budget_warning` card event once per threshold. It **never refuses** an action. Remove the refusal currently in card-chat actions ("a card over its budget cap files nothing more").
- The S1 Director reply is still today's `card_chat` step (S2 replaces it with the planning flow). It now also runs for newly created cards because of the enqueue.

### server (`apps/server`)

- Routes per the contract: `routes/card-create.ts`, `routes/card-relations.ts`, `routes/project-events.ts`, and the project SSE ticket minting next to the run one. Register them in `routes.ts`.
- Body schemas go in `src/schemas/api.ts`.
- **Event bus:** one in-process `ProjectEvents` emitter (service) that the storage-writing paths call after commit. Keep it simple: services and routes that write call `projectEvents.invalidate(slug, keys)`; the engine gets it as a port.
- Tests:
  - create (201, no ticket, wake enqueued, dedupe);
  - validation errors;
  - unknown dependency;
  - cycle (409 with cycle);
  - cross-project;
  - relations PUT;
  - SSE auth and an invalidate message after a create;
  - intake no longer makes tickets;
  - restart resumes the queue.
- READMEs updated.

## S1-B web (`apps/web`)

### Picker (`components/ui/picker.tsx`, d-0154)

- Built on `@radix-ui/react-popover`. Pin the version whose internals match the installed dialog 1.3.1 / tooltip 1.4.1 family (`@radix-ui/primitive` 1.2.0, `react-dismissable-layer` 1.2.1). Check with `npm view` and add the reason to the README.
- **Props:** `items` (value, label, description?, icon?, badge?, disabled?, disabledReason?, group?), `value`, `onChange`, `placeholder`, `searchable?`, `multiple?` (for the dependency pickers), `label` (accessible name), `size`.
- **Accessibility:** combobox with a listbox, roving active option, typeahead, Home/End, Escape closes, focus returns to the trigger.
- Theme tokens; reduced-motion aware.
- **8-state demo coverage in tests:** default, hover, focus, active, disabled, loading (async items), error, empty.

### New card popup (`routes/board/new-card-dialog.tsx` or `components/cards/new-card-dialog.tsx`)

- Uses the existing `components/ui/modal.tsx` (large; backdrop inert; dirty close asks to discard).
- **Fields** per d-0138:
  - Title, Description (textarea with hint);
  - Type and Priority as Pickers;
  - Depends on and Blocks as searchable multi-Pickers over the project's open cards (from the cards query);
  - Links as a URL list with add and remove.
- Inline zod validation; Create is disabled until valid.
- Server errors are shown inline: `dependency_cycle` names the cycle ("DCP-C3 already depends on this card").
- **On success:**
  - close the popup;
  - show a success notify ("Card DCP-C2 created");
  - navigate to the card page;
  - the card page shows "Director is reading the project…" until the first Director message arrives.
- `dedupe_key` is a uuid per popup open, so a double click never creates two cards.

### Remove Ask the Director

- Delete `routes/board/ask-director.tsx` and its uses in `board-page`, `board-header`, `board-empty` and `home-page`.
- Add a **New card** button: board header (primary), Home (in the "Waiting on you" or top area), and the board empty state ("Create your first card").
- Update the tests that referenced the composer.

### Live updates

- `api/sse/watch-project-events.ts`: mints a project SSE ticket, opens an EventSource, and calls `queryClient.invalidateQueries` for each key. Reconnect with backoff; on reconnect, invalidate everything for the project.
- Mount it once in the project scope (`routes/project-scope.tsx`).
- **Keep polling** as a fallback, but raise the intervals (e.g. 30 s) while the stream is connected.

### Card view fields

Board and card page consume the new fields:
- column from the server;
- **minimal S1 display:** a phase label and dependency chips on the card face. The full board redesign is S3; don't restyle beyond what is needed.

### Tests

Vitest, AAA, `__tests__/helpers/fetch-stub.ts`, and the fake-forge helpers:
- Picker keyboard and a11y;
- popup validation;
- cycle error rendering;
- create flow and navigation;
- Ask the Director gone;
- the SSE hook invalidates queries (mock EventSource).

## Gates (each builder runs for its own scope)

1. `pnpm typecheck`.
2. `pnpm lint --fix`, then `pnpm lint`.
3. `pnpm prettier --write <changed>`, then a check.
4. `pnpm vitest run --maxWorkers=4 <changed and new test files>` (`heavy` project for git, process or server tests; see `vitest.config.ts`).

The machine has about 2 GB of free RAM: never run the full suite, keep workers at 4 or fewer. No commits, pushes or worktrees. LF endings. PRODUCT.md progress-log line (newest first) and README updates in scope.
