# Forge — product description and progress

The single place to learn what Forge is, who it is for, how it works and how
far it has got. Keep it current: every change that alters what a reader would
believe about the product (scope, flow, status, roadmap) updates this file in
the same commit. Detailed rules live in `.forge/memory/decisions/` (cited as
d-NNNN); design docs live in `docs/design/`.

## What Forge is

Forge is an autonomous software-development organisation that a company
installs and runs on its own machine. A **Director** (deterministic engine +
short LLM steps) turns requests into tickets, plans them, dispatches
**Workers** (AI coding agents running in harnesses such as Claude Code) into
isolated git worktrees, verifies their work with independent gates, opens
pull requests and merges by policy. The user steers everything from a web UI.

Governing rule (d-0001): an agent's own report only triggers checks; it never
proves anything. Proof comes from independent processes — receipts of every
tool call, re-run tests, diff checks — before code is merged.

## Who it is for

A company (or a solo developer) that wants AI agents to do real work across
**many repositories**, under rules it controls, without editing config files
or code. One install = one company (d-0094); team features (accounts, roles)
come later (d-0082).

## How a user experiences it

1. `npm i -g vks-forge`, then `forge start` (d-0091, d-0099). Forge runs in the
   background and opens the web UI on `127.0.0.1` (d-0092, d-0093).
2. First run: pick the data folder (`%LOCALAPPDATA%\Forge`, d-0098), check
   installed harnesses and their logins (d-0087), connect GitHub — Forge
   creates a GitHub App in your org with one click (d-0084).
3. Create a project: choose any local folder (d-0083, d-0124). With git it is
   used as is; with no git Forge says git is needed and starts a local repository
   (snapshot commit of the files, or init only); inside a larger repository you
   pick the repository top or only the subfolder. A GitHub remote is optional:
   without one verified work merges locally into the base branch (a dirty
   checked-out branch waits for you). Forge detects the languages and commands, runs them
   once, then the Director asks a few onboarding questions (d-0095).
4. Create a card with the New card form: title, description, type, priority,
   dependencies and links (later: GitHub Issues, d-0096). The card starts in
   Shaping and no ticket exists yet; the Director replies in the card chat
   (d-0128). Planning, approval and ticket creation come next in the card-first
   flow; today the Director triages tickets it is asked to file (lane Express /
   Standard / Full).
5. Workers run; you watch live, answer their questions, approve what needs you.
   Gates verify; Forge opens the PR and merges when policy allows.
6. Everything — agents, pipelines, models, budgets, limits, credentials — is
   changed in Settings, for the whole company or per project (d-0085, d-0090).

## Key concepts

| Term     | Meaning                                                                    |
| -------- | -------------------------------------------------------------------------- |
| Company  | one install; owns default settings, GitHub connections, harnesses          |
| Project  | one repo + local folder + settings overrides + its own memory              |
| Ticket   | a unit of work, id `<PREFIX>-<n>`, moves through one state machine         |
| Lane     | process weight: Express, Standard, Full; only escalates (d-0006)           |
| Director | the engine + LLM steps that triage, plan, dispatch, steer                  |
| Worker   | an AI agent run in a harness, inside its own worktree                      |
| Harness  | the user-installed agent CLI (Claude Code now; Codex, OpenCode … later)    |
| Receipts | HMAC-chained record of every tool call, written by our hooks               |
| Gates    | independent checks (G1 now: claims vs receipts, tests, diff, config guard) |
| Memory   | per-project decisions, rejected approaches, outcomes, read by the Director |

## Architecture in brief

TypeScript pnpm monorepo, Node 24, SQLite. Inner rings: `packages/core`
(types, schemas, ports, state machine), `packages/tools` (policy: `admit()`,
floors, grants, receipts), `packages/engine` (tick, dispatch, settle, verify).
Adapters: `db`, `drivers` (harnesses), `hooks`, `mcp`, `gates`, `git`,
`memory`, `secrets`. Apps compose: `apps/server` (HTTP + SSE), `apps/cli`,
`apps/mcp`, `apps/web` (UI shell, in progress). Rules: `.claude/rules/code.md`.

## Status — 2026-10-16

**Built and verified:** core schemas and state machine; SQLite storage;
Claude Code driver over ACP with a CLI fallback; receipt hooks; tool policy;
Director engine (triage, dispatch, settle, verify); G1 gate; git worktrees;
GitHub App git host; DPAPI secrets; HTTP server with SSE. Realignment B0–B14
done: one server serves many projects, settings live in the database, runs
survive a restart, fair scheduling across projects.

