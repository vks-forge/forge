---
id: d-0010
kind: decision
statement: The control room (Paperclip-style, kanban with typed ticket relations, per-ticket live thread, ledger, cost, "needs you" queue) is built in React in this monorepo, lifting patterns and components from Paperclip's MIT UI; no third-party tracker is embedded.
source: { type: chat, ref: 2026-10-12 user message "i need a full UI like how paperclip is doing it" + research verdict }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [ui, control-room]
pinned: true
---
Screen list in `docs/design/control-room-and-platform.md` §2. Each screen
gets Hallmark + Nielsen passes before build (global CLAUDE.md rule).
