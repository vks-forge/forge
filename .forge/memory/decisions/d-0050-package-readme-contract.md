---
id: d-0050
kind: decision
statement: Every package and app carries a README.md (≤ 150 lines) with seven fixed sections — what it is, Why it exists, What it does (public API), Why this approach (deps and design picks with reasons, rejected alternatives), Requirements (runtime, native binaries, env vars, `.forge/` files, external services, build, tests), Extending, Limits. Written as product knowledge for developers and agents; updated in the same commit as any change to API, deps, env or requirements. Codified in `.claude/rules/code.md` rule 10.
source: { type: chat, ref: "2026-10-13 user: per package need a readme.md file that explains what is the package for, why we need this, also why we are using this and any required things" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, docs, packages]
pinned: false
---

Replaces the earlier "≤ 1 screen: purpose, public API, how to add an
implementation" README line in rule 10.
