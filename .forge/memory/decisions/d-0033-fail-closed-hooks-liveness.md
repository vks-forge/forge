---
id: d-0033
kind: decision
statement: Native tool calls are receipted and gated through harness hooks declared in the per-run settings layer with `onFailure: "block"` and an explicit `timeout` on every hook (Claude Code >= 2.1.295); a `SessionStart` hook must register `run_id + hook fingerprint` with the Factory API before the first tool call or the engine kills the run; PreToolUse is the native chokepoint answering from the admission function; PostToolUse failure marks the effect `uncertain` and triggers a checkpoint diff; hooks use exec form `node <hook.js>`.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0026
tags: [tools, receipts, hooks, verification]
pinned: true
---
Claude Code's default is fail-open on hook timeout or crash; this record makes fail-closed explicit. A Factory API outage pauses tool calls at the next PreToolUse.
