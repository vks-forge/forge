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
    ├─ Agents · Pipelines · Skills   (editors, after x-0011)
    ├─ Tools ........... catalogue, changed-tool approvals
    └─ Notifications

New project flow (modal steps)
  Source (GitHub repo | from scratch) → Local folder → Detect → Verify run → Director chat
```

Amended by d-0162: `/` is the cross-project **Overview** (KPI strip, needs
attention, spend and activity charts, projects table, cost coverage; range,
grouping, project filter and archived toggle in the URL, refreshed every 30 s).
It replaces the redirect to the last project; the switcher still remembers it.
A fresh install with no project opens the first-run wizard. "Overview" is first
in the sidebar's Forge section and the logo links to it.

Amended by d-0104: there is no company-wide Home. Home is project-scoped and
opens on the first connected project; a project switcher at the top of the
sidebar changes project in real time, with an in-page alert when the view has
unsaved changes. Company-level pages (harnesses, GitHub, models, limits,
tools, notifications, backups) live under "Forge settings" at the foot of the
sidebar. Project Home = readout line + "Waiting on you" + "In progress" (stage
track per ticket) + a "New card" button (the free-text Ask bar is gone, d-0138). "Waiting on you" has a view
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
the **Card page**: the chat with the card's Director is the main column (grill
questions with option buttons, steps, a ready-plan card, system lines, and a
pinned **Needs you** banner whose every action works) beside a side panel with
tabs **Plan** (the fixed plan sections, dependency graph, version picker with
diff, Approve plan / Request changes / light ticket edits), **Tickets** (a
timeline) and **Details**; below 768 px the panel becomes tabs Chat / Plan /
Tickets / Details. Ticket detail (status, live Worker thread with direct steer,
gates, PR and merge links) is its own page.

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
dependents with Cancel all) and **setup** (Fix in settings link, I fixed it check again,
"resumes by itself"). While the Director is still looking the page says so and offers
nothing. A ticket in review, sign-off or a scheduler hold shows Send back for rework /
Cancel or an "it starts by itself" line. The project sidebar gains **Issues** (open GitHub issues with verdict,
confidence, size, risk and the analysis report; Approve → card, Re-analyse,
Skip) and later **PRs**. Project nav: Home, Board, Issues, (PRs), Chat, Runs,
Memory, Project settings.

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
| later | Agents, Pipelines, Skills editors (after x-0011) |

Screens run on mock data behind the API shapes of build-plan batches B3–B12
and switch to the real endpoints as they land.
