---
id: d-0013
kind: decision
statement: This repository tracks its own project decisions, rejections, proposals and outcomes in `.factory/memory/` following `docs/design/memory-system.md`; Claude must read and write this store instead of its auto-memory for anything project-related.
source: { type: chat, ref: 2026-10-12 user message "add a memory system like approved|pending|rejected ... instead of using claude own memory system" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [memory, process, claude]
pinned: true
---
Claude's auto-memory keeps only user-level preferences (how the user likes to
work). Project facts, decisions, and rejected approaches live here. Operating
rules are in `CLAUDE.md`.
