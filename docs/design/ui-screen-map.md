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
│       ├─ Memory ...... search, decisions / rejected / proposals (approve), record page
│       └─ Settings .... overrides, checks by role, repo & branch, memory mirror
├─ Runs ............ every Worker across projects: working / waiting / done
├─ Cost ............ spend per run → ticket → project, budgets
└─ Settings (company)
    ├─ General ......... data folder, backups, updates
    ├─ Harnesses ....... installed CLIs, login mode, test, version approvals
    ├─ GitHub .......... connections, installations, rotate key
    ├─ Models & budgets
    ├─ Limits & queue .. global / per-project / per-harness
    ├─ Research ........ search provider, host lists, test provider (S6-B)
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
title, a phase line ("Grilling · 3 open points", "Plan v2 ready", "4/7 tickets",
"2 of 2 done, 1 cancelled"), a roll-up line ("4 of 11 done · 2 running · 1 waiting for you"), a priority mark, a progress bar (cancelled tickets are
out of the count, so a finished card's bar is full) and Blocked by / Blocks chips; hovering or
focusing a card keeps its dependency chain lit and dims the rest, and cards glide
between columns live (instant swap under reduced motion). A ticket tile in the Tickets view shows, without opening it, "Stage 2/5 · Review", a ticking "run 2 · implementer · 10m 03s" line with a live dot (still under reduced motion, paused in a hidden tab), the phase chip and why it waits, one action when it fits (Retry, or Open to answer when it waits for you), "Cost so far" and "updated 5 min ago"; text truncates with the full text in its tooltip down to 320 px. Opening a card opens
the **Card page** (`/p/:slug/cards/:id/<tab>`, d-0172): the chat is the main column and the
message box is always visible. One-row header (about 48 px): back link, id, title (truncates),
ONE status pill ("Needs you · Plan v2 ready", "Closed", else the phase), a small muted cost with a
Director / tickets split on hover, and a `⋯` menu holding Change type and Close card (each keeps
its confirm dialog; a closed card has no menu). Offline and could-not-refresh are one slim line
under the header, not boxes. Right under the title row sits the **needs-you alert**
(`components/work/needs-you-pill.tsx`, fed by `needs_you_detail` of `GET /cards/:id`): one slim
line, "Needs your attention" (or "Needs your sign-off" / "Needs your approval" when every item
asks that, with "· N" when several wait) and an **Open** button; nothing is drawn when nothing
waits. Open shows a scrollable modal (focus trapped, Esc or "Decide later" closes it and focus
returns to Open, closing answers nothing, it can be reopened, it works at 320 px) listing every
item newest first, each with a short title, reason chips with a `Reasons` list, its escalation
card or question in full with all its actions (no Respond step), at most one primary and one
secondary action; keys 1 to 4 pick an option; when the last item is settled the modal closes
itself and the alert goes away. Items: plan approval (Approve plan… with the confirm
that names the tickets, Request changes, Open the plan), the Director's open question (options with
a Recommended badge, Why it matters on demand, 1 to 4 pick an option, "Use your recommendations for
the rest", "Enough, write the plan"; typing in the message box is the free-text answer, there is no
separate Other box), the step budget (Retry the step, Raise the step budget), start planning, a held
or stuck ticket (its escalation card in the modal, Open the ticket, Run as Express) and
finished work (Open the ticket). The chat keeps a one-line record of each raise, question and
ready plan ("Open plan →" is a link, never a primary button) and hides a step line the next raise
explains. **Plan, Evidence, Tickets, Details** are real links (the tab is the path segment):
from 1280 px they sit in a rail of 400 to 440 px beside the chat (no Conversation tab; the rail
opens on the plan while one exists, plan approval reasons at the top, the Approve / Request changes
bar sticky at the foot); from 1024 to 1279 px they are tabs above the chat (Conversation first);
below 1024 px the chat is the page and a header button
opens them as a full-screen sheet (Esc or "Back to chat" closes, Back steps out of it). **Plan**
(the fixed plan sections, dependency graph, version picker with diff, light ticket edits),
**Tickets** (a timeline with the ticket's phase in words, the reason line with links, lane and cost) and **Details** (source, creator, times, budget
cap, summary and the cost breakdown: Director, each ticket, total, "not recorded" never shown as
free). An unknown tab replaces itself with the conversation, Back and Forward step through views,
each tab keeps its scroll. The chat is a pane: bubbles are narrow (70% / 36rem) and quiet, author
and time show once per group with day separators, the list scrolls above the composer and
stays pinned to the newest line. The **Ticket page**
(`/p/:slug/tickets/:id/<tab>`) is the same frame (d-0172): a one-row header (back, id,
truncating title, one status pill showing the phase in words (Queued, Waiting for a slot, Held by re-plan, Working...), cost, a `⋯` "Ticket actions" menu whose one danger entry "Cancel ticket…" opens the shared cancel dialog: what is stopped and deleted, the tickets that wait on it cancelled together, an optional reason, "Cancel <id>" or "Keep running") with a slim line for the reason (tickets and card it names are links; "Waiting on" lists only what is still open; amber "Needs you" only for an open owner item). A finished ticket shows no wait: it leads with one outcome sentence ("Merged at ...", "Ticket cancelled at ..."), its pipeline chips are muted history ("Last check: did not pass (round 4)") and its run ends "Worker run 3 finished / was stopped / failed",
the pipeline strip, then the **Conversation** (the live Worker thread with the steer box
docked below) as the main column. Everything waiting on you is behind the same **needs-you
alert** under the title (on every tab) and its modal, newest first: a Worker question, a failure, a setup, a
held decision and a sign-off open as the shared escalation card in place, and finished work
with no escalation shows Approve and merge (behind its confirm), Send back for rework and
Cancel; each links to the review. **Review** (only while the ticket waits on review or
sign-off, or is held for your decision: gates, each check's findings with `file:line`, what
will be merged), **Runs** (status, duration, cost per run; a run opens in Conversation via
`?run=`), **History** (what the ticket went through and why, below) and **Details** (metadata, PR, card, depends on, gates, cost by run split Workers and Director) sit in a rail
beside the thread from 1280 px, as tabs above it from 1024 px (the Conversation tab carries
a dot while something waits; the alert stays under the header on every tab, so the decision
is one press from its evidence) and as a full-screen sheet below that (Esc closes). Cost also shows small on Board tiles.

