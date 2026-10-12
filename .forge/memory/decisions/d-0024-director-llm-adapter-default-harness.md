---
id: d-0024
kind: decision
statement: Director LLM steps run through a `DirectorLLM` adapter; default is the harness the user is already logged into (e.g. `claude -p --output-format json --json-schema`), with API-key mode when configured in Settings.
source: { type: chat, ref: 2026-10-12 grill session, Q7 "option C, default to use the harness if it has already loggedin" }
author: user
origin: owner
status: superseded
valid_to: 2026-10-12
valid_from: 2026-10-12
superseded_by: d-0032
supersedes: null
tags: [director, llm, adapters]
pinned: true
---
Verified on Claude Code 2.1.296: `--json-schema` exists for structured output in `-p` mode.
