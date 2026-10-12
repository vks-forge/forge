---
id: d-0042
kind: decision
statement: Imports use namespaces, not `../` chains — `#/` for the package root (Node subpath imports, declared in each package.json `imports` field) and `@factory/<name>` across packages; `./` only for a sibling file; `../` is a lint error.
source: { type: chat, ref: "2026-10-13 user: 'for file name import use namespace like @/ etc instead of ../../ pattern'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, imports]
pinned: true
---

`#/` chosen over `@/` because Node resolves `#` subpath imports natively;
`@/` would need a bundler or path rewriting at runtime. Written into
`.claude/rules/code.md` rule 10.
