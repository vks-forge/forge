---
id: d-0067
kind: decision
statement: Measured on bundled Claude Code 2.1.293 (probe 8, 2026-10-14) — Claude Code defers MCP tool schemas behind its `ToolSearch` tool, so a Worker that cannot call ToolSearch (Forge denies it) cannot see the forge tools' schemas and calls `finish` blind. Forge disables deferral for every Worker session with `ENABLE_TOOL_SEARCH=false`, set both in the ACP `_meta.claudeCode.options.env` and in the per-run settings `env` block, instead of admitting ToolSearch. `finish` may be called again in the same run (last call wins) until the run settles.
source: { type: probe, ref: "probe 8, 2026-10-14: Worker 'called finish early with a placeholder and no claims, because I had only just loaded its schema'; ToolSearch denied unknown_tool; after the fix 3/3 live runs passed with 0 denials" }
author: director
origin: measured
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [drivers, claude, mcp, probes]
pinned: false
---

Re-measure on any CLI/adapter/SDK bump (d-0053): the env switch is read inside
the bundled `claude.exe`, not a documented setting.
