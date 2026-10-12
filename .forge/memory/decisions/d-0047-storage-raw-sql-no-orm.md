---
id: d-0047
kind: decision
statement: State storage stays behind `StorageAdapter`; SQLite (better-sqlite3, WAL) is the default. No ORM — repositories are hand-written portable SQL on an internal `SqlDriver` seam, with checksummed forward-only migrations. More adapters (Postgres, libsql, …) are added as new `adapters/<name>/` folders implementing the same contract test; the seam must stay open for that.
source: { type: chat, ref: "2026-10-13 user: 'go with recommendation, later i will need more adapters so keep it like that' (recommendation: keep raw SQL, drop the Drizzle wording)" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
superseded_by: null
supersedes: d-0023
tags: [storage, db, adapters]
pinned: true
---

Why no ORM: zod in core is already the schema source of truth; an ORM schema
would duplicate it. Dialect differences are handled per adapter, not by a
query builder. Contract test: `packages/db/__tests__/contract/storage.contract.ts`.
