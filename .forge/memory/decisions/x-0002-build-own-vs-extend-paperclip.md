---
id: x-0002
kind: proposed
statement: Build our own dispatch layer (tickets, engine, drivers) and steal Paperclip's contracts, rather than forking Paperclip and bolting gates/memory/lanes onto it.
source: { type: chat, ref: 2026-10-12 user question "are we building the same software as paperclip" }
author: director
origin: agent
status: active
approved_at: 2026-10-12
valid_from: 2026-10-12
confidence: 0.65
tags: [scope, paperclip, architecture]
---
Why own: Paperclip is generic (every table `company_id`, "hire" concepts),
Postgres not SQLite, 1,400-line adapters, bypass permissions default; owning
the data model matters for a code-specific product. Why fork: running in
days instead of weeks for the first milestone. Paperclip's licence is MIT
(confirmed in the control-room research).

Approved 2026-10-12 as: build own dispatch layer; lift specific Paperclip code (adapter execute() shape, assistant-ui wiring).
