---
id: d-0070
kind: decision
statement: Pipeline nodes hand off typed, named artifacts (e.g. plan, diff, finish_claims, narrative, test_report, findings, g1_report …), each validated by a zod schema. Every agent definition lists exactly which artifacts it receives (`inputs:`) and which it produces (`output:`); an agent sees nothing else. Reviewers and critics never receive the Worker's narrative, so they judge the code and evidence, not the story (verification-plane.md §5). An agent that may write gets an explicit `write_scope` of paths. All artifacts are stored for the user to read.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q5: user chose 'Typed artifacts, chosen per agent (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, agents, artifacts, x-0011]
pinned: false
---

Rejected: shared ticket thread for all agents (anchoring + context cost); diff
only (agents lose the goal and earlier findings).
