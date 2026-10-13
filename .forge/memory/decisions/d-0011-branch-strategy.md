---
id: d-0011
kind: decision
statement: Per ticket, use a git worktree when the change touches 4+ files, runs in parallel with a sibling, touches schema or auth, or is long-running; otherwise use a plain feature branch off main.
source: { type: chat, ref: 2026-10-12 user message "working in gitree if work is big else directly work as a simple feature branch" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-13
supersedes: null
superseded_by: d-0059
tags: [git, worktree, execution-plane]
pinned: true
---
Worktree manager rules in `docs/design/control-room-and-platform.md` §7.
