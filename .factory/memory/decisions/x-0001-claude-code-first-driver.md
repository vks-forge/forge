---
id: x-0001
kind: proposed
statement: Build the Claude Code `WorkerDriver` first (Agent SDK `query()`, fallback `claude -p --output-format stream-json`), then Codex, OpenCode, Pi, ACP.
source: { type: chat, ref: 2026-10-12 harness research }
author: director
origin: agent
status: superseded
valid_to: 2026-10-12
superseded_by: d-0029
approved_at: 2026-10-12
valid_from: 2026-10-12
confidence: 0.75
tags: [execution-plane, harness, build-order]
---
Why: richest control surface (`canUseTool`, PreToolUse `permissionDecision`,
`maxBudgetUsd`, resume/fork, SDK MCP tools, `interrupt()`). Cost: Workers must
use API keys through Bifrost; the user's own Claude login cannot be routed
through the gateway. Alternative: Codex first for its native Windows sandbox.

Approved 2026-10-12 (user: "approved all").
