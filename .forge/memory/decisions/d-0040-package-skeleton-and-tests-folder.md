---
id: d-0040
kind: decision
statement: Every package and app follows one skeleton — `src/{schemas,domain,ports|adapters,shared}` by responsibility, nothing at `src/` root but `index.ts`/`main.ts` — and all tests live in a single `__tests__/` folder at the package root that mirrors `src/`. No `__tests__/` inside `src/`, no `.test.ts` beside code.
source: { type: chat, ref: "2026-10-13 user: 'all tests will go under __tests__ folder under per package|app root folder, only one folder with proper foldering. also folder structure is not clean at all, all files are written in root of package, need to use proper folder structure for clarification'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, layout, tests]
pinned: true
---

Written into `.claude/rules/code.md` rules 8 and 10. Applied retroactively to
`packages/core` on 2026-10-13.
