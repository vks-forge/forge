# Forge Overview dashboard (`/`): build brief

Status: **approved** (d-0162): build after the card-first slices in progress.
Amends d-0104 ("no company-wide Home"): project Home stays, and `/` gains a cross-project Overview.

## Why

`/` today only redirects to the last project (`apps/web/src/routes/root-redirect.tsx`). An owner running several projects has no single place to see:
- how all the work is going;
- what is waiting on them across projects;
- what everything costs over days and months.

## Page

**Header controls**
- Range: 7d · 30d · 90d · 12m · All.
- Grouping: Day · Week · Month. The default follows the range: 7d/30d → Day, 90d → Week, 12m/All → Month.
- Project filter: all projects, or a multi-select Picker (d-0154). An "Include archived" toggle.

**1. KPI strip**
- Spend in range, with the change vs the previous period.
- Spend this month.
- Tickets done, tickets in progress.
- Waiting on you (all projects).
- Workers running now.
- Active projects.
- G1 pass rate.

**2. Charts**
- Spend over time, stacked by project, with a tooltip per project.
- Tickets done vs started, over time.
- Runs over time, split into passed / failed / interrupted.
- Spend breakdown donuts: by project, by harness/model, by lane.

**3. Projects table.** One row per project:
- status, open cards, tickets in progress, waiting on you;
- spend in range, last activity, a sparkline.

The row opens that project's Home.

**4. Needs attention.** The newest needs-action inbox items across projects, with a project tag; each opens its item.

**5. Cost coverage.** "N of M runs reported a cost". Runs that don't report cost are counted, never guessed. This follows the existing stats rule.

**Empty state.** A fresh install with no projects shows the first-run wizard, as today.

## Navigation

- "Overview" is the first item in the sidebar's Forge section, and the logo links to it.
- Opening `/` shows Overview. The "last project" redirect goes away; the project switcher still remembers the last project.

## Backend

- **`GET /stats/overview?range=7d|30d|90d|12m|all&group=day|week|month&projects=a,b&archived=0|1`.**
  - It aggregates the existing pure core functions (`computeProjectStats`, `computeCostReport` in `@forge/core`) across projects, plus new time-bucketing (day/week/month) and the 12m/all ranges.
  - The response schema is a zod schema in core (`OverviewStats`).
  - No new tables: everything is computed from stored tickets, runs, gate results and inbox states.
  - 400 for a bad range or group; unknown project slugs are ignored and listed in `unknown`.
- **Core.** `StatsRangeQuery` gains `12m` and `all` (the per-project endpoints may adopt them too). A pure `bucketize(window, group)` with property tests.
- **Performance.** Paged reads via `services/collect-pages`. At 12m/all on large installs, consider a cached daily rollup later. Not in v1.

## Web

- `routes/overview/overview-page.tsx` plus components.
- Charts: reuse the chart approach already on project Home (check `routes/home/*` for the chart component). Add no new chart library unless the existing one cannot stack series, and if a library is needed, record why.
- Live: refetch every 30 s; switch to the per-project SSE invalidations once d-0132 lands.
- Hallmark plus Nielsen passes; 375 / 768 / 1440 px checked with Playwright.

## Build

- Two builders in parallel:
  - backend: core plus server endpoint plus tests;
  - web: page plus tests against the contract above.
- The orchestrator runs the gates. Remember to `pnpm -C apps/web build` before restarting 4310.
