---
id: d-0076
kind: decision
statement: A pipeline step may run several agents at once on one ticket, in both forms - parallel read-only agents (reviewers, critics, script gates; `parallel:` with a `join` rule) and parallel writers (several coding agents on one ticket, e.g. backend and frontend). Whether a ticket gets one writer, parallel writers or a split into separate tickets is decided and controlled by the Director, within limits the pipeline allows.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q11: user selected 'Parallel reviewers, one writer (Rec.)' with note: \"need option 1 and option 2 also. this flow should be desided by the director and should be controlled by director.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, parallel, director, x-0011]
pinned: false
---

Guardrails added by the director for the brief (not the user's words):
each parallel writer gets its own worktree and branch with a declared
`write_scope`; their branches are integrated by an engine merge step (never by
an agent) into the ticket branch, and every required gate re-runs on the
integrated result before merge; conflicts park for the user or go to one
writer to resolve; the Director's choice is bounded by pipeline limits
(`max_parallel_writers`, budgets) and recorded with its reason on the ticket.
