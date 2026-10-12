---
id: d-0049
kind: decision
statement: The Claude driver stays ACP-first. Because the ACP adapter still reads the user's `settings.json` despite `settingSources: []` (d-0048 item 6), the driver sends `session/set_mode` with `default` immediately after every `session/new` and `session/load`, and every tool call is decided by Forge's own `session/request_permission` handler (`admit()`), never by harness-side settings or modes. For M0 on this single-user box, user-level hooks and CLAUDE.md may still reach a Worker; two follow-up probes (does `strictMcpConfig` suppress MCP servers; do user hooks fire under ACP) run before slice 3, and an upstream issue is filed against claude-agent-acp.
source: { type: chat, ref: "2026-10-13 user chose option A after the probe report" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
superseded_by: null
supersedes: null
tags: [execution-plane, drivers, acp, permissions, isolation]
pinned: true
---

Amends d-0035 (adds the set_mode step and moves auth detection to the
`_auth/status_update` notification). Rejected alternative: CLI-first with
stream-json, which is isolated correctly but loses live steering and resume.
