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
cannot yet pause or restart tickets;
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

- 2026-10-18: Research in planning (S6): the Director can research outside facts while planning (SearXNG search and fetch within per-card caps, a grill question can ask for one more round), every claim is cited to a stored source and its quote checked against the page; the card's Evidence tab shows claims as Verified or Unverified with the page text and where it came from, the plan lists the outside facts it rests on and an unverified one sends the plan to you; if research cannot run the plan goes ahead with a note; Worker web fetches are recorded and review findings may cite only pages a run read; Settings get a Research page (provider, test, limits) that projects can only narrow; a card spend cap warns once in the Inbox and never blocks.
- 2026-10-18: Director pipelines (S5d): the Director can tailor one ticket's pipeline from the approved plan (add, move or swap stages with a reason; merge, G1, gates, sign-off and people stay locked; a removal needs your approval), shown on the ticket strip with a change log you can narrow in the plan; after the same change on 3 tickets from 2 cards in 30 days it suggests a project pipeline change you Accept or Reject from the Inbox or the Pipelines tab; scorecards show how each agent and pipeline shape has done (with "too few to judge" under 5 tickets) and you can mark findings real or false alarm; a failing agent falls back through its own list, then a Director-picked substitute, then pauses for you; Test agent has no dollar cap and names its question (d-0167).
- 2026-10-18: Full lane live (S5c): Full tickets run test-writer, implementer, G1, reviewer and critic, the Director's check of the work against the plan and acceptance criteria (typed results only, no Worker narrative), then a sign-off the Director gives for tier A and B up to a ceiling set in Director settings while tier C always comes to you; held findings and scope drift ask you with Merge anyway, Continue, Send back or Re-plan (a reason is recorded), Standard at the rework cap now holds with Merge anyway; every wait on finished work is one item in card chat, the Ticket page and the Inbox; writer groups run in parallel in one worktree with disjoint folders; the stage strip updates live and the Review tab lists each finding with file and line.
- 2026-10-18: Pipeline editor (S5b-B): Forge settings and project settings get a Pipelines area with one list editor per lane (Express, Standard, Full) that keeps merge and G1 locked, adds agent, script-gate, run-together and human stages, sets each check to send back or hold, checks the list live with the server and explains every problem in words; projects can change a lane from the company default with Reset and add routing rules (paths add a reviewer or researcher); the ticket page shows a stage strip (status, rework round, added-by-rule) with stage details, and the Review tab lists what the checks found.
- 2026-10-18: Agents screens and stage runner (S5a-B, S5b-A): Forge and project settings get an Agents area (roster with tags, one editor for every agent with Runs on, tools by role, write scope, budget, Test agent, template gallery and Describe it to the Director); tickets now run through snapshot lane pipelines, Standard is live (test-writer with red proof, implementer, G1, an independent read-only reviewer whose blocking findings send work back for rework up to the cap, d-0165), held tickets of live lanes resume by themselves, Full stays held; the unused project stats route is removed (d-0166).
- 2026-10-17: Agents backend S5a-A: agents are config rows (four built-ins: implementer, test-writer, reviewer, critic; six templates) with company and per-project scopes (override, disable, own agents), role bounds that keep reviewers read-only, a per-agent tool grant that can only narrow what a run may do, "Runs on" harness and model per agent with readiness, Test agent (one capped call) and Describe it to the Director drafting; runs record the agent id and hash, and Express dispatch is pinned byte-for-byte to today's request. The web Agents screens land with S5a-B.
- 2026-10-17: UI pass U1 (pages): card and ticket pages are tabbed with the tab in the URL (card: Conversation, Plan, Tickets, Details; ticket: Conversation, Review when it waits on you, Runs, Details), chat has a composer docked at the bottom with narrow quiet bubbles grouped by author and day, and cost shows on headers, Board tiles and lists with a full breakdown on Details.
- 2026-10-17: UI pass U1 (shared): cost per card (Director plus tickets) and per ticket in the API, a project Tickets page in the sidebar (filters, search, sort, server-side paging), Cost page Top tickets and Top runs paged on the server, chart bars with the app tooltip, one redesigned empty state everywhere, thin themed scroll areas, Forge and project settings as left-tab layouts with a URL per section, and Inbox alerts (toast, badge, tab title count, optional browser notification).
- 2026-10-17: Card phase follows its tickets both ways (a done card reopens on unfinished work, a repair sweep fixes old cards, re-plan from done works, an all-cancelled card asks the owner); G1 accepts verified edits and reads from earlier runs of the same ticket and no longer demands receipts for Edits Claude refused before running; the Worker thread renders markdown, stays inside its column and shows steering messages with sender and delivery state; Board columns grow instead of scrolling.
- 2026-10-17: Card flow fixes from the live test: closing a card cancels its tickets, waits and runs (with a repair sweep for cards already closed); review and sign-off get Approve and merge and Sign off and merge through the merge door (it merges only the gated sha, and a moved head sends the ticket back to verify); a finished card reopens when new work is filed; one failing run no longer blocks settling the others (after 3 failures it is parked with an escalation); the re-entrant settle crash and the false policy_denied on a rejected Edit are fixed; the Worker thread shows whole messages, tool inputs and the brief sent to the Worker; planning events carry their real times.
- 2026-10-17: Card-first flow S4a (ticket escalations): a stuck ticket goes to the Director first (it answers Worker questions from the plan, decisions, memory and code when confident and not Tier C, and retries once on failure), then comes back as a typed escalation (question with suggested answer, failure with Retry / Re-plan / Cancel, setup with Fix in settings and auto-resume once fixed) shown the same in card chat, ticket page and Inbox, settled live everywhere; lane holds offer Run as Express / Re-plan, timed-out questions and review waits get actions, and a test fails if any waiting state has none.
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
