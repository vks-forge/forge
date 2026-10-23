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
2. First run: check installed harnesses and their logins (d-0087), connect GitHub — Forge
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
5. Forge installs your project's packages before each ticket (any language it
   detects; you can edit or turn off the steps, and if one fails you are told
   in plain words and can try again, edit it, skip it or cancel). Workers run;
   you watch live, answer their questions, approve what needs you.
   Gates verify; Forge opens the PR and merges when policy allows. On a card, the
   chat is always the main column with the message box visible, and everything
   waiting on you (a plan to approve, the Director's question, a held or stuck
   ticket, or a tool a Worker wants to use that policy asks about) shows as one slim
   alert under the page title ("Needs your sign-off", "Needs your attention · 2")
   with an Open button that opens a scrollable window listing each item with its
   actions; closing it answers nothing and it can be reopened; a tool approval
   shows the exact command and offers Allow once, Always for this project or Deny,
   and the Worker waits and then carries on with your answer; the plan,
   tickets, history and details sit beside the chat on a wide screen (tabs on a medium
   one, a full-screen sheet on a phone). A ticket can be edited from its Details tab:
   priority, what it waits for, and (before work starts) its description; you can also ask
   the card's Director to do the same in the card chat, and it is told which
   controls you really have, so it never points you to one that does not exist.
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
survive a restart, fair scheduling across projects. The Director's planning
turns, chat answers, triage, replies to Workers and the brief of each Worker run
happen in the background, up to 3 at once (Settings → Director, 1 to 8), so a
long planning turn no longer holds up Workers or other cards.

**Web control room (on the real server API, no mock data):** `forge start`
serves the UI and signs the browser in with a one-time link (the install token
never reaches the page). First-run wizard and new-project flow; project Home
with stats graphs; Inbox; Board with Cards and Tickets views; Card page with a
chat to the card's Director (it can file tickets, steer Workers, change the
card type, suggest closing); Ticket page with the live Worker thread, answers
to questions and direct messages to a running Worker, and a header menu that
cancels a ticket you no longer want (with a reason and the tickets that wait
on it); Runs; Cost (one total, split into what Workers and the Director spent);
Memory;
project settings; Forge settings (harnesses, GitHub, limits, general,
Director flow and playbooks); a cross-project Overview at `/`. UI
preferences persist across reloads.

**Workspace setup (web and docs built; live check with a Node and a Python demo
repo still to do):** each ticket's fresh worktree is prepared by Forge before
the Worker starts (setup steps detected per ecosystem or set in project
settings, Checks tab, "Before each ticket"); a failed step is a plain-words card
with Try again, Edit setup steps, Start without setup and Cancel ticket.

**Merge conflicts (built; live check on a real two-ticket repo still to do):**
when main moves under a ticket Forge merges it into the ticket's branch, and if
the two clash the ticket's own Worker combines both changes (up to 2 tries, no
re-plan); only then does a card ask you, in plain words, with the files that
clash and who changed them first, and Try again, Re-plan this ticket (for now
this re-plans the whole card and keeps merged work) and Cancel. Cancelling a
ticket, from its own page or by asking the Director, or replacing it with a new plan, removes its folder, deletes its branch
and closes its pull request; the card keeps the last commit id.

**Not yet:** GitHub Issues intake and the Issues page (P5); the card Director
cannot yet pause or restart tickets;
not packaged or published.

**Known limits:** A Director-signed tier C merge has no one-click revert yet: the card note names the merge commit to revert by hand (d-0181). With a harness's Bypass permissions on (the default, d-0183)
Workers are never stopped for an approval; only the hard floor still blocks.
Workers and project checks run as the user's own Windows
account, so code a Worker writes (a test, a script) can read Forge's data
folder, including the install token and secrets. The tool policy floor
guards tool arguments, not the operating system; real isolation (a separate
low-privilege account, or WSL2/container) is the first item after the
realignment (d-0117, d-0005).

## Roadmap

