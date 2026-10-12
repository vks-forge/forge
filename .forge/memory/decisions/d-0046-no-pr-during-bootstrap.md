---
id: d-0046
kind: decision
statement: While the factory bootstraps itself (M0 slices built by the orchestrator, before the dispatcher can open PRs), commits go directly to `main`; no pull request. The orchestrator still reports staged files and the message and waits for the user's go before each commit. PR-always (d-0021) resumes once the factory bot dispatches its first ticket (slice 4).
source: { type: chat, ref: "2026-10-13 user: 'you dont need PR, go directly'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
superseded_by: null
supersedes: null
tags: [git, process, m0]
pinned: false
---
