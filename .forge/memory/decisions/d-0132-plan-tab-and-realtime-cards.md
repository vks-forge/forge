---
id: d-0132
kind: decision
statement: When the grill ends the Director writes the plan into a new Plan tab on the card (Chat / Plan / Tickets / Details), announces it in chat, and the card goes to Needs you. The plan has a fixed structure from the write-plan playbook - goal; scope and non-goals; decisions (each grill question and answer); assumptions; verification (blast radius with files read as evidence, overlaps with other cards and tickets, matching decisions and rejected approaches, risks); ordered tickets (title, what it does, priority, dependencies with a small graph, size/lane estimate, acceptance criteria); card dependency links - and every revision is kept (v1, v2...) with a diff. Card and ticket state changes (status, column moves, grill progress, plan ready, tickets created) reach the UI in real time over a per-project server-sent event stream that updates the cached queries, with polling kept only as a fallback, and are shown with clean, purposeful animation (cards gliding between columns, status chips morphing) that respects reduced motion.
source: { type: chat, ref: "2026-10-16 user, grill Q5: \"yes accept. also need the the transisiton of card, changing card status etc all should eb realtime with clean animated architecture UI\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0105, d-0130]
tags: [director, planning, plan, cards, realtime, sse, ui, motion]
pinned: false
---
Found on 2026-10-16: run events already stream over SSE (routes/run-events.ts),
but board, card and inbox views poll (use-card-board.ts, use-card.ts,
use-inbox.ts), so card moves land late and jump.
