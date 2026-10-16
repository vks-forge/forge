---
id: d-0151
kind: decision
statement: Each project has exactly three ticket pipelines, one per lane (Express, Standard, Full), editable by the owner and seeded from the company defaults; there is no separate library of named pipelines for now (can be added later without breaking this). A ticket's pipeline is its lane's pipeline, plus any agents required by the owner's routing rules (e.g. *.tf adds Firewall reviewer), plus the Director's per-ticket adjustments - swap, add or drop agents within the hard limits - made on a copy for that ticket only, recorded with reasons on the ticket and shown in the plan. The project's pipeline is never changed by the Director; when it keeps making the same adjustment it may propose the change to the owner in the Inbox. During a run the Director may adjust that ticket's copy within the same limits; large changes go through re-planning (d-0134).
source: { type: chat, ref: "2026-10-16 user, after the explanation of named-pipeline library (A) vs three lane pipelines per project adapted by the Director (B): \"yes this looks good. so if i understand this currently then director will deside for any any ticket that if the pipeline needs another agents to work then he will modify the pipeline accordingly for that specific ticket?\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0069, d-0077, d-0137, d-0149]
tags: [pipelines, agents, director, lanes, config]
pinned: false
---
"looks good" read as option B (recommended); confirm if A was meant.
