---
id: d-0064
kind: decision
statement: Measured on claude-agent-acp 0.89.1 (probe 8, 2026-10-13) — the ACP adapter announces a tool call as soon as the model starts writing it, with `rawInput: {}`; the PreToolUse hook (and so the server-side decision receipt) only happens after the full input has streamed, which can be seconds later. The driver's receipt cross-check therefore checks a call announced with empty input when its `tool_result` arrives (or at settle if the turn ended without one), not on a fixed grace timer from the announcement. Calls announced with their input keep the immediate check. A hook bypass is still caught, at the latest when the tool completes.
source: { type: probe, ref: "probe 8 run 1, 2026-10-13: 'tool call toolu_013C… (Edit) has no server-side decision receipt' 3 s after an empty-input announce; receipt landed after the grace" }
author: director
origin: measured
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [drivers, claude, acp, receipts, probes]
pinned: false
---

Without this the driver killed healthy Workers that wrote two edits back to
back (the second announce outlived the 3 s grace while the first was still
streaming). Re-measure on any adapter/SDK bump (d-0053).
