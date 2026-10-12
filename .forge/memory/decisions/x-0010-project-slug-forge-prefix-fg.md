---
id: x-0010
kind: proposal
statement: This repo registers itself in the factory as project slug `forge`, ticket prefix `FG` (ids `FG-<n>`), memory dir `.factory/memory/forge/`. Replaces the `SF` placeholder in m0-brief §2 slice 4.
source: { type: chat, ref: 2026-10-13 orchestrator proposal after repo `vks-forge/forge` was created; user said "close the open [items] properly" }
author: director
origin: inferred
confidence: 0.7
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
approved_by: user ("we will call this forge", d-0043)
tags: [naming, dogfood, m0]
---

Slug matches the GitHub repo name; prefix is two letters so branch names and
worktree paths stay short on a host with `LongPathsEnabled=0` (m0-brief §5).
