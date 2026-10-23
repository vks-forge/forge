---
id: d-0181
kind: decision
statement: The Director may sign off a tier C change (auth, migrations, secrets, billing) when the floor is clean: every check stage passed, no critical or high finding is open, the Director's check against the plan passed, and the diff touches no secrets paths. The owner is then notified with the diff and a one-click revert. Anything not clean still waits for the owner's named sign-off. Owner principle behind it: Forge exists so the owner does not take every decision; the owner gets only real judgement calls.
source: { type: chat, ref: "2026-10-23 user, after CHE-2 (all checks passed, 0 critical/high) stopped for tier C sign-off: \"now check CHE-2, why it needs my sign-off, it should have taken care by director\"; answering how tier C should work: \"Director signs when clean\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-23
superseded_by: null
supersedes: null
amends: [d-0012, d-0136, d-0137, d-0141, d-0145, d-0146, d-0149, d-0150]
tags: [tier-c, sign-off, director, merge, autonomy]
pinned: false
---

Replaces the "Tier C needs the named human signer" lock in each amended record with this clean-floor rule.
Still to settle when built: what "secrets paths" covers, the revert action, and where the notice shows. Queued in
docs/briefs/next-work-queue.md (item K2).
