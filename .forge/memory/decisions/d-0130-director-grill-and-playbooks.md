---
id: d-0130
kind: decision
statement: On card creation the Director starts the planning grill by itself in the card chat - one question at a time, each with 2-4 options (one marked recommended) as clickable choices plus free text, a running count of open points, depth scaled to the work, a "use your recommendations for the rest" shortcut, and a stop when nothing is open or the user presses "Enough, write the plan" (open points become plan assumptions). The card shows Shaping while grilling and Needs you while waiting on the user. The Director's method comes from Director playbooks - Forge-owned markdown skills (plan-grill, verify-plan, write-plan, plan-to-tickets) shipped as seed data, stored as versioned rows, visible in the UI - injected as text into the step for the card's phase, together with the project's rules (active decisions, rejected approaches, and a repo rules file such as CLAUDE.md/AGENTS.md, read-only). Not via the harness's native skill loading, to stay harness-neutral and keep untrusted-input steps free of user settings and hooks.
source: { type: chat, ref: "2026-10-16 user, grill Q3: \"yes, but tell me first for director can we inject skills and rules into that? then we have to create a skill for this to perferom cleanly\" - accepted the five grill points and the playbook design" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0017, d-0128]
tags: [director, planning, grill, skills, playbooks, prompts]
pinned: false
---
Found on 2026-10-16: Director steps run `claude -p` with no tools and no
setting sources, guided only by a one-paragraph hard-coded instruction per step
(packages/drivers/src/domain/director-step-prompts.ts), so it had no grill
method or plan format.
