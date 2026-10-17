# UI pass U1: tabbed card and ticket pages, cost everywhere, shared surfaces (builder brief)

Status: owner asked 2026-10-17, autonomous run (d-0164). Web + a small backend part. Builders
read `.claude/rules/code.md` first; web builders invoke `hallmark` (redesign scope, existing
tokens and theme, no new colours or fonts) and run a Nielsen pass per screen before reporting.

## Owner asks (verbatim intent)

1. **Card page** (`/p/:slug/cards/:id`) and **ticket page** (`/p/:slug/tickets/:id`) become
   tabbed, and the tab is in the URL (`/cards/DCP-C2/conversation`, `/plan`, `/tickets`,
   `/details`; ticket: `/conversation` = Worker thread + steer box, `/review` (shown when it
   waits on review/sign-off, else hidden), `/runs`, `/details`). Unknown tab → default tab
   (`conversation`), back/forward works, deep links work, the tab keeps scroll per tab.
   "Do your experiment and give me almost perfect sections."
2. **Chat tab redesign** (card chat and the Worker thread): the input box is **fixed at the
   bottom** of the viewport (the message list scrolls above it; works on mobile with the
   on-screen keyboard: `dvh`, safe-area inset). Bubbles are **narrow** (max ~70% / 36rem) and
   **less highlighted** (quiet surface, hairline border, no saturated fills; owner messages
   right-aligned, Director/Worker left). Timestamps grouped, consecutive messages from the same
   author grouped. Tool calls stay compact rows.
3. **Tickets in the left sidebar**: a project nav entry "Tickets" → a list page of every
   ticket of the project (id, title, card, lane, state, cost, updated), filter by state/lane,
   search, server-side pagination, row opens the ticket page.
4. **Cost per card and per ticket**: ticket shows its runs' cost (sum, per run in Runs tab);
   card shows Director cost (its planning/chat steps) + all its tickets' run cost, the total
   and the split. Show on the card/ticket headers (Details tab has the breakdown), on Board
   tiles (small), and in the Tickets list.
5. **Empty states**: one redesigned `EmptyState` component used on every page (the current
   "No runs here" card is disliked). Make it feel designed: no boxed card floating at 600px,
   centred in the content area, a quiet illustration/icon treatment, a one-line title, one line
   of help, and a primary action when one exists. Replace every placeholder/empty block.
6. **Cost page** (`/p/:slug/cost`): "Top runs" and "Top tickets" get **server-side
   pagination**. "Spend per day (USD)" bars show the app's own tooltip (the shared Radix
   `Tooltip`), not the browser's native `title`. Check every chart in the app for native
   `title` tooltips and switch them.
7. **Scroll areas**: a `ScrollArea` component (thin, quiet, themed scrollbar, visible on
   hover/scroll, keyboard and wheel work, no layout shift) used wherever content scrolls in a
   box (thread, chat, drawers, tables, pickers, code/pre blocks). Global thin scrollbar styling
   for the page itself too.
8. **Settings redesign with left-side tabs**: Forge settings (`/settings/general`, `/director`,
   `/limits`, `/harnesses`, `/github`) and project settings (`/p/:slug/settings`) use a
   two-column layout: a left vertical tab list (sticky), the section on the right; each tab is
   a URL (`/p/:slug/settings/<section>`); on mobile the tabs collapse to a top picker.
9. **Inbox notifications**: when a new Inbox item arrives (the existing SSE/project events or
   inbox polling), show an in-app toast (title, project, "Open"), bump the sidebar badge, put
   the count in the document title, and, if the owner allowed it, a browser Notification when
   the tab is hidden. A setting to turn browser notifications on (permission asked on click,
   never on load). No duplicate toasts for the same item; toasts stack, auto-dismiss, keyboard
   reachable, `aria-live`.

## Split

- **U1-A backend (core/db/engine/server):** cost rollups (`GET /cards/:id` adds
  `cost: { director_usd, tickets_usd, total_usd, by_ticket: [{ticket_id, usd}] }`;
  `GET /tickets/:id` adds `cost: { total_usd, by_run }`; card list and ticket list rows carry
  `cost_usd`), `GET /projects/:slug/tickets` list with filters + cursor/offset pagination,
  cost page endpoints for top runs / top tickets with `limit`/`offset` (or cursor) and totals.
  Director cost per card comes from the Director step rows / usage already stored; find where.
  No migration unless unavoidable (prefer queries). Tests per route.
- **U1-B web shared:** items 5, 6 (UI side + tooltip), 7, 8, 9, sidebar entry and the Tickets
  list page (item 3) against U1-A's contract.
