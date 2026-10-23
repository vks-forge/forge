---
id: d-0178
kind: decision
statement: The run secret of every ended Worker run (success, paused, error, turn limit, timeout) is kept until its ticket closes, so G1 can still vouch for that run's edits and reads; secrets are retired when the ticket closes.
source: { type: chat, ref: "2026-10-20 user, answering \"G1 loses the proof of a Worker's edits when a run stops early (turn limit, pause, error), so the ticket fails forever. Keep that proof until the ticket closes?\": \"Keep until ticket closes (Recommended)\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: [d-0100]
tags: [g1, receipts, security, verification]
pinned: false
---

Part of the eval fix plan (docs/briefs/eval-fixes-plan.md).
