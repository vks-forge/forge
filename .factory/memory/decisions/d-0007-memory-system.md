---
id: d-0007
kind: decision
statement: Director memory is a git-backed markdown repo per project with a SQLite index; the Director is the only writer; Workers read a ticket-scoped slice as data; a janitor is event-triggered and propose-only; records are superseded, never merged or deleted.
source: { type: chat, ref: 2026-10-12 user message "i like this, add this to our project in details" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [memory, control-plane]
pinned: true
---
Spec: `docs/design/memory-system.md`. This repo's own `.factory/memory/` is
the first instance (d-0013).
