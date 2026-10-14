---
id: d-0101
kind: decision
statement: Measured (probe P-A, 2026-10-14) - the ACP adapter `@agentclientprotocol/claude-agent-acp` 0.89.1 runs the user-installed Claude Code binary when `CLAUDE_CODE_EXECUTABLE` is set in the adapter process env (acp-agent.js:645-647, 7359); `_meta.claudeCode.options.pathToClaudeCodeExecutable` is overwritten and does not work. Live - with the env set to the installed `claude.exe` (2.1.299) the adapter's child process was that exe, the prompt returned, and `_auth/status_update` reported the user's Claude Max login. B6 therefore keeps the adapter as a bundled npm dependency (not on PATH) and sets `CLAUDE_CODE_EXECUTABLE` to the PATH-resolved or user-configured `claude` path (forward slashes); the SDK-bundled CLI is not used. The per-version compatibility check (d-0088) must run against the installed CLI and assert the adapter's child executable path.
source: { type: probe, ref: "scratchpad pa/pa.mjs live run 2026-10-14; adapter dist acp-agent.js lines 645-680, 7322, 7359, 386" }
author: director
origin: measured
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [harness, acp, drivers, probe, b6]
pinned: false
---

Risk: adapter pins agent SDK 0.3.293 (expects CLI 2.1.293); tools, hooks,
permissions and session/load on newer CLIs are covered by the d-0088 check,
not assumed.
