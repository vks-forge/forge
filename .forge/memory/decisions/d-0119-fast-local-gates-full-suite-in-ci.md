---
id: d-0119
kind: decision
statement: Local gates are fast and the full suite runs in CI. Locally (builders and orchestrator) a change is gated by `pnpm check` - incremental typecheck, cached lint and format check, and only the tests related to the changed files (vitest --changed against origin/main, no coverage), one gate run at a time on the machine. The full suite with coverage floors runs on GitHub CI (Windows, macOS, Linux) after every push to main; a red CI run is fixed forward immediately, before any new batch merges. Builders never run the full suite and never rebase repeatedly; the orchestrator owns rebase and merge. Live probes stay a separate, explicit step.
source: { type: chat, ref: "2026-10-16 user: \"we have to fix this test part! we cant run all tests like that, this is costing me too much time. let make the running test simpler and easy flow without losing productivity\"; chose 'CI after push (Recommended)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0015]
tags: [testing, gates, ci, workflow, productivity]
pinned: true
---
