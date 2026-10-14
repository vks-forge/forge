---
id: d-0053
kind: decision
statement: The ACP engine runs the Claude Code CLI bundled with the pinned `@anthropic-ai/claude-agent-sdk` (2.1.293 at adapter 0.89.1), not the host's `claude` (2.1.296). Forge pins that bundled CLI and does not set `CLAUDE_CODE_EXECUTABLE`. Probe facts in d-0048 items 5-6 were measured through the bundled 2.1.293; items 1-4 through the host CLI. `pnpm probes` must re-run on every adapter/SDK version bump as well as every host Claude Code upgrade; RESULTS.md records both versions.
source: { type: chat, ref: "2026-10-13 user approved review recommendation 1 ('yes') after the fable review found the adapter resolves its bundled claude.exe" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-13
superseded_by: d-0088
valid_to: 2026-10-14
supersedes: d-0048
tags: [execution-plane, drivers, claude, acp, probes]
pinned: true
---

Carries over every measured fact of d-0048 unchanged; corrects its version
attribution and probe count (11 probes, not 9/9) and adds the re-probe trigger.
