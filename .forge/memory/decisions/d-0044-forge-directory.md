---
id: d-0044
kind: decision
statement: The factory's committed config and runtime folder is `.forge/` (renamed from `.factory/`): skills, agents, tools, rules and `memory/` are committed; `.forge/data/` (runs, per-run settings, secrets, sqlite) and `.forge/memory/*/.index/` are ignored. Worktrees stay at `.worktrees/<ticket-id>`; everything else in d-0039 (nested-worktree safeguards, longpaths, setting-source exclusion) carries over unchanged.
source: { type: chat, ref: "2026-10-13 user: 'yes rename .factory to .forge'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
superseded_by: null
supersedes: d-0039
tags: [naming, layout, storage, memory]
pinned: true
---

Applied 2026-10-13: directory moved, `CLAUDE.md`, `.gitignore`, code rules,
all `docs/design/*` and the enhance-decisions skill updated. Older memory
records keep their original `.factory/` wording because statements are
immutable; read them as `.forge/`.
