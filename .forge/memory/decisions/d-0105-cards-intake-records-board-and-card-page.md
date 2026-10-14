---
id: d-0105
kind: decision
statement: Every intake - a user chat request or a GitHub issue (later other sources) - becomes one Card on the project Board. A card has a type (discussion, plan, issue, pr-issue, ... - set to be refined) and is the record of the intake; Director triage happens inside the card and produces zero or more Tickets linked to it (a ticket always belongs to a card). The Board shows Cards by default with a toggle to a Tickets view (engine-state columns), ticket cards linking back to their parent card. Opening a card opens a full Card page - a chat panel with the card's Director and its full history; card details (status, type, source link); a Tickets tab showing linked tickets on a timeline to track progress; clicking a ticket shows its status, current work progress, gate results, PR and merge links. The card's Director can consult the whole project - all cards, issues, tickets, memory and code - to advise well.
source: { type: chat, ref: "2026-10-14 card grill Q1: \"every git issue or user chat in out system marked as single card in board. a single card can have many variations like 'disscusssions', 'plan', 'isseue' 'pr-issue' etc. this is the record of intake the we follow the Director triage. user can chat in the card directly, see progress of card, linked tickets, status of tickets etc all.\" + \"i like the option 2, but clicking on view card should open another page with all card details, there hosuld be a panel for chat and its history. the card director should hev access to full project cards/issues/tickets etc so it con consutl better with robust view ... card will show tickets in a timeline format in a new tab so user can track progess. clicking on card will open more deatils like status, current work projgress, merge links etc and all\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0096, d-0104]
tags: [cards, board, intake, tickets, director, ui, github-issues]
pinned: true
---

Data model consequence: a `cards` entity becomes the parent of tickets (today
`intake_events` → tickets, with an unused `tickets.epic_id`). Open for the card
grill: card type list and what each allows, card lifecycle and Board columns,
status roll-up from tickets, plan approval before tickets are created, chat in
card vs ticket, GitHub sync, naming, policing (who creates cards, duplicates,
spam, closing), and the Director's project context (saved context, live code
graph - the user raised "we might need a code graph here also that keeps
updating in realtime"; see proposal x-0012).
