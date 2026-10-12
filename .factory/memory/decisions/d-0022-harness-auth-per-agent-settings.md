---
id: d-0022
kind: decision
statement: Harness credentials are whatever the harness itself is signed into; the factory never routes auth, it uses the harness in its correct pattern. Credential mode (`subscription | api_key | gateway`) and connection (`CLAUDE_CONFIG_DIR` or key ref) are configurable per agent in a Settings page with a default harness; today the default is Claude Code on the user's subscription.
source: { type: chat, ref: 2026-10-12 grill session, Q3 "i need all options so in UI i can configure per agent", Q4, Q15 }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0031
supersedes: null
tags: [harness, credentials, settings, ui]
pinned: true
---
Paperclip pattern adopted: shared `CLAUDE_CONFIG_DIR` for login, per-agent config dir for separate accounts, billing type auto-detected (api | subscription | metered_api), per-run `--mcp-config --strict-mcp-config`, per-run sanitized `--settings`, prompt bundle via `--add-dir`. `--bare` and per-run HOME only in `api_key` mode. Cost on subscription is estimated from tokens and marked `est.`
