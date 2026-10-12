---
id: d-0026
kind: decision
statement: Native tool calls are receipted and gated through harness hooks (Claude PreToolUse/PostToolUse via per-run `--settings`) that call the Factory API with the run secret; a failed receipt write or unreachable API returns deny (fail-closed), and approval asks route through `--permission-prompts` to Needs-you.
source: { type: chat, ref: 2026-10-12 grill session, Q9 "ok" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0033
supersedes: null
tags: [tools, receipts, hooks, verification]
pinned: true
---
A Factory API outage pauses Worker tool calls rather than letting them run unreceipted.
