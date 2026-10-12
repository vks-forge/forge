---
id: d-0023
kind: decision
statement: State storage sits behind a `StorageAdapter` (Drizzle dialect per driver) so the backend can be swapped; default is SQLite WAL.
source: { type: chat, ref: 2026-10-12 grill session, Q6 "make this as adapter ... default to sqlite" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-13
superseded_by: d-0047
supersedes: null
tags: [storage, db, adapters]
pinned: true
---
Core tables use portable SQL only; the memory FTS index lives in `packages/memory` as its own pluggable search; single-writer engine tick holds for every backend.
