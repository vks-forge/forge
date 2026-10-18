# Control room — screen map

Approved 2026-10-14 (d-0102). Replaces the screen table in
`control-room-and-platform.md` §2 for the installed product (d-0082 … d-0099).
Every screen gets a hallmark pass and a Nielsen-10 pass before it is built.

## Map

```
First-run wizard (full screen, once)
  1 Data folder → 2 Harnesses & logins → 3 Connect GitHub → 4 First project

Left sidebar (always visible)
├─ Home ............ "Needs you" queue + live Workers + quota waits + spend today
├─ Projects ........ list with health (running, needs-you, failing checks)
│   └─ Project
│       ├─ Chat ........ talk to the Director → becomes tickets
│       ├─ Board ....... kanban by ticket state
│       ├─ Ticket ...... live thread, gate strip, diff, runs, lane history
│       ├─ Memory ...... decisions / rejected / proposals (approve)
│       └─ Settings .... overrides, checks by role, repo & branch, memory mirror
├─ Runs ............ every Worker across projects: working / waiting / done
├─ Cost ............ spend per run → ticket → project, budgets
└─ Settings (company)
    ├─ General ......... data folder, backups, updates
    ├─ Harnesses ....... installed CLIs, login mode, test, version approvals
    ├─ GitHub .......... connections, installations, rotate key
    ├─ Models & budgets
    ├─ Limits & queue .. global / per-project / per-harness
    ├─ Agents .......... roster, editor, templates, Director drafts (S5a)
    ├─ Pipelines ....... per-lane stage lists (Express / Standard / Full), reset to built-in (S5b)
    ├─ Skills           (editor, after x-0011)
    ├─ Tools ........... catalogue, changed-tool approvals
    └─ Notifications

New project flow (modal steps)
  Source (GitHub repo | from scratch) → Local folder → Detect → Verify run → Director chat
```

Amended by d-0162: `/` is the cross-project **Overview** (KPI strip, needs
attention, spend and activity charts, projects table, cost coverage; range,
grouping, project filter and archived toggle behind one Filter button, in the URL,
refreshed every 30 s; range starts with Today, grouped by the hour).
It replaces the redirect to the last project; the switcher still remembers it.
A fresh install with no project opens the first-run wizard. "Overview" is first
in the sidebar's Forge section and the logo links to it.

Amended by d-0104: there is no company-wide Home. Home is project-scoped and
opens on the first connected project; a project switcher at the top of the
sidebar changes project in real time, with an in-page alert when the view has
unsaved changes. Company-level pages (harnesses, GitHub, models, limits,
tools, notifications, backups) live under "Forge settings" at the foot of the
sidebar. Project Home = header (title, the Overview's Filter button with range and
grouping only beside the Updated status, "New card") + "Waiting on you" + "In
progress" (stage track per ticket) + the Overview's key figures, charts, spend
rings by harness and lane and cost coverage scoped to the project (the free-text
Ask bar is gone, d-0138; the readout line and 7/30/90 switch are replaced). "Waiting on you" has a view
switcher (List / Compact / Grouped in the prototype); what each view shows is
decided after the Board, Director chat and Ticket pages are approved. Ledger
(autonomy tiers) is deferred.

