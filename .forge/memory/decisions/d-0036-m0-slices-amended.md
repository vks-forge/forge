---
id: d-0036
kind: decision
statement: M0 is built by the orchestrator in four slices: (1) `packages/core` + `packages/db` behind `StorageAdapter`, `project.yaml` schema, ids and branch names, with the remote URL as precondition for the first commit; (2) three preflight probes (subscription auth with `user` settings excluded; `--settings` hooks fire and block; ACP honours bypass opt-out and `strictMcpConfig`), then admission function + floors + lane grants, receipt hooks + Factory MCP, Claude ACP driver with CLI fallback, `DirectorLLM`, triage step, S0 registry rows, and a minimal `interactions/:id/answer` endpoint with Express-only dispatch; (3) HTTP API, Board, Ticket, Needs-you, Settings (credential mode, model matrix), Standard/Full lanes open; (4) first dogfood ticket Inbox to Done. Rework policy, model matrix, loopback-only UI and thin CLI as in d-0030.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0030
tags: [m0, process, tdd, slices]
pinned: true
---
Each slice: red-green TDD, gates green, commit report, user go. Slice 2 exit includes the hook-liveness preflight.
