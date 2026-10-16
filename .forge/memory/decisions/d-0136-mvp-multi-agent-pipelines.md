---
id: d-0136
kind: decision
statement: The MVP ships the full multi-agent pipelines, not an Express-only path. Every lane (Express, Standard, Full) runs; the engine becomes a generic stage runner over agent, gate and human stages per the agents-and-pipelines design (d-0069..d-0081, proposal x-0011), with agents and pipelines stored as versioned config edited through the UI (d-0085/d-0090). The Express-only park in triage ("lane not enabled in M0") is removed as part of this work.
source: { type: chat, ref: "2026-10-16 user, grill Q9 (which lanes run in the MVP): chose \"B\" - build the full multi-agent pipelines first - over one working path with lane-scaled checks, and over Express-only with small tickets" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0006, d-0077]
tags: [pipelines, agents, lanes, mvp, engine]
pinned: false
---
Found on 2026-10-16: packages/engine/src/tick/triage.ts parks every ticket whose
lane is not express, and no reviewer or pipeline stage runner exists.
