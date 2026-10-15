# @forge/web

The Forge control room: a React app for watching and steering a project's work. The shell, theme, motion system and data layer exist; the screens arrive one batch at a time.

## Why it exists

Forge runs work autonomously, but the user still decides what needs a human: answering a Worker's question, approving a review, reading what a run did. They need to see state at a glance and talk to the Director and Workers live. Without a control room the only view is logs and the database. The UI is built natively rather than embedding a third-party tracker (d-0010, r-0004).

There is no company-wide Home (d-0104). The user always works inside one project and switches project from a dropdown at the top of the left sidebar; everything about Forge itself (harnesses, GitHub, limits, general) lives in a separate "Forge settings" group.

## What it does

Built (batches W1, W2, W3 and W4, `docs/design/web-build-plan.md`):

- **Shell**: left sidebar (project switcher, project nav, Forge settings, theme toggle), a drawer on screens under 768 px, skip link, animated page transitions.
- **Project switcher**: dropdown of open projects from `GET /projects`, `Ctrl+K` / `Cmd+K` opens it, switching keeps the same screen under the new project. Loading, empty and error states.
- **Unsaved-changes guard**: any view calls `useUnsavedChanges(isDirty)`; while true, switching project or navigating shows an in-page "Keep editing / Discard changes" alert.
- **Theme**: "Instrument" tokens (graphite, one cobalt signal, amber only for what needs the user), light and dark, system by default with a toggle, fonts self-hosted.
- **Motion**: critically damped spring presets, shared-layout sidebar indicator, route transitions, `MotionConfig reducedMotion="user"`. Only `transform` and `opacity` animate.
- **Data layer** (`src/api/`): the `ForgeApi` port (projects, projectSettings, memory) with an `http` and a `mock` adapter, one table choosing between them per resource, a validated SSE helper `watchRunEvents()` (used by the Ticket thread; it reports connecting, open and reconnecting).
- **Forge settings (W2)**, all on the real endpoints:
  - _Harnesses_ (`/settings/harnesses`, `/settings/harnesses/:id`): list with version, installed build, sign-in and status; per harness a sign-in form (signed-in account, API key, OAuth token), a write-only credential field, a test (optional paid live call), the compatibility check with live progress and a per-check result, and built-in tool approvals where every approve or deny goes through a confirm that records name and reason.
  - _GitHub_: connections list and an add form (App id and private key; the key is never shown). No one-click App creation (later).
  - _Limits_ and _General_: company settings as versioned, attributed saves. Edits are validated against core's `ForgeConfig` in the unit shown, saved as the previous override plus the change (so untouched settings keep following defaults), and a 409 offers "Reload latest" or "Keep my edits on top". History lists every version with what it changed.
- **Project settings** (`/p/:slug/settings`, W4): read-only project facts; every overridable setting (checks by role, default harness, Workers at once, fallback harnesses, ecosystems, Tier C paths, remote) shown as inherited (with where it comes from) or overridden, a switch to clear an override; versioned save with a required reason; if a newer version exists (409 or a background refresh) saving pauses and the banner offers a diff and a reload, never an overwrite; history list with plain-words diffs; archive behind a confirm. Keys the screen does not edit (git host, gate rules, tool grants) are carried through a save unchanged.
- **Memory** (`/p/:slug/memory`, W4): tabs Decisions, Rejected, Proposals, Outcomes with counts; text and tag filters; superseded decisions marked; a detail drawer (`?record=d-0003`) with source, author, dates and links along the supersede chain; Approve and Reject (reason required) behind a confirm, applied optimistically and rolled back on failure; the list windows past 100 rows.
- **Board, Tickets view** (batch W3): `/p/:slug/board`. One newest-first list of the project's tickets (`GET /projects/:slug/tickets`, cursor paging; the first 1,000 load on their own, then "Load older tickets"), grouped on the client into six columns (`src/domain/board-columns.ts`): Inbox and planned, In progress, Needs you (amber: waiting_human, review, needs_signoff), Verifying, Done, Blocked and cancelled. Cards show id, title, lane, run status, rework count and the needs-you marker, and are one link to the Ticket page. Lane, state and text filter; Cards | Tickets switch (Cards disabled until W6); columns over 100 tickets are virtualised, shorter ones glide a card between columns with the shared-layout spring; refetch every 5 s and on focus; offline and refresh-failed banners; an "Ask the Director" box files a chat request (`POST /intake`, one dedupe key per message).
- **Ticket page** (batch W3): `/p/:slug/tickets/:id` from `GET /tickets/:id`: header (state, lane, PR link, blockers as links), gate strip (latest result per gate), runs list, and the **live Worker thread** of the chosen run from `watchRunEvents()`: messages, tool calls (collapsed, expandable), permission decisions and denials, finish and error lines, a connection state (connecting, live, reconnecting, ended, lost with Reconnect), follow-the-newest scrolling that pauses when you scroll up ("Jump to latest"), virtualised past 100 items. A pending question shows in amber above the thread with an answer form (`POST /interactions/:id/answer`): optimistic, the draft survives a refusal, a 409 says it was already answered.
- **UI state hooks** (`src/state/`, d-0122): `useBoardPrefs()`, `useThreadPrefs()`, `useAnswerDraft()` over a small in-memory store; they move to persisted zustand stores with no caller change.
- **Placeholders** for the destinations later batches build.

