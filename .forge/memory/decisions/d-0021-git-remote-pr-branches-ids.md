---
id: d-0021
kind: decision
statement: The factory repo is initialised with git and a private GitHub remote (URL supplied by the user); the factory bot is a fine-grained token held only by the dispatcher; every merge, including Tier A, goes through a PR that the bot merges; branches are `<type>/<ticket-id>-<slug>` with type in {feat, fix, chore, docs, refactor, test, perf, ci}; ticket ids are `<PROJECT>-<n>` publicly with a UUID internally.
source: { type: chat, ref: 2026-10-12 grill session, Q2 "B, i will give you the repo url", Q12, Q13 }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [git, branches, tickets, ledger]
pinned: true
---
No `git init` or commit until the user provides the URL and says go.