| Step  | What                                                                                            | Plan                                                 |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Done  | Realign the existing code (batches B0–B14)                                                      | `docs/design/build-plan.md`                          |
| Now   | Worker isolation: separate low-privilege account for Workers/checks                             | d-0117                                               |
| P2    | Onboarding: GitHub manifest flow, language detection, Director chat                             | change map W4, W5, W9                                |
| P3    | Control room UI: every setting and flow on screen                                               | change map W12, W14, W15                             |
| P4    | First release on Windows as `vks-forge`                                                         | change map W16, W17, W20                             |
| P5    | GitHub Issues intake, agents and pipelines engine, macOS/Linux, exe                             | change map W13, W19                                  |
| Later | Worker sandboxes: cross-OS, pluggable providers, full worktree inside (proposed, not scheduled) | d-0161, x-0015, `docs/briefs/worker-sandbox-plan.md` |

## Progress log

Newest first. One line per milestone.

- 2026-10-23: Inbox Notices tab and "Mark all read" (items Q row 18 and Z): items that only inform get their own tab, Notices and Unread clear in one click with a "Marked N read" notice; the plan editor gets a care-level (Express / Standard / Full) picker per ticket, marked "Set by you" when the owner chose it.
- 2026-10-23: Live progress on Board tiles (item Y, step 5.2): a ticket tile shows its stage ("Stage 2/5 · Review"), a ticking "run 2 · implementer · 10m 03s" line with a live dot, why it waits, one action when it fits (Retry, Open to answer), cost so far and time since last change; a card tile shows "4 of 11 done · 2 running · 1 waiting for you". Stage, live run and the Retry offer come on the list rows in one pass (no per-tile fetch).
- 2026-10-23: Director plan quality (eval fix 5, step 3): a ticket's lane is raised from its own text, never from the filed acceptance list, and every raise is written on the card with its reason; a lane you set in the plan editor is kept (a protected path still forces Full, d-0177); the survey is shown the file list and must read before it reports, and the grill says when it could not read; the planner must account for each of your answers and a plan that contradicts one stops at Needs you naming it; repeated risks are listed once; the brief, approval, triage, steer-reply and verify steps now default to the cheaper model (change them in Director settings).
- 2026-10-23: Honest cost, cancel and trusted status, web half (eval fix 6, step 3): Cost, Overview, card, ticket and the chips show one total first and then "Workers $a · Director $b" (spend per day is two stacked series with a written key and the note that Director spend before 20 Oct is dated by card); a card's Details says which budget is in force and whose it is ("$5.00, Forge default, change in Director settings"); the ticket page's `⋯` menu has "Cancel ticket…" (the shared cancel dialog: what is stopped and deleted, the tickets that wait on it cancelled together, an optional reason, "Keep running"); closing a card says it stops Workers and cancels unfinished tickets; a done or cancelled ticket shows no wait, leads with how it ended, shows muted stage history and ends its run "Worker run 3 finished"; the Board bar and phase line say "2 of 2 done, 1 cancelled"; a done card's plan no longer says the safety minimum failed; "The Director is thinking" no longer shows while it waits on you; a harness row says what its last run did apart from the live test; chat boxes count toward the 8,000-character limit and the New card form states its 20-character minimum up front.
- 2026-10-23: Setup cache controls (4.3b): Settings, General shows how much disk the setup cache uses, a "Setup cache size limit" (GB, default 5) and "Clear setup cache" (saved installs by default, shared downloads as an extra tick; the confirm names the space freed); each step in project settings says what it reuses and can turn the copy cache off. Saving the setup editor no longer drops a step's cache settings.
- 2026-10-23: Faster workspace setup (4.3a, any language): Forge shares each package manager's download cache between tickets of every project (npm, pnpm, yarn, bun, uv, poetry, pip, Go, NuGet, Composer) and copies `node_modules` / `vendor` back from an earlier identical install (same lockfile, command, Node/PHP version, OS) instead of reinstalling; the ticket note reads "workspace ready in 4 s (restored from cache)". Python environments are never copied; a cache fault just runs the install. Controls for it are in Settings (see the next line).
- 2026-10-23: Owner language and protected-files wording (eval fix 9 D, web): one glossary and one "what's this" button replace G1, tier, lane, tick, "Generation", "Driver" and raw states on the Overview, ticket, run, cost, plan and settings screens; saves say "Changes take effect on the Director's next check, usually within a minute. No restart needed."; Issues and Chat leave the sidebar until built; a Director question with a recommended answer has a one-tap "Use recommended" button; every screen that said tier C always needs you now says the Director signs protected files only when every check passed and no secret file is touched, and a protected-files sign-off says why the Director did not sign.
- 2026-10-23: Cancel and status, backend half (eval fix 6, step 2; d-0179): one cancel door for you and the Director (a reason is kept: "You cancelled it: ..." or "The Director cancelled it: ..."), the Director can cancel a ticket of its card only when you asked it to in chat (otherwise it suggests), cancel waits for the Worker to stop before the folder is removed and a folder still held is retried on the next tick; the ticket read says whether it can be cancelled, which tickets wait on it and what it is really still waiting for (nothing once finished); a card counts cancelled tickets apart; the plan's floor check stops being asked once the plan is approved; a Director step that paused for you or failed now says so; a harness keeps its last test result through a harmless save and shows its last run; the Director's reply no longer garbles a character split between two chunks. The web half (cancel button, status words, harness row) is next.
- 2026-10-23: History tab on cards and tickets (P5, step 5.1b, web half): each page has a History tab that tells the story in plain words, grouped by day with the newest at the bottom (or on top with Newest first), who did it, when, the states it moved between, how long work waited, and a link to the run, question, review or ticket behind each line; filters for status changes only and for what needed you; long notes fold behind Show more; older entries load on request, and the tab refreshes live while work moves.
- 2026-10-23: Honest cost, backend half (eval fix 6, step 1; x-0017 pending your approval): the Director's own steps (planning, chat, escalation answers, sign-off checks) now each leave a dated row in a spend ledger, so Cost, Overview and the ticket page add them to the Workers' runs and split the two (the Cost page no longer shows $7.43 while the cards add up to $24.86); a failed step still records what it cost, and one budget answer (the card's cap, else the project's, else the Forge default) drives the warnings, the Inbox and the card's Details data. The screens still show the old totals until the web half lands. Director spend from before this change is dated by card, so it appears as one day's spike.

