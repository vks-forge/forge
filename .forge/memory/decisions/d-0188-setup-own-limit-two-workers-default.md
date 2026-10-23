---
id: d-0188
kind: decision
statement: Setup (package install) no longer holds a Worker slot; it has its own limit (default 2) and takes the Worker slot only at launch. The default Workers per project becomes 2, with a machine-load admission gate.
source: { type: chat, ref: "2026-10-23 user, replying to the final report of the autonomous run that listed Q-1..Q-11 with recommended answers, x-0016 / x-0017 and commit permission: \"approved\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-23
superseded_by: null
supersedes: null
amends: [d-0097]
tags: [engine, concurrency, setup, settings]
pinned: false
---

Answer to Q-6 and Q-7 in docs/briefs/next-work-plan.md (the recommended answer, accepted).
