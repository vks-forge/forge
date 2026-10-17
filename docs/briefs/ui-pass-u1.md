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