- **U1-C web pages:** items 1, 2, 4 (UI) after U1-A and U1-B land.

## Gates
`pnpm typecheck`; `eslint --fix` then `pnpm lint` 0 errors; prettier on changed files;
vitest `--maxWorkers=2` on touched areas (`--project web` for web). Low RAM: sequential,
foreground. No commits. READMEs and `docs/design/ui-screen-map.md` current. No PRODUCT.md.

## U1-A contract (as built)

All routes need the install token or browser session like every route; errors are
`{error: {code, message, issues?}}`. Money is `number` dollars; only **recorded** cost is summed
(a run that recorded none is 0). New fields on schemas the web already parses are **optional in
the type** (`cost_usd?`, `total?`, `cost?`, `by_*_total?`, `card_title?`) so older fixtures still
validate; this server always sends them. Zod schemas live in `@forge/core`: `TicketCost`,
`CardCost`, `TicketListQuery`, `TicketListPage`, `CostPageQuery`, `CostReport`.

### `GET /tickets/:id` (adds `cost`)
```
cost: { total_usd: number,
        by_run: { run_id, usd, status: RunStatus, started_at, recorded: boolean }[] }  // oldest run first
```
`recorded: false` = the harness reported no cost for that run (`usd` is 0): show "not recorded",
not "$0.00". No runs: `{ total_usd: 0, by_run: [] }`. 404 `ticket_not_found`, 400 `invalid_ticket_id`.

### `GET /cards/:id` (adds `cost`, `cost_usd`; its `tickets[]` rows also carry `cost_usd`, `card_title`)
```
cost_usd: number                                   // = cost.total_usd (also on every CardSummary)
cost: { director_usd, tickets_usd, total_usd,
        by_ticket: { ticket_id, title, usd }[] }   // every ticket of the card, highest spend first
```
`director_usd` = the card's Director steps: planning steps, `card_chat` turns, escalation answer
and recover steps. There is **no `by_step`** (the engine stores one running sum per card). Not
counted: triage/steering steps and failed model calls, so the total is a floor (README Limits).
404 `card_not_found`, 400 `invalid_card_id`.

### `GET /projects/:slug/cards` (rows add `cost_usd`)
Same query as before (`column`, `type`, `limit`, `cursor`); each `CardSummary` has `cost_usd`
(Director + tickets, one grouped read per page). Reply shape unchanged: `{items, nextCursor}`.

### `GET /projects/:slug/tickets` (extended, same path the Board uses)
Query (all optional): `state` (repeatable or comma list of ticket statuses), `lane`
(`express|standard|full`), `card` (card id like `FX-C2`), `q` (1..100 chars,
case-insensitive substring of ticket id or title; `%`/`_` literal), `sort` = `updated` (default,
newest `updated_at` first) | `created` (newest `created_at` first) | `cost` (highest recorded run
cost first; ties by id desc), `limit` (1..500, default 100; the Tickets page should send 25),
`offset` (>= 0, any sort), `cursor` (opaque, default sort only).
Reply:
```
{ items: TicketSummary[], total: number, nextCursor: string | null }
TicketSummary = { id, title, state /* the ticket status; there is no separate "status" */, lane, type,
  tier_predicted, project, card_id?, card_title?, priority, rework_count, needs_you, blocked_reason?,
  run_id?, run_status?, pr_url?, cost_usd, created_at, updated_at }
```
`total` counts every ticket matching the filters (not the page). **Page the Tickets table with
`offset`** (`offset = pageIndex * limit`, last page when `offset + items.length >= total`).
`nextCursor` is only non-null when paging by cursor (`sort=updated`, no `offset`: the Board's
mode) and a `cursor` combined with `offset` or `sort` other than `updated` is `400 invalid_query`.
Errors: 400 for a bad `state`/`lane`/`card`/`sort`/`q`/`limit`/`offset` (the body lists the
field), 400 `invalid_cursor`, 404 `project_not_found`.

### `GET /projects/:slug/cost` (paging of "Top tickets" and "Top runs")
Existing `range=7d|30d|90d` plus, independently per table: `ticket_limit` (1..100, default 50),
`ticket_offset` (>= 0, default 0), `run_limit` (1..100, default 50), `run_offset` (default 0).
Defaults return exactly the old first page (top 50 of each). New reply fields:
`by_ticket_total` (tickets with a run in the window) and `by_run_total` (runs in the window).
Ranking is stable across pages (tickets by cost desc then id; runs by cost desc, cost-less last,
newest first). Everything else in `CostReport` is unchanged. 400 for a limit outside 1..100 or a
negative/non-numeric offset, 400 bad `range`, 404 `project_not_found`.
