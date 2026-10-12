---
id: d-0034
kind: decision
statement: The factory works on target repositories of any language via `.factory/project.yaml` (`language`, `profile: ts | generic`, `commands`, `test_globs`, `tier_c_globs`, `migration_paths`); under `generic`, the TS-bound checks (G1 test-diff patterns, G2 import/layer rules and blast-radius reach via dependency-cruiser, G4 mutation, ORM migration check) report `skipped` with the reason on the Ticket screen, and blast radius uses path rules only.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0027
tags: [scope, gates, project-profile]
pinned: true
---
Language-neutral today: lint/typecheck/test via `commands`, ast-grep, Semgrep, claim matcher, TDD-order check, path rules. Factory repo test stack: vitest, eslint, tsc, prettier; coverage 70% on `packages/core` at M0.
