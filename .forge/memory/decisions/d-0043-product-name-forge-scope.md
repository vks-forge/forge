---
id: d-0043
kind: decision
statement: The product is called Forge. npm workspace scope is `@forge/*` (not `@factory/*`), the error base class is `ForgeError`, and new code identifiers use "forge" not "factory". The `.factory/` directory and existing design-doc wording stay until a separate rename decision.
source: { type: chat, ref: "2026-10-13 user: 'use @forge instead of factory. we will call this forge'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [naming, packages]
pinned: true
---

Applied to `.claude/rules/code.md` and `packages/core` on 2026-10-13.
The "`.factory/` stays" clause was overtaken the same day: d-0044 renames it
to `.forge/`.