- 2026-10-23 — Phase 5.1a (backend of the History tab): `GET /tickets/:id/history` and `GET /cards/:id/history` return a plain-language list of what a ticket or card went through and why; ticket moves store their reason; commits Forge makes carry `Forge-Ticket` and `Forge-Run` trailers. The tab itself (5.1b) is next.
- 2026-10-23: The card chat folds runs of three or more ticket log lines into one line that opens to them, and the log lines read in owner words with the bullet fixed; charts, 404 headings, faint and green text contrast, phone board start and the Director model fields were tidied for accessibility.
- 2026-10-23: The Director now signs tier C changes itself when the floor is clean (d-0181): every check passed, no critical or high finding, the plan check passed, no owner override and no secrets path (env files, keys, secrets folders) in the diff; a card note names the merge commit to revert. Anything else waits for you and the sign-off card says which condition failed. The one-click revert button is not built yet; Always ask in Director settings still keeps every tier C sign-off with you.
- 2026-10-23: Work starts the moment it can, not on the next tick: every event that frees work (answer, settled run, finished job, edit, cancel, merge, relation change) asks for a tick at once, and a timer fires a waiting ticket's `not_before` wake, quota reset or hold; the periodic tick stays as the safety sweep.
- 2026-10-23: Re-plan, Cancel ticket and Merge anyway ask for confirmation with the real consequences listed from live data (held and kept tickets and the stop; the run, branch, pull request and waiting tickets; the overruled check), the ticket named on the confirm button, Cancel focused first, Send back for rework offered for a mechanical stop; sign-off cards lead with the Director's recommendation and evidence.
- 2026-10-23: Honest status on screen: board tiles, the card's Tickets tab and the ticket header show a phase chip (Queued, Waiting for a slot, Held by re-plan, Working...) with a one-line reason linking the tickets and card involved; a ticket whose question was already answered no longer sits in Needs you, and an answer shows what happens next.
- 2026-10-23: Re-plan from a ticket passes the Director why the ticket stopped (cause, findings, gate failures, last run), so it fixes that ticket first instead of guessing at plan drift.
- 2026-10-23: The board says why a ticket waits; Needs you lists only items waiting on you (phase and wait line on every ticket row, slot holders named, a ticket whose answer is given no longer counts, answers reply with what happens next). Backend of step 2.1; the board chip and line come in step 2.2.
- 2026-10-23: What waits on you is now a slim alert under the title of a card or ticket ("Needs your sign-off", "Needs your attention · 2") with an Open button; Open shows a scrollable window with each item and all its actions, newest first, instead of a big block above the message box. The Inbox keeps its list.
- 2026-10-23: Tickets can be edited: priority, dependencies, description (`PATCH /tickets/:id`, one engine door, loop and cross-project checks, logged on the card); the Director can set dependencies, priority and description from the card chat and file restored work at the priority of the ticket it restores; ticket ids are shown with their plan keys after approval.
- 2026-10-23: Bypass permissions, step AA-2 (d-0183): Settings, Harnesses has a "Bypass permissions" switch per harness, on by default, with the plain warning (Workers run without asking; secrets, Forge's data folder, files outside the workspace, pushing and destructive commands stay blocked; Workers run as your Windows account). Every Worker run, Express included, starts in the harness's no-prompt mode and its tool grant follows the switch; turning it off restores the allow and ask rules.
- 2026-10-23: Bypass permissions, step AA-1 (d-0183): each harness gets a Bypass permissions setting, on by default; when on, the Claude driver starts Claude Code in its no-prompt mode and the tool policy allows every ask except a hard floor (Forge's data folder, secrets, paths outside the worktree, push and publish, destructive commands). A live probe confirmed Forge's hook still blocks under bypass. The engine wiring and the Settings switch follow (AA-2).

- 2026-10-23: Notification stack gets a "Close all" button (two or more closable cards; running jobs and pinned notices stay).
- 2026-10-23: Retries tell the Worker why it stopped; a ticket whose setup finished starts first.
- 2026-10-23: A new plan no longer cancels tickets that have started; approval shows what will be cancelled and what is not covered, and the Director will not approve on its own when a cancelled ticket's work is not covered.
- 2026-10-23: Approve and merge now accepts checks the owner overruled (a held G1 you chose Merge anyway on no longer blocks the final approval); the card note names what was overruled.
- 2026-10-22: Director planning, chat and triage run in the background, up to 3 at once (Settings → Director); Workers no longer wait behind planning; run start times are the real spawn time so fresh runs are not killed as stalled.
- 2026-10-22: Conflicts with main resolve without a re-plan (eval fix 4): Forge merges main into the ticket branch, the ticket's Worker resolves, up to 2 tries, then asks you; cancelling a ticket closes its PR and deletes its branch.
- 2026-10-22: G1 stops failing honest work (eval fix 3): folder searches now count as reads, a group-qualified test name ("shelf add rejects an empty title") matches the test declared under it, the proof of paused and errored runs is kept until the ticket closes, a ticket whose earlier proof is gone is held with Merge anyway (or sent back to re-apply the files) instead of dead-ending, and a Worker that used all its turns is shown as such, not retried, with the turns used and a link to Settings, Limits to raise them.
- 2026-10-21: Workspace setup in the web app and design docs (d-0180, d-0176): project settings, Checks tab, gets a "Before each ticket" section (detected steps with the file they came from and Customise, Use detected, a No setup switch, per-step Advanced options, validation before Save); the Project tab lists detected ecosystems with Detect again; a failed setup step is a card that names the step and its command, says nothing was spent, shows the last 40 lines it printed and offers Try again, Edit setup steps, Start without setup (after a confirm) and Cancel ticket; a preparing ticket says which step is running; the add-project Checks step shows what Forge will run before each ticket; `execution-plane.md`, `verification-plane.md` and `tool-system.md` describe the Prepare state.
- 2026-10-20: Real tool approvals in the dock (d-0175): when a Standard or Full Worker's step needs your yes (an install, an edit under a sensitive folder), it pauses and the needs-you dock, the Ticket page and the Inbox show the exact command with Allow once, Always for this project (the rule spelled out) and Deny; the Worker resumes with your answer, and Settings, Project, Tool approvals lists every "always" rule with Revoke.
- 2026-10-20: Workers can now read web pages on their own: in the Standard and Full lanes a Worker fetching library or API docs is no longer silently denied; private addresses, banned hosts and the size caps still apply, and Express stays without web access.
- 2026-10-20: A Claude Code update no longer wastes a run or asks for the same approvals again: tools whose shape the owner already decided carry over to the new build, and a ticket whose build still has undecided tools parks with a plain "approve its tools in Settings" item instead of starting a Worker that would be denied on every call.
- 2026-10-20: G1 no longer dead-ends the owner on gate configuration (d-0173): a new project may add its own tsconfig, vitest and eslint config files, and a G1 failure on config files alone is held for the owner (Merge anyway, Send back, Re-plan, Cancel) instead of reworked.
- 2026-10-14 — Product shape decided (d-0172, step 3): the Ticket page now has the Card page's frame: a one-row header (id, title, one status pill, cost) with a slim line for blockers and why it is not moving, the Worker thread as the main column, and everything waiting on you (a Worker question, a failure, a held decision, a sign-off, finished work to review) in one dock above the steer box, one item at a time, acted on in place (merging keeps its confirm). Review, Runs and Details sit in a rail beside the thread from 1280 px, as tabs from 1024 px (the review repeats the dock so the decision sits beside the evidence) and as a sheet below that; the old banner stack is gone.
- 2026-10-20: Card page redesign (d-0172, web half; the server sends `needs_you_detail`): a one-row header (title, one status pill, cost, a `⋯` menu holding Change type and Close card), the chat as the main column with the message box always visible, and everything waiting on you in one needs-you dock above the message box that shows one item at a time (`n of N`, arrow keys, reason chips with a Reasons list, at most a primary and a secondary action, folded to one line on a phone while you type); an open Director question is answered there or by typing in the message box; the chat keeps a one-line record of each raise, question and plan; Plan, Evidence, Tickets and Details sit in a rail beside the chat from 1280 px (tabs from 1024 px, a full-screen sheet below); the old banner stack is gone. The Ticket page moves onto the same frame next.
- 2026-10-19: The card chat shows a typed answer to a Director question once instead of twice, an open question reads "Waiting for your answer" (answered ones read "Answered"), and the message box says it answers the open question; a card in the verifying phase can now be answered from the chat too.
- 2026-10-19: Research limits have high ceilings (d-0171): up to 10 rounds, 100 searches, 100 pages, 20 MB of page text and 100 runs per card, since search and page reads cost nothing; the page text a research call carries stays capped so a long run fits the model.
- 2026-10-19: The welcome flow no longer has a data-folder step: it opens at harnesses and logins (three steps), and the data folder is always `%LOCALAPPDATA%\Forge` (d-0170), shown under Forge settings, General; the `forge-home.json` override is removed (`FORGE_HOME` stays for dev and tests).
- 2026-10-19: The sidebar shows one Forge settings entry that opens General (the other sections stay as tabs on that page); `pnpm dev` runs the server and the web app with live reload on both sides, `pnpm prod` builds and starts Forge in the background, `pnpm stop` stops it.
- 2026-10-19: Memory in the database (S7, x-0013, d-0168): each project's decisions, rejected approaches, proposals and outcomes move from a private git repo into Forge's database (append-only, with version history); the old repo is imported at start, checked record by record and deleted only after a verified backup; the Director rewrites a question into key words and finds relevant and related records by full-text search plus links and tags, so planning prompts carry pinned records, the top matches and every rejected approach instead of all memory (about 15K characters instead of 97K on this repo); Workers get read-only memory search, get and related tools; the Memory screen has search with filters, a record page with history and related records, and markdown export; `forge memory search|get|related` searches this repo's own development memory.
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
- 2026-10-16: Worker sandbox research (cloudroom-core teardown, local and remote sandbox surveys): requirement recorded (d-0161), design proposed (x-0015), phased plan `docs/briefs/worker-sandbox-plan.md`; not scheduled.
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
