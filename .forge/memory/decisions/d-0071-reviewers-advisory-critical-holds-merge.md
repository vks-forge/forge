---
id: d-0071
kind: decision
statement: Reviewer/critic agents are advisory: they return structured findings (severity, file:line, issue, evidence) and never send work back to the Worker on their own. Medium/low findings become notes on the ticket and in the PR. A critical or high finding holds the automatic merge — the ticket goes to the user for review instead of auto-merging, and the user chooses merge anyway / send back to the Worker / cancel. Deterministic gates (G1 claims, tests, lint, types, test-diff; later G2/G3) still block as before.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q6: user chose 'Reviewer is advisory only' (over severity-decides rework, recommended); Q6b: 'Critical → wait for me (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, reviewers, merge, x-0011]
pinned: false
---

Rejected: automatic rework on reviewer findings (nitpick loops, cost); any
finding blocks. Open for the brief: whether a finding needs evidence (file:line
or failing test) to count as critical/high, and how this interacts with the
G4/G5/G6 design in verification-plane.md (G4 there can fail a run).
