---
id: d-0176
kind: decision
statement: Forge serves projects in any language or ecosystem (Node, Python, Go, Rust, Java, .NET, Ruby, PHP, and repos with no package manager such as networking or config work). No fix or feature may assume Node.js; ecosystem specifics (install, build, test commands, lockfiles) live in detector data the owner can edit, never in core logic.
source: { type: chat, ref: "2026-10-20 user, after the usefulness eval recommended worktree dependency prep: \"this softwareis nto only for nodejs project, we have to keep this in mind. then do the plan and make the fixes\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: [d-0095]
tags: [ecosystems, product, languages, workers, setup]
pinned: true
---

Applies to the eval fix plan (docs/briefs/eval-fixes-plan.md): worktree preparation, checks, copy and examples
must work for every detected ecosystem and do nothing for a project with none.
