---
id: d-0012
kind: decision
statement: Workers never push and never hold git credentials; the dispatcher pushes the ticket branch after settlement; a single factory bot identity merges only when the merge policy allows (Tier A on green checks, Tier B after one human click, Tier C after the named signer's click).
source: { type: chat, ref: 2026-10-12 research synthesis; user has not objected }
author: director
origin: agent
status: active
valid_from: 2026-10-12
supersedes: null
superseded_by: null
confidence: 0.8
tags: [git, ledger, security]
pinned: true
---
Direct consequence of d-0001. Recorded as director-authored; supersede if the
user wants a different merge policy.