**History tab** (Card and Ticket pages, `/<tab>` = `history`): one story per card or ticket, grouped by the
reader's day (Today, Yesterday, a date), the newest at the bottom, with a "Newest first" toggle. Each row: an
actor icon with the word (You, Director, Forge, Worker), the plain sentence, from-to state chips in the Board's
words, a detail folded behind Show more when long, the time as "3 h ago" (exact time on hover) and "waited 2
days" when work waited. Filters "Status changes only" and "Needs you only" (questions, answers, sign-offs); each row
links to its run, question or review, and on a card a roll-up line opens that ticket's History. "Load earlier"
reads older entries. Loading is a skeleton, empty says "Nothing has happened yet", an error says what failed with
Try again, and a failed refresh keeps the list with one slim line. The project stream refreshes it live.

Waiting tickets (S4a, d-0135 / d-0141): a ticket that cannot go on waits on the owner as
one **escalation**, drawn by one card in three places, so acting in one settles the
others. In the card chat it is a block (settled once settled: "Answered by you / by the
Director · 2 min ago"), a second banner counts the owner's waiting tickets and
"Show the first" focuses its card; on the Ticket page it is an item of the needs-you modal; in the
Inbox the row's **Respond** opens it in a drawer. Kinds: **question** (the Director's
note, Use suggested, up to four options with Recommended, free text, Cancel), **failure**
(summary, diagnosis, attempts folded; held lane: Run as Express / Re-plan / Cancel; capped,
refused, out of turns or timed out: Retry with an optional note / Re-plan / Cancel;
Re-plan, Cancel ticket and Merge anyway open a confirmation that lists, from live data, what they
change (held and kept tickets and the stop; the run, branch, pull request and waiting tickets; the
overruled check), name the ticket on the confirm button ("Re-plan CHE-6"), open with Cancel
focused, and for a mechanical stop Re-plan offers Send back for rework; a refused cancel lists
dependents with Cancel all), **setup** (Fix in settings link, I fixed it check again,
"resumes by itself"), **decision** (S5c, a held ticket: blocking findings worst first with
`file:line`, how often it was sent back, the files outside the plan; Merge anyway or Continue need
a reason and say they overrule a hold, then Send back / Re-plan / Cancel) and **sign-off** (leads
with the Director's recommendation and its evidence, then the
risk in words (Low risk, Moderate risk, Protected files), what the checks said, why the
Director did not sign (its own note also sits in the title of a protected-files sign-off);
Approve and merge, or Sign off and merge asking who signs for protected files). The Director
signs protected files itself only when every check passed and no secret file is touched (d-0181). While the Director is still looking the page says so and offers
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
- **Settings use left tabs**: Forge settings (General, Director, Agents, Pipelines, Limits, Research, Harnesses,
  GitHub) and project settings (`/p/:slug/settings/<section>`: project, workers, checks, repository,
  director, research, agents, pipelines, history, danger) are a sticky vertical tab list beside the section; below 768 px
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
  when every check passed and the change is within its limit, or always you; protected files
  follow the clean-record rule); one sign-off or older Human sign-off and
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
- **Director changes on the ticket** (S5d-B, d-0151 / d-0080): the strip shows a stage the Director
  added, moved or swapped with a badge ("Added by Director", "Moved by Director", "Swapped by
  Director", "Substitute") and its reason in the detail; a stage it removed stays as a dashed ghost
  ("Removed by the Director: ..."); a line "Changed by the Director (2 changes)" opens a log of every
  change, with the ones the engine could not apply listed as "Not applied" and why; a stage that ran
  on a fallback says "ran on fallback 2" (detail: "Ran on fallback 2 (sonnet)") or "ran as
  substitute", and the Runs tab shows each run's model and slot. On the Review tab and in a stage's
  detail every finding of a review has **Real** / **False alarm** buttons (pressed state is a word;
  pressing the pressed one clears; shown at once, put back with a sentence if the save fails).
- **Plan tab pipeline line** (S5d-B): a planned ticket with Director changes shows "Standard + 2 Director
  changes" and each change with its reason; one that removes a stage says "Needs your approval: removes
  review" (the floor reason says the plan waits for you). Edit tickets lists each change with "Take this
  change off" (undoable until saved); the owner may narrow, never add. Version diffs show the change.
- **Pipeline proposals** (S5d-B): after the same change on 3 tickets from 2 cards the Director suggests it
  for the project. It is an Inbox row of kind **Pipeline change** (Review opens a drawer) and a banner
  above the editor on that lane's tab: the lane with the change marked (Added, Removed, Moved, Agent
  changed), up to three of the Director's reasons linked to their tickets, **Accept change** (asks
  first, showing the lane after the change and an optional note; writes with the project's version) and
  **Reject** (a reason of 3 characters; "will not suggest this again unless the lane changes"). A
  lane edited since says "The lane changed since; nothing was applied." with Reject only. States:
  loading, error with retry, nothing pending (nothing shown), already decided (drawer).
