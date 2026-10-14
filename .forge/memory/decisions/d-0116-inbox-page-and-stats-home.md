---
id: d-0116
kind: decision
statement: (1) Tickets are clickable wherever a card shows them - on Board cards (each ticket id opens the card page on the Tickets tab with that ticket expanded) and in the card's plan rows. (2) An Inbox page, modelled on Paperclip's inbox, holds everything that needs the user or has news for them - decisions (plan approvals, merge holds, sensitive-path sign-offs, issue verdicts awaiting approval), Worker questions, parked or failed runs, budget hits, harness version / tool approvals, stale-card nudges, and unread activity on cards. Items can be marked read and archived without changing the underlying card or ticket, and resurface when new activity arrives; tabs for Needs action / Unread / All / Archived, grouping, filters, keyboard navigation, and a badge count in the sidebar. (3) Home changes to project statistics only - stats and graphs for the project; the "Waiting on you" and "In progress" lists move out of Home (to Inbox and Board).
source: { type: chat, ref: "2026-10-14 UI review: \"in every card the tickets needs to be clickable. we are missing the Inbox Page like paperclip. we need changes in main page, it will only show full project stats with graph etc\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0104, d-0079]
tags: [ui, inbox, home, stats, board, cards]
pinned: false
---

Paperclip reference (paperclipai/paperclip HEAD, 2026-10-14): `maps/feature-map/inbox-search.md`,
`ui/src/lib/inbox.ts` - tabs mine/recent/unread/blocked/all; item kinds issue,
approval, failed_run, join_request; read state and archive ("triage without
pretending the task is complete"); dismissals resurface on newer activity;
group-by type/assignee/project; separate decision queues.
Director note: Inbox defaults to the current project with an "All projects"
switch, since things can need the user in projects they are not looking at;
confirm. The Inbox becomes the control-room inbox of d-0079.
