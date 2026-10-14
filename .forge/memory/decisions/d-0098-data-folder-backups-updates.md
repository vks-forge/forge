---
id: d-0098
kind: decision
statement: Forge's data folder defaults to the user's own `%LOCALAPPDATA%\Forge` (per-user, matching local mode and DPAPI CurrentUser secrets), choosable on first run. It holds the database, settings, project memory repos, encrypted secrets and Worker worktrees. Daily automatic snapshots (database, memory repos, encrypted secrets; worktrees excluded as rebuildable from git), keep the last 7, plus "Export backup" in Settings and restore from the UI or `forge restore <file>`. Updates are never silent - Forge checks npm and shows the new version in the UI; the user clicks update or runs `npm i -g`; the new version's first start takes a backup, pauses/resumes running Workers (d-0092), then migrates; a failed migration rolls back to the backup and reports clearly.
source: { type: chat, ref: "2026-10-14 grill product shape Q15: user replied \"ok\" to the recommended package (per-user data folder, daily snapshots keep 7 + export/restore, notify-then-update with backup-before-migrate and rollback)" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0085, d-0059]
tags: [data, backup, updates, migrations, worktrees, product]
pinned: false
---

Corrects d-0085's example path (`%ProgramData%` is machine-wide; per-user is
right for local mode). Worker worktrees move from the project checkout's
`.worktrees/<id>` (d-0059) into the data folder, so the user's chosen local
folder (d-0083) never shows Forge worktrees; one-worktree-per-run stays.
