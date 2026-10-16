---
id: d-0152
kind: decision
statement: Project settings -> Pipelines shows the project's three lane pipelines (Express / Standard / Full tabs) in the same list editor as the Director flow - stages are an agent, a script gate (d-0074), a run-together group (d-0076, all must pass) or a human sign-off; Merge is locked last; routing rules ("paths -> always add agent") sit on the same screen. Save validates - every writer followed by an independent check, reviewers cannot write, a reviewer needs something before it to review - and an invalid pipeline cannot be saved, with the reason shown. No loops or branches in the MVP editor; rework uses the existing gate-failure path up to the rework cap. Company defaults are edited at Forge settings -> Pipelines; a project tab shows "Changed from company default" with Reset.
source: { type: chat, ref: "2026-10-16 user, Agents grill Q4 (lane pipeline editor): \"accept.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0151]
tags: [pipelines, ui, config]
pinned: false
---
