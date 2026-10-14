---
id: d-0075
kind: decision
statement: A new version of a pipeline or agent definition goes live only after (1) load-time validation (graph safety rules of d-0066), (2) a dry run that walks every edge with fake agents, (3) replay on a set of past tickets comparing pass rate, cost and time with the current version, then (4) a canary on the next few real tickets with automatic rollback to the previous version if results are worse. Versions are immutable and every run records the version it used (d-0068). This is the same propose → gate → replay loop as agent/skill self-improvement (d-0019).
source: { type: chat, ref: "2026-10-14 grill x-0011 Q10: user chose 'Replay + canary (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, agents, eval, canary, rollback, x-0011]
pinned: false
---

Open for the brief: replay set size and selection, the "worse" metric and
thresholds, canary size, and how replay runs are isolated (worktrees, no push,
no merge) and budgeted.