Routes: `/` redirects to a project; `/p/:slug` and `/p/:slug/{inbox,board,issues,chat,runs,memory,settings}`; `/settings/{harnesses,harnesses/:id,github,limits,general}`.

Public API: none; it is an app. Entry is `src/main.tsx`.

## Why this approach

- Stack fixed by d-0103: Vite, React 19, React Router, TanStack Query, Tailwind 4, Radix primitives with our own styling (no shadcn), lucide icons, `motion`. assistant-ui is not used: the thread folds Forge's own run events (`src/domain/thread.ts`) and renders them as text, never HTML or markdown, because it is untrusted model output. Rejected for now: a chat-UI library, since the thread is read-and-answer, not a chat composer.
- **Types come from `@forge/core` zod schemas.** `src/schemas/projects.ts` derives the `/projects` response from core's `Project`; `src/schemas/http.ts` holds the two server envelopes core does not export (error body, SSE ticket reply), each documenting the server route it mirrors.
- **One adapter table** (`src/api/adapter-table.ts`) is the only switch between the real server and typed fixtures, so a screen is written once and a resource moves from `mock` to `http` in the batch that builds its endpoint. No screen ships with mock data in a release (d-0118).
- **The token never reaches the browser.** In development `vite.forge-proxy.ts` proxies `/api/*` to `127.0.0.1:4310`, strips any page-supplied `Authorization`, reads the install token from the data home on every request and adds the header itself. Rejected: `define` or `import.meta.env` for the token (readable by any script on the page).
- Springs are critically damped (damping = 2 * sqrt(stiffness * mass)): fast, no wobble. Animating only `transform` and `opacity` keeps 60 fps.
- **One list, grouped on the client, for the Board.** A ticket has one state, so a single newest-first list is one consistent snapshot: a ticket moving between columns can never appear twice or vanish between two requests, one refetch refreshes every column and paging has one cursor. Per-column paging would need six cursors that drift apart as tickets move. `@tanstack/react-virtual` windows long columns and threads (no Windows caveat).
- Radix for menus and dialogs gives focus trap, Escape, ARIA and typeahead for free; the look is ours.
- `Button`, `StatePanel` and the nav items carry every state (hover, focus-visible, active, disabled, loading, error, success where meaningful).

## Requirements

- Node 24.20, pnpm 12, and `pnpm install` at the repo root.
- Run it: start the server with `forge start` (default port 4310; `FORGE_PORT` changes it), then `pnpm --filter @forge/web dev` and open <http://127.0.0.1:5173>.
- The dev proxy needs `@forge/core` built once (`pnpm build` at the root) to find the data home; without it, `/api` calls go out without a token and the page shows its "Forge did not accept this session" state. It honours `FORGE_HOME` like the server.
- The install token is read from `<data home>/install-token` (Windows default `%LOCALAPPDATA%\Forge`). The server regenerates it on restart; the proxy follows with no reload.
- Dev and test flags (rule 9, never product configuration): `VITE_FORGE_API=mock` serves every resource from fixtures and shows a "Fixture data" mark; `VITE_FORGE_MOCK=empty|error` makes the fixtures answer empty or fail.
- Scripts: `dev`, `build` (to `dist/web`), `preview`, `e2e`.
- Tests of the ticket screens use test-only fakes (`__tests__/helpers/fake-tickets/`, stub `EventSource` and fetch); the app has no fixture data for tickets (d-0123). The Playwright smoke answers `/api` itself (`e2e/helpers/stub-forge.ts`).
- Tests: component tests are part of the root `pnpm test` (`web` project, jsdom, 70% line floor). The Playwright smoke is separate: `pnpm --filter @forge/web exec playwright install chromium` once, then `pnpm --filter @forge/web e2e` (builds with fixtures, drives 375 px and 1280 px).
- Root `pnpm typecheck`, `pnpm lint` and `pnpm format:check` cover this app too.

