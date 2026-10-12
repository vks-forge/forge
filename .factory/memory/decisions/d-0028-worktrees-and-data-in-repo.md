---
id: d-0028
kind: decision
statement: Worktrees live inside the repo at `.worktrees/<ticket-id>` (gitignored, `core.longpaths=true` set per project); factory runtime data lives inside the factory repo at `.factory/data/` (gitignored); per-project memory lives at `.factory/memory/<slug>/` as its own git repo, never inside a worktree.
source: { type: chat, ref: 2026-10-12 grill session, Q11 "no use repo folder", Q17 "ok", Q18 "yes, use same repo, can be store this inside the .factory folder?" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0039
supersedes: null
tags: [worktrees, storage, memory, layout]
pinned: true
---
Workers only ever run in worktrees, so gitignored `.factory/memory` and `.factory/data` are never visible to them. Current `.factory/memory/` becomes `.factory/memory/software-factory/` when the factory registers itself.
