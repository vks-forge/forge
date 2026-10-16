---
id: d-0121
kind: decision
statement: CI is paced to stay inside the GitHub Free Actions quota (Windows minutes count 2x, macOS 10x) - every push and pull request that changes code runs Windows only; docs-only changes (markdown, docs/, .forge/memory/) skip CI; Linux runs daily at end of day (17:30 UTC, Monday-Saturday); Linux and macOS run weekly on Sunday at the same time; all three run on demand (workflow_dispatch, e.g. before a release).
source: { type: chat, ref: "2026-10-16 after the estimate that daily macOS alone would use ~1,800 of the 2,000 free minutes, recommendation 'macOS weekly, Linux daily, docs-only pushes skip CI'; user: \"yes do it\"" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-16
valid_to: 2026-10-16
superseded_by: d-0125
supersedes: d-0120
tags: [ci, cost, testing]
pinned: false
---
