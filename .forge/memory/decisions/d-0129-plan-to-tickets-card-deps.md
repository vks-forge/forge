---
id: d-0129
kind: decision
statement: The "Create card" form opens in a popup (modal). When the user approves a card's plan, the Director creates the work as tickets inside that same card, ordered by priority and linked by dependency (d-0110); it may propose splitting off an extra card in the plan, created only on approval. Cards themselves carry dependency links in both directions - "depends on" (blocked by) and "blocks" (dependent cards) - settable from the create popup and the card page, and shown clearly on the card and board so the order of work is understandable.
source: { type: chat, ref: "2026-10-16 user, grill Q2: \"open the new card add in a popup. option A, also card should have functionality to add blocked card(dependent card). so UI looks understandable.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0105, d-0110, d-0128]
tags: [director, cards, tickets, dependencies, ui]
pinned: false
---
Option A chosen over "plan becomes several new cards": one request = one card =
one history; tickets carry the step order inside it.