Cards and issues (d-0105 … d-0115, card-first flow d-0128 … d-0160): the project
Board shows **Cards** (one per chat request or approved GitHub issue; columns
Shaping, Needs you, Queued, In progress, Done and a collapsed Closed strip, rolled
up from the card's phase and tickets; there is no New column and no Ask bar, the
Director starts at once) with a toggle to a **Tickets** view. All columns fit at
1440 px; narrower screens scroll inside the board. A card face shows id, type,
title, a phase line ("Grilling · 3 open points", "Plan v2 ready", "4/7 tickets"),
a priority mark, a progress bar and Blocked by / Blocks chips; hovering or
focusing a card keeps its dependency chain lit and dims the rest, and cards glide
between columns live (instant swap under reduced motion). Opening a card opens
the **Card page** (`/p/:slug/cards/:id/<tab>`, U1): a compact header (id, column, phase,
source, type, a small muted cost with a Director / tickets split on hover, Close card), the
banners that need you (a pinned **Needs you** banner whose every action works, waiting tickets),
a tab strip and one panel. Tabs are real links: **Conversation** (default; the chat with the
card's Director: grill questions with option buttons, steps, a ready-plan card, system lines),
**Plan** (the fixed plan sections, dependency graph, version picker with diff, Approve plan /
Request changes / light ticket edits), **Tickets** (a timeline with state, lane and cost) and
**Details** (source, creator, times, budget cap, summary and the cost breakdown: Director, each
ticket, total, "not recorded" never shown as free). An unknown tab replaces itself with the
conversation, Back and Forward step through views, each tab keeps its scroll. The chat is a
pane: bubbles are narrow (70% / 36rem) and quiet, author and time show once per group with day
separators, the list scrolls above a composer docked at the bottom. The **Ticket page**
(`/p/:slug/tickets/:id/<tab>`) is the same frame: **Conversation** (the live Worker thread with
the steer box docked below), **Review** (only while the ticket waits on review or sign-off, or
is held for your decision: the pending decision or sign-off card, what will be merged, each check's findings with
`file:line`, rework, cancel), **Runs** (status,
duration, cost per run; a run opens in Conversation via `?run=`) and **Details** (metadata,
gates, cost by run). A question that waits on you and a ready-for-review notice stay above the
tabs. Cost also shows small on Board tiles.

Waiting tickets (S4a, d-0135 / d-0141): a ticket that cannot go on waits on the owner as
one **escalation**, drawn by one card in three places, so acting in one settles the
others. In the card chat it is a block (settled once settled: "Answered by you / by the
Director · 2 min ago"), a second banner counts the owner's waiting tickets and
"Show the first" focuses its card; on the Ticket page it sits above the thread; in the
Inbox the row's **Respond** opens it in a drawer. Kinds: **question** (the Director's
note, Use suggested, up to four options with Recommended, free text, Cancel), **failure**
(summary, diagnosis, attempts folded; held lane: Run as Express / Re-plan / Cancel; capped,
refused, out of turns or timed out: Retry with an optional note / Re-plan / Cancel;
Re-plan asks for a comment and says what happens to the tickets, Cancel asks and lists
dependents with Cancel all), **setup** (Fix in settings link, I fixed it check again,
"resumes by itself"), **decision** (S5c, a held ticket: blocking findings worst first with
`file:line`, how often it was sent back, the files outside the plan; Merge anyway or Continue need
a reason and say they overrule a hold, then Send back / Re-plan / Cancel) and **sign-off** (the
tier in words, what the checks said, why the Director did not sign; Approve and merge, or Sign
off and merge asking who signs for tier C). While the Director is still looking the page says so and offers
nothing. A ticket in review, sign-off or a scheduler hold shows Send back for rework /
Cancel or an "it starts by itself" line. The project sidebar gains **Issues** (open GitHub issues with verdict,
confidence, size, risk and the analysis report; Approve → card, Re-analyse,
Skip) and later **PRs**. Project nav: Home, Board, Issues, (PRs), Chat, Runs,
Memory, Project settings.

Amended by the UI pass U1 (shared surfaces, d-0164):
- **Tickets** joins the project nav after Board (`/p/:slug/tickets`): a table of every
  ticket (id, title, card, lane, state chip, cost, updated) with state and lane filters,
  debounced search, sort and server-side pages (10/25/50), all in the URL; a row opens
  `/p/:slug/tickets/:id`.
- **Settings use left tabs**: Forge settings (General, Director, Agents, Pipelines, Limits, Harnesses,
  GitHub) and project settings (`/p/:slug/settings/<section>`: project, workers, checks, repository,
  director, agents, pipelines, history, danger) are a sticky vertical tab list beside the section; below 768 px
  the tabs become a picker. One draft and one save bar span the project tabs; switching tabs
  keeps edits, leaving settings still asks.
- **Agents** (S5a-B): Forge settings → Agents (`/settings/agents`) and a project's Agents tab
  (`/p/:slug/settings/agents`, which has no shared save bar) show a roster, one row per agent: name,
  tags (built-in, edited / overridden, project, disabled, archived), role, description, and a
  Runs on line with a readiness dot that says in words whether the harness can run now. **New
  agent** is one menu: From scratch, From template (a gallery dialog), Describe it to the Director
  (a dialog with progress and Cancel; the draft opens in the editor with the Director's rationale
  and open questions, and nothing is saved until Create). A row has Edit (Override on a project's
  view of a company agent) and a more-actions menu: Duplicate (name, reason, and on a project
  whether the copy is the project's or the company's), Archive / Unarchive, Reset (built-in
  edited, or a project override; danger confirm), Disable here / Enable here (the implementer
  says why it cannot be switched off). Every state change takes a reason, pre-filled. The
  **editor** is one form for every source: Identity, Instructions (write / preview), Runs on
  (harness picker where a harness that cannot run is disabled with its reason and a Fix in
  settings link; model picker grouped by what is recommended for the role, with Harness default,
  Forge default for the implementer only, and a custom id; up to five fallbacks with move buttons),
  Tools (by role: write tools greyed with the reason for reviewers and researchers), Write scope,
  Inputs and output, Skills and memory, Budget, Test agent (the cost note comes first), History,
  and a sticky save bar (reason of 3 to 500 characters, a conflict choice on 409, unsaved-changes
  guard). A project override edits only Instructions and Runs on. The Director page's model rows
  use the models the harness reports.
- **Pipelines** (S5b-B): Forge settings → Pipelines (`/settings/pipelines`) and a project's
  Pipelines tab (`/p/:slug/settings/pipelines`, no shared save bar) show the lanes as tabs
  (Express, Standard, Full; `?lane=` in the URL). Each lane has a tag (Built-in or Edited; in a
  project "Same as company default" or "Changed from company default"), a **Reset** that asks for
  a reason (held, with its reason, while the lane is already the default) and the **list
  editor**: ordered rows (kind icon, name, agent and role, move up and down, remove, Details),
  merge locked last and G1 pinned with a lock and the reason, and **Add stage** (Agent, Script
  gate, Run-together group of 2 to 4 checks, Writers together of 2 to 4 writers with their
  folders shown and overlapping folders refused, Director check, Sign-off (the Director signs
  tier A and B, or always you; tier C is always you); one sign-off or older Human sign-off and
  one Director check at most). Details by kind: an
  agent Picker over the effective roster (switched-off and archived agents shown greyed with the
  reason), the red-proof switch for a tester, for a check the d-0165 policy (send back up to 2
  times or hold for me; blocking severities; send back to a writer above), for a script gate its
  command, folder, time limit and guarded paths, for the human stage what to ask. Problems from
  core's rules show at once beside their row (or above the list for list-wide ones), the
  server's verdict from a debounced validate call joins them, warnings (a critic on the writer's
  model family) show as a notice, and **Save stays held** while a problem stands. The save bar
  has the reason (3 to 500 characters), the version being saved over, a 409 conflict banner (keep
  mine or reload) and the leave guard. All three lanes are live. A project also has
  **Routing rules**: glob chips and an agent Picker that offers reviewers and researchers only,
  reorder, remove, its own save bar. States: loading, error with retry, no agents (links to
  Agents), no routing rules, saved ("Saved as version N").
