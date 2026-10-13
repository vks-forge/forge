---
id: d-0061
kind: decision
statement: apps/server's HTTP layer uses the Node standard library (`node:http`) with a small in-repo router, zod body/param parsing and hand-written SSE (Last-Event-ID replay from run_events). No HTTP framework dependency. The server binds 127.0.0.1 only and has no auth in M0 (d-0036).
source: { type: chat, ref: "2026-10-13 user chose 'node:http, no dep (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [server, http, sse, dependencies]
pinned: false
---

Rejected: Hono (two deps), Fastify (heavier than M0 needs). Revisit when the
control room's API grows past what a small router handles cleanly.
