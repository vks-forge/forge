---
id: d-0030
kind: decision
statement: M0 is built by the orchestrator in four slices (core+db; engine+Claude driver+admission+receipts; API+Board/Ticket/Needs-you/Settings; first dogfood ticket), each red-green TDD with gates green and a commit report before commit; rework policy = resume for the first rework, fresh session for the second, never auto-switch harness, then Needs-you; model matrix `role x lane -> {harness, model, credential}` in Settings, G4 critic `skipped` until a second provider exists, guardian same-family stand-in marked as such; web UI binds 127.0.0.1 with no auth and refuses other binds until an auth mode exists; CLI is a thin client added after the HTTP API.
source: { type: chat, ref: 2026-10-12 grill session, Q5, Q14, Q16, Q19, Q20, Q21 "ok" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0036
supersedes: null
tags: [m0, process, tdd, ui, rework, models]
pinned: true
---
Paperclip history (2026-02-16): spec, types, DB, server, UI in one day, UI from hour one, CLI last as a thin client; we follow the same shape.
