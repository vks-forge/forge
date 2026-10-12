---
id: d-0038
kind: decision
statement: Tool system v2 as in x-0009, with the M0 slice amended: shell commands are parsed by a simple tokenizer (split on `&&`, `;`, `|`, `$(`, backticks) with longest-prefix matching and `ask` on anything unparsed; tree-sitter bash parsing moves to M1 pending Windows verification. Catalogue, grants and skill signatures are verified from the main checkout's HEAD, never from files inside the Worker's cwd.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: x-0009
tags: [tools, permissions, m0]
pinned: true
---
Claude Code's own `Bash(prefix:*)` rules remain the hard floor underneath the hook.
