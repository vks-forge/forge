---
id: d-0072
kind: decision
statement: Cost and time are capped per agent: each agent definition carries its own `budget` (usd, minutes, turns). There is no per-ticket total cap and no global daily cap for now. When an agent hits its cap its run stops and the ticket pauses for the user rather than spending silently.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q7: user chose 'Per agent only' over per-agent + per-ticket (recommended) and global daily cap" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, agents, budget, cost, x-0011]
pinned: false
---

Director note: loop edges still carry a mandatory `max` count (d-0066 safety
conditions), which bounds how many times a capped agent can be re-run in one
ticket. Existing engine limits (rewake cap, run_budget in forge.yaml) stay.
