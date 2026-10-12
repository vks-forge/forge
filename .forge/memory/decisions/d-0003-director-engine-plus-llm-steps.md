---
id: d-0003
kind: decision
statement: The Director is a deterministic scheduler tick with finite, schema-validated LLM steps; it holds the ticket state machine, and the user can live-chat with it while it live-chats with Workers to correct or rework mid-run.
source: { type: chat, ref: 2026-10-12 user messages on Director live chat and "ok" to engine-vs-heartbeat answer }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [control-plane, director]
pinned: true
---
Heartbeat mechanics (durable wake requests, continuation kinds, coalescing,
re-wake cap) are kept from Paperclip for crash durability; the engine, not the
agents, owns transitions. See `docs/design/director-core.md`.