- **Scorecards** (S5d-B): a project's Agents rows carry one line for 90 days ("Done without rework 75%
  (9 of 12) - Reworks 0.4 per ticket - $0.42 per ticket - 12 tickets"); the agent editor has a
  **Scorecard** section (slice: all, type, tier, lane; window 30 or 90 days; headline, reworks, holds,
  cost with "Priced for 18 of 20 runs", run time, fallbacks, findings verdicts); each lane tab ends with
  its pipeline shapes ("Standard + security-reviewer", Director-changed ones marked). Under 5 tickets
  the row says "Too few tickets to judge" and no rate; a figure with no data says "No data"; cost with
  none recorded says "No cost recorded". States: loading, empty, error with retry.
- **Fallback and substitute** (S5d-B): an agent's Runs on has "When every fallback fails": **Let the Director
  pick a substitute** (default) or **Pause and tell me**. A ticket with nowhere left to run waits as
  "No agent could run this stage" (why: the model is unavailable or rate limits; every try folded;
  Retry restarts from the first choice / Re-plan / Cancel ticket). When the Director switched agent the
  card chat says "The Director switched to <agent>: <reason>"; the owner never has a button for it.
- **Director settings** (S5d-B): Forge settings, Director has a model row "Pick a substitute agent", a
  **Ticket pipelines** section ("Let the Director adjust ticket pipelines", suggest after N tickets, from M
  cards, within D days), and a project can override it ("Director on ticket pipelines").
