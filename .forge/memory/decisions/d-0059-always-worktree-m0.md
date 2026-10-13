---
id: d-0059
kind: decision
statement: Every Worker run gets its own git worktree under `.worktrees/<ticket-id>` on branch `<type>/<id>-<slug>`, whatever the ticket size. The main checkout is never a Worker cwd, so Forge's runtime data (`.forge/data`) and the main checkout's state stay outside the Worker's tree, where the outside-cwd floors deny them. Worktrees are created by the engine through a worktree port before dispatch and removed after settle (branch kept until merged).
source: { type: chat, ref: "2026-10-13 user chose 'Always worktree (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: d-0011
tags: [git, worktrees, isolation, engine]
pinned: true
---

Rejected: d-0011's size rule (feature branch in the main checkout for small
tickets), because it puts `.forge/` inside the Worker's cwd and serialises
tickets.
