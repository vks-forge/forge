---
id: d-0032
kind: decision
statement: Director LLM steps run through a `DirectorLLM` adapter; default is the logged-in harness via `claude -p --output-format json --json-schema <schema> --tools "" --setting-sources <none> --no-session-persistence --permission-prompts none --max-budget-usd <n>`, with API-key mode when configured in Settings; the cost pane counts subscription turns per window and Settings can cap concurrent subscription Workers.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0024
tags: [director, llm, adapters, cost]
pinned: true
---
Steps never inherit repo hooks, MCP servers or tools. Print mode silently ignores invalid settings files, so the step runner validates its own settings file before each call.
