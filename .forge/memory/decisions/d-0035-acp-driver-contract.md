---
id: d-0035
kind: decision
statement: Worker drivers use the harness's ACP server as primary engine with the CLI as explicit fallback; the Claude driver pins `@agentclientprotocol/claude-agent-acp` (not the stale Zed package), passes per-run `settings`, `settingSources`, `strictMcpConfig`, `mcpServers`, `allowedTools`, `disallowedTools`, `maxBudgetUsd`, `maxTurns` through `_meta.claudeCode.options` pointing at files under `.factory/data/runs/<id>/` (never a file in the worktree), sends `allowDangerouslySkipPermissions: false` on every `session/new` and `session/load`, answers `session/request_permission` from the admission function, and treats "persistent" as resumable via `loadSession` with one ACP process per run; steering is a per-ticket queue delivered as `follow_up`, `interrupt` on explicit action, native `steer` where supported.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0029
tags: [execution-plane, drivers, acp, steering, permissions]
pinned: true
---
r-0005 stays rejected: both the upstream adapter and Paperclip's acpx default to bypass unless told otherwise. CLI fallback lane runs Express only (unattended deny) until the permission-prompt-tool bridge is verified. Other harnesses are installed after the Claude loop works.