**Web control room (on the real server API, no mock data):** `forge start`
serves the UI and signs the browser in with a one-time link (the install token
never reaches the page). First-run wizard and new-project flow; project Home
with stats graphs; Inbox; Board with Cards and Tickets views; Card page with a
chat to the card's Director (it can file tickets, steer Workers, change the
card type, suggest closing); Ticket page with the live Worker thread, answers
to questions and direct messages to a running Worker; Runs; Cost; Memory;
project settings; Forge settings (harnesses, GitHub, limits, general,
Director flow and playbooks); a cross-project Overview at `/`. UI
preferences persist across reloads.

**Not yet:** GitHub Issues intake and the Issues page (P5); the card Director
cannot yet pause, restart or re-plan tickets, and stuck tickets do not yet come
back as typed escalations (card-first S4a); only the Express lane runs Workers;
not packaged or published.

**Known limits:** Workers and project checks run as the user's own Windows
account, so code a Worker writes (a test, a script) can read Forge's data
folder, including the install token and secrets. The tool policy floor
guards tool arguments, not the operating system; real isolation (a separate
low-privilege account, or WSL2/container) is the first item after the
realignment (d-0117, d-0005).

## Roadmap

| Step | What                                                                | Plan                        |
| ---- | ------------------------------------------------------------------- | --------------------------- |
| Done | Realign the existing code (batches B0–B14)                          | `docs/design/build-plan.md` |
| Now  | Worker isolation: separate low-privilege account for Workers/checks | d-0117                      |
| P2   | Onboarding: GitHub manifest flow, language detection, Director chat | change map W4, W5, W9       |
| P3   | Control room UI: every setting and flow on screen                   | change map W12, W14, W15    |
| P4   | First release on Windows as `vks-forge`                             | change map W16, W17, W20    |
| P5   | GitHub Issues intake, agents and pipelines engine, macOS/Linux, exe | change map W13, W19         |

## Progress log

Newest first. One line per milestone.

