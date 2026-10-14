---
id: d-0087
kind: decision
statement: Forge follows Paperclip's delivery model fully - Workers and the Director run on the harnesses the user already has installed (`claude`, `codex`, ...), found on PATH, using that harness's own login (subscription included). Per harness, Settings offers the same auth modes Paperclip does - (1) the installed harness's existing login (default), (2) an API key (e.g. `ANTHROPIC_API_KEY`, Bedrock/Vertex), (3) a long-lived OAuth token minted by a UI-driven `claude setup-token` flow, stored as a secret. A "Test environment" check per harness verifies the binary resolves, which auth mode is active, and runs a live hello probe. If a harness is missing, Forge shows the install command; it does not bundle harnesses.
source: { type: chat, ref: "2026-10-14 grill product shape Q5: \"check how paperclip is delivering it, ther use the user already instlled claude or other harness directly, i want this approach fully.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0031, d-0032, d-0053]
tags: [harness, auth, workers, director, settings, product]
pinned: true
---

Evidence (paperclipai/paperclip HEAD, read 2026-10-14): `docs/adapters/claude-local.md`
- prerequisites "Claude Code CLI installed", auth = `ANTHROPIC_API_KEY` or
`CLAUDE_CODE_OAUTH_TOKEN` or "a Claude Code subscription login"; UI "Test
Environment" runs `claude --print - --output-format stream-json --verbose`
hello probe. `src/server/setup-token-runner.ts` drives `claude setup-token`
through a PTY, token handled in memory only. `src/server/acp.ts` resolves the
ACP agent command (`claude-agent-acp`) from PATH or an operator override, and
installs `@agentclientprotocol/claude-agent-acp` only in managed sandboxes.

Risk accepted by the user after a warning: Anthropic's Agent SDK docs say
"Unless previously approved, Anthropic does not allow third party developers to
offer claude.ai login or rate limits for their products, including agents built
on the Claude Agent SDK." Paperclip ships this model anyway; Forge does the same.

Open (next grill question): installed harness versions drift from the version
Forge's probes and native tool schemas were reviewed against (d-0053 pin,
2.1.293 vs host 2.1.296).
