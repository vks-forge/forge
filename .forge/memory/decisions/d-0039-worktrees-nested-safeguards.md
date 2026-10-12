---
id: d-0039
kind: decision
statement: Worktrees live at `.worktrees/<ticket-id>` inside the repo, runtime data at `.factory/data/`, per-project memory at `.factory/memory/<slug>/` as its own git repo; because worktrees are nested, every Worker run excludes `project` and `user` setting sources (d-0031) and scopes `--add-dir` to the worktree and the prompt bundle; the worktree manager sets `core.longpaths=true` per repo, the setup check warns when `LongPathsEnabled=0`, `.worktrees/` is gitignored before first dispatch and excluded from the graft indexer, and the path normaliser resolves junctions. `D:\wt` in `control-room-and-platform.md` section 7 is superseded.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-13
approved_at: 2026-10-12
superseded_by: d-0044
supersedes: d-0028
tags: [worktrees, storage, memory, layout, windows]
pinned: true
---
Host measured 2026-10-12: `LongPathsEnabled=0`, no global `core.longpaths`, pnpm store on the same NTFS volume.
