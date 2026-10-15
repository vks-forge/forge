# Web app build plan (apps/web)

Status: approved 2026-10-15 (d-0118). Stack fixed by d-0103 (Vite, React 19,
React Router, TanStack Query, Tailwind 4, Radix, assistant-ui, lucide,
`motion`). Screens and direction fixed by `ui-screen-map.md` and the approved
prototype (Instrument). Card and issue flow fixed by `issue-flow.md`.

## Answer: UI or functionality?

Both, in that order per screen. The UI is built for real, against the real API
where an endpoint already exists, and against a typed mock adapter where the
backend feature does not exist yet. Each mock is swapped for the real endpoint
in the same batch that builds that backend feature. No screen ships with mock
data in a release.

## Data layer (one interface, many adapters)

- `src/api/` holds a `ForgeApi` port whose types come from `@forge/core` zod
  schemas (no hand-written copies). Two adapters: `http` (fetch + bearer token,
  SSE via `/auth/sse-ticket`) and `mock` (seeded fixtures with latency, so
  loading and empty states are real).
- Per-resource switch: resources with an endpoint use `http`; the rest use
  `mock` until their backend lands. The switch is a table in one file.
- Token in dev: the Vite dev server proxies `/api` to `127.0.0.1:4310` and
  adds the bearer header from the install-token file on the server side; the
  token never reaches browser JS. Production hand-off from `forge start` is a
  later batch (W7).

## Where each screen's data comes from today

| Screen | Real endpoint now | Missing backend (built in batch) |
| --- | --- | --- |
| Shell, project switcher | `GET /projects` | none |
| Home stats | — | stats aggregation (W5b) |
| Inbox / Waiting on you | — | inbox list over interactions + approvals (W5b) |
| Board: Tickets view | `GET /tickets/:id` | ticket list per project (W3b, small) |
| Board: Cards, Card page | — | cards model + card Director chat (W6b) |
| Ticket live thread | `GET /runs/:id/events` SSE, `POST /interactions/:id/answer` | steer endpoint (W6b) |
| Issues | — | GitHub issue intake + analysis (P5 / W8) |
| Memory | `/projects/:slug/memory*` | none |
| Forge settings: Harnesses, GitHub, Limits | `/harnesses*`, `/github/connections`, `/settings/*` | none |
| Project settings | `/settings/projects/:slug*` | none |
| Runs, Cost | — | run list + spend (W5b) |

## Batches

| # | UI (apps/web) | Backend pair |
| --- | --- | --- |
| W1 | App scaffold, tokens (Instrument theme, light/dark), spring presets, route transitions, shell + sidebar + project switcher, `ForgeApi` port + both adapters, dev proxy, test setup | none |
| W2 | Forge settings: Harnesses (login mode, test, compat, tool approvals), GitHub connections, Limits, General | none (all real) |
| W3 | Board Tickets view, Ticket page with live SSE thread + answer interactions | W3b: `GET /projects/:slug/tickets` |
| W4 | Project settings, Memory (approve / reject proposals) | none (all real) |
| W5 | Home stats, Inbox, Runs, Cost | W5b: stats, inbox, runs list, spend endpoints |
| W6 | Board Cards view, Card page (Director chat, Tickets timeline, steer) | W6b: cards model, card chat, steer |
| W7 | First-run wizard, new project flow; `forge start` serves the built UI and hands over the token | W7b: static serving + token hand-off |
| W8 | Issues page | GitHub issue intake and triage (issue-flow.md) |

W1 lands first (everything depends on it). After W1, W2, W3 and W4 run as
parallel builder agents in separate worktrees; backend pairs run as their own
agents. Isolation work (d-0117) and the remaining realignment fixes (F4, F5)
continue alongside; apps/web touches no other package.

## Rules every UI batch follows

- hallmark + Nielsen-10 pass per screen before build (global rules); the
  prototype is the visual reference, not copied markup.
- Motion floor (d-0103): springs only, transform/opacity only, 60 fps,
  `prefers-reduced-motion` honoured, lists virtualised past ~100 rows,
  optimistic mutations.
- Every screen has loading, empty, error and offline states.
- Gates: typecheck, lint, format, vitest (component tests with Testing
  Library), plus a Playwright smoke per screen against the mock adapter.
- code.md applies (headers, `#/` imports, files ≤ 300 lines, types in
  `types/`, README kept current).
