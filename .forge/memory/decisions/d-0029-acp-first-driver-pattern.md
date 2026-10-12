---
id: d-0029
kind: decision
statement: Worker drivers use the harness's ACP server as the primary engine (`claude-agent-acp`, `codex-acp`, `pi-acp`, `gemini --acp`, OpenCode ACP) with persistent sessions, and the plain CLI (`claude -p`, `codex exec`, `pi --mode json`) as the explicit fallback; steering is a per-ticket message queue delivered as `follow_up` by default, `interrupt` on explicit user action (stop run, dispatch queue), and native same-turn `steer` where the ACP adapter supports it.
source: { type: chat, ref: 2026-10-12 grill session, Q15 "user will self sign the harness ... we only have to consider about using the harness in correct pattern. check paperclip for this more" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0035
supersedes: x-0001
tags: [execution-plane, drivers, acp, steering]
pinned: true
---
Paperclip's claude-local defaults `engine: auto -> ACP`, CLI only when chosen; the ACP lane uses the host login. Build order stays Claude first; the Claude driver is the ACP adapter plus CLI fallback. Other harnesses are installed after the Claude loop works (user: "install it after claude loop is working"); Claude installs them as needed, asking the user when blocked.
