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

Amended by d-0104: there is no company-wide Home. Home is project-scoped and
opens on the first connected project; a project switcher at the top of the
sidebar changes project in real time, with an in-page alert when the view has
unsaved changes. Company-level pages (harnesses, GitHub, models, limits,
tools, notifications, backups) live under "Forge settings" at the foot of the
sidebar. Project Home = readout line + "Waiting on you" + "In progress" (stage
track per ticket) + "Ask the Director" bar. "Waiting on you" has a view
switcher (List / Compact / Grouped in the prototype); what each view shows is
decided after the Board, Director chat and Ticket pages are approved. Ledger
(autonomy tiers) is deferred.

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
