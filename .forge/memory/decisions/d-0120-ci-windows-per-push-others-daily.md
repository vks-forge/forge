---
id: d-0120
kind: decision
statement: CI runs Windows only on every push and pull request; Linux and macOS run once a day at end of day (scheduled, 17:30 UTC) and on demand (workflow_dispatch, e.g. before a release), to stay inside the GitHub Free Actions quota where macOS minutes count about 10x.
source: { type: chat, ref: "2026-10-16 asked how CI should run given the free quota; user: \"so i want only windows for now, linux and macos per day only once, likely EOD\"" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-16
superseded_by: d-0121
valid_to: 2026-10-16
supersedes: null
amends: [d-0119]
tags: [ci, cost, testing]
pinned: false
---
