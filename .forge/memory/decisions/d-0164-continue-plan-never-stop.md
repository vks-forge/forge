---
id: d-0164
kind: decision
statement: After the live-test fixes, the card-first plan continues autonomously from S5a through S5b, S5c, S5d and S6, one commit and push per slice; when the machine runs out of memory during tests the run lowers the vitest worker count or defers the heavy suites for a while, but never stops working.
source: { type: chat, ref: "2026-10-17 user: \"yes, continue the plan. if computer still ran out of memory for test then use lower worker count or skip that for some time, but never stop working. go autonomus\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-17
superseded_by: null
supersedes: null
amends: [d-0160]
tags: [build-plan, priorities, run-mode]
pinned: false
---

Skipped or deferred suites are named in the slice's commit and outcome note, and CI on main
(full suite) stays the backstop; a red CI run is fixed forward before the next slice merges.
