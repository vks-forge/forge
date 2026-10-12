---
id: d-0005
kind: decision
statement: Workers run directly on installed coding harnesses (Claude Code, Codex, OpenCode, Pi; others via ACP) through one `WorkerDriver` contract; containers, WSL2, or harness sandboxes are an isolation option chosen per lane, not the default.
source: { type: chat, ref: 2026-10-12 user message "make the agents running in VM optional, instead use directly harness like opencode|claude code|PI" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
supersedes: d-0004
superseded_by: null
tags: [execution-plane, harness, isolation]
pinned: true
---
Spec: `docs/design/execution-plane.md`. Permission policy is allow-list per
lane, never bypass (see r-0005).
