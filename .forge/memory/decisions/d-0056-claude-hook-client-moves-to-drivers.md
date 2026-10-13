---
id: d-0056
kind: decision
statement: The Claude-specific parts of `@forge/hooks` (hook client `bin/hook.js` and `client/`, Claude hook payload schemas, `--settings` / `_meta` renderers) move to `packages/drivers/src/adapters/claude/hooks/`. `@forge/hooks` keeps only the harness-neutral receipt ingress (token check, `admit()`, receipt append, wire schemas). Done before a second harness driver exists.
source: { type: chat, ref: "2026-10-13 user approved review recommendation 4 ('yes')" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [layering, hooks, drivers, harness-neutral]
pinned: false
---
