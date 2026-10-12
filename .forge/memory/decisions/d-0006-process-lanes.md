---
id: d-0006
kind: decision
statement: Every ticket runs in one of three lanes (Express, Standard, Full) chosen by Director triage from blast radius with user override; triage starts light and escalates on observed signals; escalation is one-way; Express skips ceremony but never the independent gate or the ledger.
source: { type: chat, ref: 2026-10-12 user message "this type of workflow is very time consuming? what about for a simple task" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
tags: [process, lanes, triage]
pinned: true
---
Lane table in `docs/design/execution-plane.md` §2; decision rule in
`docs/design/director-core.md` §6. Metric: escalation rate per lane, target
< 30% for Express.
