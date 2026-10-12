---
id: d-0051
kind: decision
statement: Package and app READMEs are living docs, updated continuously during development. Any change that alters what a README reader would believe (new feature or module, changed behaviour, public API, deps, env vars, `.forge/` files, requirements, a limit closed or found) updates that README in the same commit. Builders check the README before reporting done; a stale README is a review block like a red gate.
source: { type: chat, ref: "2026-10-13 user: also update te rule to keep updating the readme.md file as we are developing the app|package" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, docs, packages]
pinned: false
---

Amends d-0050 (widens its "update with API/deps/env changes" clause to every
reader-visible change). Codified in `.claude/rules/code.md` rule 10.