- **Ticket pipeline strip** (S5b-B): above the ticket tabs, one chip per stage (icon and word:
  Not yet, Running, Passed, Failed, Could not run, Waiting for you, Done earlier, Skipped), the
  lane, "Rework 1 of 2" and "added by rule" for a routed check. A chip opens the stage's detail
  in place: agent, round, times, a link to its run, finding counts by severity, the reviewer's
  summary and the artifacts (loaded when opened; the Worker's own account is labelled and the
  panel says a reviewer never saw it). A group is a dashed frame with a chip per member (a
  writer-group member also shows the folders it may write). The sign-off chip reads "Signed by
  the Director", "Signed by you" or "Waiting for you"; a Director check with no plan reads "No
  plan to check against" and otherwise opens as an acceptance checklist (Met, Not met, Unclear
  with evidence) and the files outside the plan; an owner overrule shows "overruled by you" on
  the chip and its reason in the detail; a stage with a warning (a critic on the Worker's model
  family) says "has a note". Findings list each with severity, `file:line` and evidence. The strip
  refetches when the project stream names its ticket (every stage write), with a slow poll behind
  it. Before the first dispatch it says "Starts when the ticket is dispatched." The Review tab
  lists each check that reported, with counts, words and every finding, and the rework it took.
- **Unsaved dot**: a project-settings tab whose fields differ from the saved version shows a
  small amber dot (spoken as "unsaved changes"; "(unsaved)" in the phone picker).
- **Empty states** are one component (centred, quiet icon, title, one help line, actions;
  compact in columns and panels). **Scroll areas** share one thin themed scrollbar that wakes
  on hover or scroll.
- **Cost**: Top tickets and Top runs are server-paged (10/25/50, "x-y of N"); every chart
  shows its value in the app's Tooltip (hover or arrow keys), never a native title bubble.
- **Inbox alerts**: a new needs-you item raises a toast with Open, bumps the sidebar badge,
  puts `(n)` in the tab title and, if the owner turned it on in Settings, General (per
  browser), a desktop notification while the tab is hidden.

Visual direction: A "Instrument" (Instrument Sans + IBM Plex Mono, graphite
with one cobalt signal, amber only for what needs the user, critically damped
springs). Prototype: https://claude.ai/artifact/1bdAeov3SxXfQYydSrgWrP

## Prototype build order

| # | Screens |
|---|---|
| 1 | App shell (sidebar, routing, theme) + Home |
| 2 | First-run wizard |
| 3 | Projects list + new project flow |
| 4 | Project Board + Ticket (live thread) + Chat |
| 5 | Company Settings: Harnesses, GitHub, Limits, General |
| 6 | Project Settings, Memory, Runs, Cost |
| 5a | Agents: company roster and editor, project overrides (S5a-B) |
| 5b | Pipelines: company defaults, project overrides and routing rules, the ticket's stage strip (S5b-B) |
| later | Skills editor (after x-0011) |

Screens run on mock data behind the API shapes of build-plan batches B3–B12
and switch to the real endpoints as they land.
