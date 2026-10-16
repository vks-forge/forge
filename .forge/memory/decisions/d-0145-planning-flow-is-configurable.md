---
id: d-0145
kind: decision
statement: The card planning flow is data, not code - an ordered, editable flow of stages (e.g. survey, grill, research, verify, enhance, write plan, approve, plan to tickets) run by the same generic stage runner as ticket pipelines, seeded with a default flow as version 1 and customizable per project from the UI (add, remove, reorder or configure stages and their playbooks, conditions such as "research only when needed", and lane-scaled depth). Changes are versioned and validated like pipelines (d-0075), every card records the flow version it ran, and fixed invariants no configuration can remove - the deterministic approval floor, Tier C human sign-off, tool-less approval step, and every phase change through transitionCard() - stay in force.
source: { type: chat, ref: "2026-10-16 user: \"this is one senario, later suppose we add more steps then it should be adjustable, need to make the flow fully customizable from UI project.\"" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-16
superseded_by: d-0146
valid_to: 2026-10-16
supersedes: null
amends: [d-0130, d-0136, d-0141]
tags: [director, planning, pipelines, config, ui]
pinned: false
---
Consequence for the build plan: S2 builds planning as a configured stage flow from
the start (not hard-coded steps), and the stage runner core moves into S2 so S5a
reuses it for ticket pipelines.
