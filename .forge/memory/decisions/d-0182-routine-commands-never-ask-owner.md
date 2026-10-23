---
id: d-0182
kind: decision
statement: Routine project tooling a Worker runs inside its worktree (package manager installs and adds, code generators such as prisma generate or migrate diff, build, lint, test, format) never asks the owner; it is allowed for the Worker or answered by the Director. The owner is asked only for risky actions: secrets, paths outside the worktree, unknown network hosts, destructive or irreversible commands, pushing. Which commands are routine is per-ecosystem detector data the owner can edit (d-0176), never hard-coded.
source: { type: chat, ref: "2026-10-23 user: \"also sometime ago a ticket asked me for permission for running prisma command, this type of all work should be handled by director or by the worker it self\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-23
superseded_by: null
supersedes: null
amends: [d-0175]
tags: [approvals, permissions, director, workers, autonomy, ecosystems]
pinned: false
---

d-0175's real owner approvals stay for the risky actions listed. Express keeps turning `ask` into deny for anything
not routine. Queued in docs/briefs/next-work-queue.md (item M, built together with E and I).
