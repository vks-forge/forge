---
id: d-0017
kind: decision
statement: Every task the user gives is validated with the orchestrator before work starts, in the manner of plan mode (grill-me style questioning until no point is open, then an enhancement pass over the decisions against the codebase and project ideas, then user finalizes). Validation is per task, not per file change; Express-lane tasks still get validated, just briefly.
source: { type: chat, ref: 2026-10-12 user message "express line - grill me in not with every file changes, think it like a plan mode with orhastrator, evey task that user gives should eb vaidated properly" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: d-0014
tags: [director, process, planning, lanes]
pinned: true
---
Resolves the Express-lane open point in d-0014. Validation depth scales with
lane: Express = one confirmation turn (restate task, predicted files, lane,
recommended answer; proceed on "ok"); Standard = short grill; Full = full
grill + enhancement pass + explicit finalize. No lane skips validation.