## Extending

- **Add a screen**: its entry already exists in `PROJECT_NAV` or `SETTINGS_NAV` (`src/domain/nav-entries.ts`). Build the component under `src/routes/` and swap its `PlaceholderPage` in `src/routes/app-routes.tsx`. Read data with TanStack Query over `useForgeApi()`; give it loading, empty, error and offline states (`StatePanel`). Hold edits? Call `useUnsavedChanges(isDirty)`.
- **Add a resource**: add it to `ResourceApis` (`src/types/api.types.ts`), implement it in `src/api/http/http-adapter.ts` if its endpoint exists and always in `src/api/mock/mock-adapter.ts`, parse responses with a schema from `@forge/core` (or a minimal one in `src/schemas/` that names the server route it mirrors), then set it in `ADAPTER_TABLE`. `createForgeApi()` fails at startup if the table names an adapter that cannot serve it.
- **Settings forms** hold their write in `useSubmit()` (component state, never a query cache) so pasted keys do not linger; versioned editing lives in `useCompanyDraft()`; the field lists are data in `src/domain/settings-fields.ts`.
- **Move a resource to the real server**: add the method to the http adapter and flip its line in `ADAPTER_TABLE` to `'http'`. No screen changes.
- **Watch a run**: `watchRunEvents({ runId, baseUrl: '/api', onEvent, onEnd, onError })` gets a ticket, streams, validates frames and resumes with `?after=<seq>`.
- **Animate**: pick a preset from `src/theme/motion.ts`; never write raw stiffness numbers or animate layout properties.
- Every new screen records its Nielsen-10 coverage and a Hallmark pass before build.

## Limits

- Project destinations still placeholders: Home and Runs W5, Inbox W5, Chat W6, Issues W8.
- Memory: the server's list omits outcomes and does not return `superseded_by`, so the Outcomes tab is empty against the real server and a superseded row links to its successor only in the drawer. A proposal answer cannot be undone (no API), so it is a confirm, not an undo window.
- Project settings: project name, repository, branch, folder and prefix are read-only (the API only archives). Archiving cannot be undone from the UI. Author is the fixed name `owner` until accounts exist. Tab and filter choices are not remembered across reloads (view prefs move to a persisted store, d-0122).
- `projects`, `harnesses`, `github`, `settings`, `projectSettings`, `memory`, `tickets`, `interactions`, `runEvents` and `intake` are wired to the real server; the sidebar has no Inbox badge yet (W5).
- No production token hand-off: `forge start` does not yet serve this UI or give it a credential (W7). Until then only the dev proxy can reach the server.
- The bundle is one 700 kB chunk (all of `@forge/core`'s schemas are included); code-splitting waits for the first heavy screen.
- Archived projects are hidden from the switcher; there is no way to open one yet.
- The Playwright smoke is not part of `pnpm test` and needs a downloaded browser.
- Settings gaps the server leaves: no profile call (the name on a save or decision is typed and kept in memory only, d-0122), no data-folder path, no edit or disable of a GitHub connection, no per-project cap here (project settings, W4), and the harness list has no delete. A by-state cap Forge ships with can be changed but not removed (overrides merge over defaults).
- The settings component tests still run on the stateful mock adapter; they move to a stubbed `fetch` when the mock is removed (d-0123).
- Board: no drag-and-drop (a ticket changes column only when the server changes its state); the Cards view is W6. Past 1,000 tickets the older ones load on request.
- Ticket page: no steering message to a live run (W6b), no "Cancel run" or gate report viewer; the runs list needs `GET /tickets/:id` to include all runs (it does today, unpaged). In a fixture build (`VITE_FORGE_API=mock`) tickets, answers, intake and run streams still go to the real API (they have no fixtures, d-0123).
- Answers are sent as plain text; the server stores any JSON, so a structured answer for permission or plan kinds waits on a contract for those shapes.
