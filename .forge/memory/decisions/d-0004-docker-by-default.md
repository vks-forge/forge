---
id: d-0004
kind: decision
statement: Each Worker runs in its own Docker container (or equivalent light container) instead of a microVM.
source: { type: chat, ref: 2026-10-12 user message "for microVM we will now use docker or any other light VM" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-12
supersedes: null
superseded_by: d-0005
tags: [execution-plane, isolation]
pinned: false
---
Superseded the same day by d-0005 after the user asked for harness-direct
execution with containers optional.
