---
id: d-0125
kind: decision
statement: The repository is public, so GitHub-hosted standard runners are free and CI is no longer paced to a quota - every push to main and every pull request that changes code runs the full suite on Windows, macOS and Linux; docs-only changes (markdown, docs/, .forge/memory/) still skip CI; all three also run on demand (workflow_dispatch). The end-of-day schedules are removed.
source: { type: chat, ref: "2026-10-16 user: \"also for your information, i have made the repo in github public so we can use unlimited CI.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: d-0121
tags: [ci, cost, testing]
pinned: false
---
Director note: the user stated the fact and the intent ("so we can use unlimited
CI"); the Director read that as "run every OS on every code push". Builders still
never push, and pushes stay batched (one push per batch of merges).