- 2026-10-17: Overview dashboard at `/` (d-0162): spend, tickets, runs and waiting-on-you across all projects by day, week or month (7d to all time), stacked spend and run-outcome charts, spend donuts by project, harness and lane, a projects table with sparklines, needs-attention items and cost coverage; the last-project redirect is gone.
- 2026-10-17: Card-first flow S2 (Director planning): a planned card runs an ordered, snapshot flow of Director steps (survey with engine-side reads through `admit()`, grill one question at a time, verify, enhance, versioned plan with diff, approval behind a deterministic floor or by the owner), each step recorded with its config version; approval files ordered tickets with dependencies and held non-Express tickets offer Run as Express. HTTP routes for answers, shortcuts, approve, request changes, ticket edits and start planning; Forge settings → Director and a per-project override edit the flow, six playbooks and limits.
- 2026-10-16: Card-first flow S3 (card page and board): chat-first card page with grill questions as option buttons, a pinned Needs-you banner whose every action is wired, and a Plan tab (fixed sections, version diff, approve with ticket order, request changes, light ticket edits); board cards show phase line, priority, progress and Blocked by / Blocks chips with dependency-chain highlight and gliding column moves (reduced-motion aware). Server side of planning lands with S2.
- 2026-10-16: Card-first flow S1 (foundation): cards are created through a New card form (title, description, type, priority, dependencies, links) with no ticket and a durable Director reply; a card carries a stored phase, dependencies (cycle-checked) and priority; the Board and Card page update live over a per-project event stream; chat intake no longer files tickets except the PR fast path.
- 2026-10-16: Shared Picker replaces native selects; board columns fit the screen with a collapsible Closed strip.
- 2026-10-16: Archived projects listed in the switcher with Unarchive; memory proposal dates fixed.
- 2026-10-16: Shared Tooltip component on icon buttons (inbox actions, notifications, theme toggle, mobile navigation, capacity rows).
- 2026-10-16: Inbox shows tool approvals and compat failures only for the installed harness build; dates no longer show 1970.
- 2026-10-16: Delete project in project settings (typed confirm); removes Forge data, never the user's folder.
- 2026-10-16 — Board page redesigned: clearer header, columns, cards and empty state.
- 2026-10-16 — Add project is a large step-by-step dialog (Folder, Git, Details, Checks, Review) with no folder text box; the folder browser can sort by name or date, make folders and offers a right-click menu; works on any folder, with or without git (d-0124, web).
- 2026-10-16 — Any folder is a project (d-0124, backend): git state inspection, local repository setup (snapshot or init only), subfolder scope, and local merge for projects with no remote, end to end with the agents.
- 2026-10-16 — Notifications: one bottom-centre notification system for every action (success, error, undo), with live progress cards for long-running jobs.
- 2026-10-16 — Forge settings redesigned: hero header (breadcrumb, status badge, facts strip), sticky section tabs, section cards with footer actions, bordered lists; Add connection opens in a modal that ignores backdrop clicks.
- 2026-10-16 — New project: Browse… opens the system folder window (Explorer, Finder, zenity/kdialog); in-app browser as fallback.
- 2026-10-16 — Status: web control room runs end to end on the real server API (W2–W7, cards W6).
- 2026-10-16 — W6c: chat with the card's Director; it can file tickets, steer Workers and change the card type.
- 2026-10-16 — W6: Board Cards view, Card page with Director chat, and messaging a running Worker.
- 2026-10-16 — W7: first-run wizard and new-project flow.
- 2026-10-16 — W6b-1: cards — every intake becomes a card with a rolled-up board column and history.
- 2026-10-16 — Web app runs on the real server API only (mock removed); UI preferences persist across reloads.
- 2026-10-16 — W6b-2: message a running Worker directly (steer).
- 2026-10-16 — W7b review fixes: CSRF check covers every unsafe method, logout always clears, CLI checks the server proves the token before sending it.
- 2026-10-16 — W5: project Home with stats graphs, Inbox, Runs and Cost screens.
- 2026-10-16 — W7b: forge start serves the UI and signs the browser in with a one-time link.
- 2026-10-16 — Fast local gates: pnpm check runs tests related to the change; full suite in CI.
- 2026-10-16 — W3: Board tickets view and Ticket page with the live Worker thread.
- 2026-10-16 — W5b: stats, inbox, runs and cost API.
- 2026-10-16 — W4: project settings and memory screens.
- 2026-10-16 — W2: Forge settings screens (harnesses, GitHub, limits, general).
- 2026-10-16 — CI green on Windows, macOS and Linux: paths compared after resolving short names and symlinks.
- 2026-10-16 — C4 fixes: brace and glob expansion, provider drives and attached git `-c` no longer slip past the floors.
- 2026-10-16 — Home/Inbox tool-approval items now open the harness's Built-in tools section; Approve all for pending tools.
- 2026-10-15 — W1: web app shell, theme, motion system, data layer.
- 2026-10-15 — W3b: ticket list per project for the board.
- 2026-10-15 — C3 fixes: graceful stop waits for in-flight tool calls; resume phase isolated per run; atomic project slug.
- 2026-10-15 — B13: live rework probe; pnpm probes runs single probes.
- 2026-10-15 — B9: runs survive a restart — interrupted runs resume with a new run secret; receipts verified across generations.
- 2026-10-15 — B11: fair scheduling across projects — priority, per-project and per-harness limits, quota waits.
- 2026-10-15 — B5: project checks by role for any language; gate rules per ecosystem.
- 2026-10-15 — B10: project memory lives in the data folder as a private git repo per project; Director writer; memory API.
- 2026-10-15 — B8: install token on every API call; forge start/status/stop runs Forge in the background.
- 2026-10-15 — B12: ticket sources behind a TriggerAdapter port; chat is the first adapter.
- 2026-10-14 — B7: tool catalogue in the database; per-version harness compatibility check with tool approvals.
- 2026-10-14 — B4: many projects per server; projects and GitHub connection API.
- 2026-10-14 — B6: Workers and the Director run the user's installed claude; login, API key or OAuth token per harness.
- 2026-10-14 — B3b: engine reads config from the database each tick; settings API.
- 2026-10-14 — B13a: tests clean up their temp folders; clean-temp script.
- 2026-10-14 — B3a: versioned config in the database (ConfigSource port, sqlite + memory).
- 2026-10-14 — B2: secret store gains delete, list and namespaced names.
- 2026-10-14 — B1: data home (%LOCALAPPDATA%\Forge) for DB, secrets, runs, worktrees.
- 2026-10-14 — B0: CI on Windows, macOS, Linux.
- 2026-10-14 — Build plan for realignment written (`docs/design/build-plan.md`).
- 2026-10-14 — Product shape decided (d-0082 … d-0099); change map written.
- 2026-10-14 — Agents and pipelines as config grilled (d-0065 … d-0081, x-0011 pending).
- 2026-10-14 — E2 done: server, G1 gate, GitHub App host; probes 1–9 green.
- 2026-10-13 — Slice 1 (core, db), tools policy, Claude driver, engine E1 done; probes 1–7 green.
- 2026-10-12 — Research and design docs; five-plane architecture decided.
