---
id: d-0078
kind: decision
statement: Each agent definition declares the skills it loads (`skills: [...]`, from `.forge/skills/`) and the slice of project memory it receives (`memory: { tags: [...], include_rejected: bool }`). An agent gets only those, plus its instructions and declared input artifacts. The Director sees all decisions, rejected approaches and outcomes.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q13: user chose 'Skills + memory slice per agent (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [agents, skills, memory, x-0011]
pinned: false
---

Rejected: every agent gets everything (long, costly prompts; rules bleed across
roles); instructions only (agents ignore past project decisions).
