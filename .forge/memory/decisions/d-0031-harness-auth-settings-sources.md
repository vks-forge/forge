---
id: d-0031
kind: decision
statement: Harness credentials are whatever the harness itself is signed into; credential mode (`subscription | api_key | gateway`) and connection are configurable per agent in Settings with a default harness (today Claude Code on the user's subscription). Every Worker run sets `settingSources` to exclude `user` and `project` (SDK/ACP `settingSources: []`, CLI `--setting-sources` without them) plus a sanitized per-run `--settings` file stored under `.factory/data/runs/<id>/`, because `--settings` is additive and would otherwise load the user's own hooks and the parent repo's CLAUDE.md.
source: { type: chat, ref: 2026-10-12 user "finalize" after enhance pass (docs/design/reviews/2026-10-12-enhance-pass.md) }
author: user
origin: owner
status: active
valid_from: 2026-10-12
approved_at: 2026-10-12
superseded_by: null
supersedes: d-0022
tags: [harness, credentials, settings, ui, isolation]
pinned: true
---
Paperclip pattern kept: shared `CLAUDE_CONFIG_DIR` for login, per-agent config dir for separate accounts, billing type auto-detected. `--bare` and per-run HOME only in `api_key` mode. Preflight verifies that OAuth still authenticates with `user` excluded (UNVERIFIED until slice 2).
