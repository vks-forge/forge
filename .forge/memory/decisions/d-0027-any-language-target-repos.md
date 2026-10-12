---
id: d-0027
kind: decision
statement: The factory must work on target repositories of any language; the factory's own stack is TypeScript but gates, triage and blast radius are per-project adapters driven by `.factory/project.yaml` (`language`, `commands`, `test_globs`, `tier_c_globs`, `migration_paths`).
source: { type: chat, ref: 2026-10-12 grill session, Q10 "this factory should work on every type of repo" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0034
supersedes: null
tags: [scope, gates, project-profile]
pinned: true
---
Missing commands make a gate report `skipped`, never `pass`. `reach` is a `GraphProvider` (dependency-cruiser for JS/TS, path rules otherwise). Skills carry a `languages:` tag. Factory repo test stack: vitest, eslint, tsc, prettier; coverage 70% on `packages/core` only at M0.
