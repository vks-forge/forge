---
id: d-0180
kind: decision
statement: Forge prepares each Worker worktree itself before the Worker starts: it runs the project's setup steps (frozen, lockfile-based installs from editable per-ecosystem defaults; none for a project with no ecosystem) outside the Worker's tool policy, with network and package install scripts allowed, and checks may use owner-listed environment folders (e.g. .venv) on PATH. Real isolation comes with the sandbox (d-0161).
source: { type: chat, ref: "2026-10-20 user, answering \"Worktree setup runs install commands (npm ci, pip install, cargo fetch...) itself, outside the Worker's rules, with network, including package install scripts; and lets checks use the project's own env folder (like .venv). OK?\": \"Yes (Recommended)\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: [d-0095, d-0059]
tags: [worktrees, setup, ecosystems, workers, security]
pinned: false
---

Part of the eval fix plan (docs/briefs/eval-fixes-plan.md).
