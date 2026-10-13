---
id: d-0062
kind: decision
statement: Pushing branches, opening PRs and merging go through a core `GitHost` port with two adapters built in E2 — a local bare-repo host (offline, used by the end-to-end fixture test) and a GitHub App host (installation token minted from the App private key, push via that token, open PR, merge by policy). The App private key is read through a core `SecretStore` port whose Windows adapter uses DPAPI (CurrentUser scope); the token never appears in logs, process arguments or git config. Workers never push (d-0012); merge has one door (code.md rule 6).
source: { type: chat, ref: "2026-10-13 user chose 'Port + local + GitHub (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [git, github, secrets, dpapi, engine]
pinned: true
---

Rejected: local-only in E2 with GitHub deferred to dogfood (first real PR would
be untested until slice 4).
