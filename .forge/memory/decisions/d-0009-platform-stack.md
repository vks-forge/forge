---
id: d-0009
kind: decision
statement: Platform stack is a TypeScript pnpm monorepo, one Node server process, React UI, SQLite in WAL mode, Bifrost as LLM gateway with per-run virtual keys, OTLP traces into Phoenix, assistant-ui with AG-UI event schema for live threads.
source: { type: chat, ref: 2026-10-12 research synthesis accepted implicitly; user has not objected }
author: director
origin: agent
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
confidence: 0.7
tags: [stack, platform]
pinned: true
---
Recorded as author=director because the user has not explicitly confirmed
each pick. Each item is in `docs/design/control-room-and-platform.md` with
the reason. If the user objects to any, supersede this record rather than
editing it.
