---
id: d-0069
kind: decision
statement: A ticket's pipeline is chosen by its lane (express / standard / full → default pipeline per lane) plus routing rules matched on changed paths, ticket type and labels (`routing:` with `default` and ordered `rules: [{when, use}]`); a project may override routing in its project config. Routing may only pick a stricter pipeline, never a lighter one (lanes only escalate, d-0006).
source: { type: chat, ref: "2026-10-14 grill x-0011 Q4: user chose 'Lane + routing rules (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, routing, lanes, x-0011]
pinned: false
---

Director notes for the brief (not the user's words): "stricter" = the routed
pipeline's required gates and human steps are a superset of the lane default's,
checked at load; path rules are re-evaluated when the diff is known (after the
Worker), so a run can be re-routed up mid-ticket, never down; the run records
which rule fired.
