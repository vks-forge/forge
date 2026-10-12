---
id: d-0025
kind: decision
statement: Every task gets an LLM triage step before its validation turn, in every lane; the deterministic pre-check runs first as an override, never as a way to skip the model call. Correctness of the process outranks call count.
source: { type: chat, ref: 2026-10-12 grill session, Q8 "i dont have any problem with mutiple model calls, only required point is that process should be working" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [director, lanes, validation]
pinned: true
---
Amends `v1-scope-review.md` section 4.3; the earlier idea of starting the run before triage finishes is dropped.
