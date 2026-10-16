---
kind: outcome
date: 2026-10-16
session: overnight autonomous run (user asleep; "finish the web app design, connect server with frontend, remove all mock")
---

# Web app built end to end on the real server API

## Done (all on main, pushed)
- W2 Forge settings, W3 Board tickets + Ticket page (live thread), W4 project
  settings + Memory, W5 Home stats / Inbox / Runs / Cost (backend W5b:
  stats, inbox with read/archive/resurface, runs, cost; migration 0018).
- W7b: `forge start` serves the built UI at `/` and the API at `/api`; the
  browser signs in through a one-time link that becomes an HttpOnly
  SameSite=Strict cookie (install token never reaches page JS, d-0093); Host
  check (DNS rebinding) and Origin check on cookie writes (CSRF). Independent
  security review: no critical/high; fixes applied (CSRF by exemption, open
  logout, CLI checks the server proves the token before sending it, CORP).
- d-0123 done: mock adapter, fixtures, adapter table and `VITE_FORGE_*` removed
  from apps/web/src; component tests stub fetch in `__tests__/helpers`;
  Playwright runs against a real server on a temp data home (17/17).
- d-0122 done: zustand persist for UI-only state (`forge.ui.<name>`, versioned,
  guarded storage; a test pins that no server data or secrets persist).
- W7: first-run wizard (`/welcome`) and new-project flow; `GET /system`,
  `POST /projects/inspect` (dry run through the same folder checks).
- W6: cards model (W6b-1, migration 0019, rollup per d-0107 literally),
  steer a running Worker (W6b-2, `POST /runs/:id/steer`, ACP engine), card
  Director chat (W6c, actions through existing doors only), Board Cards view
  and Card page with chat, event windows, Director actions.
- `pnpm check` (d-0119): unit + web related tests only; heavy in CI or
  `--heavy`; leaf change 777 s -> 74 s. Root `pnpm build` now also builds the UI.

## Found
- GitHub Actions free quota for October is used up (macOS minutes count 10x);
  CI jobs are refused before starting from fbe6489 on. Full suite was run
  locally once at the end as the stand-in. Needs the user: raise the spending
  limit or wait for the Nov 1 reset (self-hosted runner rejected, r-0007).
- Builders twice added `minimumReleaseAgeExclude` entries or day-old versions;
  repinned to mature versions (react-virtual 3.14.13).
- A new CLI cannot `forge stop` a server older than the token-proof change
  (it refuses rather than send the token); stopped it via `/admin/shutdown`.

## Pending / for the user
- x-0014: bind the browser session to Forge's port (cookie is host-scoped).
- d-0107 edge: a closed card with a pending question stays in Needs you; no
  interaction-cancel door exists yet.
- Card Director cannot pause/restart/re-plan tickets (no doors yet); Plan
  cards cannot get tickets until a plan-approval action exists.
- W8 Issues (P5) not started; worker isolation (d-0117) still first after
  the realignment; duplicate windowed-list and run-status helpers in web.