- **Unsaved dot**: a project-settings tab whose fields differ from the saved version shows a
  small amber dot (spoken as "unsaved changes"; "(unsaved)" in the phone picker).
- **Empty states** are one component (centred, quiet icon, title, one help line, actions;
  compact in columns and panels). **Scroll areas** share one thin themed scrollbar that wakes
  on hover or scroll.
- **Cost**: Top tickets and Top runs are server-paged (10/25/50, "x-y of N"); every chart
  shows its value in the app's Tooltip (hover or arrow keys), never a native title bubble.
  Spend is Workers (runs) plus the Director's own steps (the dated `director_spend` ledger,
  x-0017): Cost, Overview, card and ticket all show the total first and the split
  ("Workers $x · Director $y") beside it, so a project's total equals the sum of its cards.
  The card's budget row names the cap in force and whose it is (the card's own, the
  project's, or the Forge default), the same number the 80% and 100% warnings use.
  Per-day spend is two stacked series (Workers, Director) with a written legend, and a
  note says Director spend before 20 Oct is dated by card.
- **Message length**: the Director chat and the Worker steer box count from 90% of the
  8,000-character limit ("7,412 / 8,000"), hold Send over it and say "Shorten it or send
  it in two parts"; the New card description states its 20-character minimum up front with
  a live count. Closing a card says it stops any running Worker and cancels unfinished tickets.
- **Harness rows** say what the last Worker run did ("last run 07:12 (2.1.304)") apart from
  the live test button ("live test not run"), so a harness that has done real work is Working.
- **Inbox views and Mark all read**: tabs Needs action (only items that wait on a decision),
  Notices (items that only inform), Unread, All, Archived, each with a count. Notices and Unread
  show a **Mark all read** button above the list (not offered when nothing is unread, paused
  offline); one click, no confirmation (each item can be marked unread), then the notice
  "Marked 5 read". A refusal says "Could not mark them read. Nothing was changed."
- **Plan ticket care level**: Edit tickets gives each ticket a care-level picker (Express, Standard,
  Full, each with a plain sentence). A lane the owner picked shows "Set by you" (the automatic size
  checks leave it alone); the line also says protected files still run in Full.
- **Inbox alerts**: a new needs-you item raises a toast with Open, bumps the sidebar badge,
  puts `(n)` in the tab title and, if the owner turned it on in Settings, General (per
  browser), a desktop notification while the tab is hidden.

Visual direction: A "Instrument" (Instrument Sans + IBM Plex Mono, graphite
with one cobalt signal, amber only for what needs the user, critically damped
springs). Prototype: https://claude.ai/artifact/1bdAeov3SxXfQYydSrgWrP

Amended by S6-B (research and budget):
- **Card, Evidence tab** (`/p/:slug/cards/:id/evidence`; shown once the card has evidence or a
  finished research run, with a count badge): "Research used 2 of 4 runs", claims grouped under
  their question, each with a Verified or Unverified chip ("No quote matched the page"), its
  sources as domain, title and time, an expandable quote and **Open source**, which opens a side
  drawer with the stored page as plain text (never HTML), the quote marked, where the page came
  from and one external link (http or https only, `noopener noreferrer nofollow`). A list of
  every page read, and the notes research left when it could not run with a link to Research
  settings. States: loading, error with Try again, empty.
- **Card, Conversation**: a `research` event is one line, "Researched: 3 searches, 5 pages, 7
  facts (2 unverified)" with See the evidence, or "Research could not run" with the reason and
  Open Research settings. Ticket log lines read "FR-5 created: title" and "FR-15 is now Done (was
  Being checked)", the link, sentence and time in one block with the bullet in its own column; three
  or more in a row (never across a day, a message or a question) fold into one line, "Show 5
  updates · 3 tickets moved · 2 created: FR-15 Done, FR-16 In progress, +1", a button with
  `aria-expanded` that opens to the originals.
- **Card, Plan, Verification**: "Outside facts the plan rests on" with each claim's status, `E`
  links to the Evidence tab and "Needs your approval: rests on 1 unverified outside fact" when
  one is unverified. **Details** edits the card's budget cap (set, change, clear) and says it
  only warns.
