---
id: d-0128
kind: decision
statement: A request starts as a card created through a "Create card" form (required title and description, optional links to earlier cards as dependencies) that replaces the free-text "Ask the Director" box. The new card is a draft in Shaping. The whole planning conversation (grill, verification, plan) happens in that card's chat, which stays the single conversation surface for every intake source (chat, later GitHub issues and other gates). No tickets exist until the user approves the plan.
source: { type: chat, ref: "2026-10-16 user, choosing option A over a separate Chat-page planning session: \"i want to go with option A, bacuse when we will add more gates like git issues etc then there will be only one option to chat , and that it is in the card it self. also need to remove chat 'Ask the Director' and add a button to create the card, this will take few required action like title, description, link previous card as depedency etc\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0105, d-0017]
tags: [director, cards, intake, planning, board, ui]
pinned: false
---
Found on 2026-10-16: a chat request became a card plus a ticket instantly, and
triage parked the ticket with no planning at all, so d-0017 (plan-mode
validation) was never implemented. This record fixes where planning lives;
the rest of the flow (grill depth, verification, approval, ticket and card
creation by priority and dependency) is being settled in the same grill session.