- **Forge settings, Research** (`/settings/research`): provider (SearXNG or Off), address, extra
  allowed hosts, fetch allow and deny host lists, page timeout and **Test provider**, which tries
  the settings on screen without saving and says the latency, or the cause and the fix.
  **Director** gains Research limits (rounds, searches, pages, KB, runs per card, an optional
  per-call budget, Research during the grill) and **Add Research step** (once). Project
  settings gain a **Research** tab that can only narrow the company's setting.
- **Inbox**: a `budget_warning` row (kind Budget) opens the card's Details and offers
  **Acknowledge** (archive) and **Change cap** (a drawer with the cap box).
- **Ticket and Runs**: review findings list the pages a reviewer cited as links; the Runs tab
  ("Pages this run read", loaded when opened) and the run drawer ("Sources this run read") list
  the pages a Worker fetched.
- **Memory** (S7-B, `/p/:slug/memory`): a search box above the tabs (`/` focuses it, Esc clears, Enter
  searches at once, otherwise after 250 ms, from 2 characters). While a query is active the tabs give way
  to ranked results: id, kind and status chips, the statement, the matched words highlighted (drawn as text,
  never HTML), tags and, for an older decision that matched, the newer decision that replaced it with a
  link to the old one. Chips for kind, status and tag and an **Include superseded** switch narrow it; the
  query and chips live in the address (`?q=&kind=&status=&tag=&superseded=1`). States: loading, "No
  matches for ..." with Clear filters, error with Try again, offline, and a project still on files ("Search
  is not available yet", the list is narrowed by the words instead). A banner states where the memory is
  stored: nothing when no old repository existed, "Migrating..." with Check again, one quiet line with the
  backup path and Copy path when verified, a list of unreadable files with **Retry import** when some could
  not be read, the reason and Retry when it failed. **Export markdown** sits in the header.
- **Memory record** (S7-B, `/p/:slug/memory/:id`, replaces the drawer; `?record=` redirects here): id, kind,
  status and pin, the statement, whose word it is in one sentence ("Your decision", "Director's inference,
  approved by you on ..."), Approve and Reject for a pending proposal with "May conflict with" above them,
  the note on a record imported with defaults, facts (author, origin, source, dates, confidence, summary,
  aliases, tags), the notes as plain text, **Related** (up to five, a reason chip each, "Nothing related
  yet"), **Links** (replaces, replaced by, amends, reopens, cites, card, ticket), **History** (each state
  move with who, when and why, and the search-aid versions) and a footnote that records are never edited
  or deleted: to change one, supersede it. No edit, delete or revert control exists; the only text box is
  the rejection reason. A project still on files says links, history and related are not available yet and
  disables Export with the reason.
- **Director settings** (S7-B): Forge settings, Director has a model row "Memory search words" and a
  **Memory retrieval** section (rewrite on or off, rewrite timeout and budget, relevant decisions, pinned
  decisions, rejected approaches listed) with the note that rejected approaches are always all listed; a
  project can override it ("Director memory retrieval").

## Owner language (eval fix 9, D)

One glossary (`domain/plain-words.ts`) names every term the owner meets and says what it means;
one "what's this" button (`components/ui/whats-this.tsx`, a `?` that opens a popover, by tap or
keyboard, Esc returns focus) shows that text, once per screen next to the first use of a term:
Independent check (Overview tile, ticket review facts), Care level (ticket header, run facts),
Risk, Attempt, Connector version, AI coding tool, Tool session (run drawer), Re-read from cache
(Cost tokens tile), Safety minimum (plan tab). Header detail reads "Standard care · moderate risk".
Settings say "Changes take effect on the Director's next check, usually within a minute. No restart
needed." Cap lists use the state words ("In progress") and a picker of known AI coding tools.
Issues and Chat are hidden from the sidebar until built. The pipeline editor keeps G1 and lane
words, with the term in place, because that screen configures the gate itself.

A Director question with a recommended answer shows a primary **Use recommended: <label>** button
in the needs-you modal; the other options and digits 1 to 4 still work.

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
| 5d | Director pipelines: changes on the ticket strip and plan, finding marks, proposals, scorecards, substitute (S5d-B) |
| later | Skills editor (after x-0011) |

Screens run on mock data behind the API shapes of build-plan batches B3–B12
and switch to the real endpoints as they land.
