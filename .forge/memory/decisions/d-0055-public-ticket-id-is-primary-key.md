---
id: d-0055
kind: decision
statement: Tickets have one id, the public `<PROJECT>-<n>` (e.g. `FG-1`), used as the database primary key, in receipts, branches and the UI. No internal UUID. All other d-0021 points (git + private GitHub remote, dispatcher-only bot token, PR always after bootstrap, `<type>/<id>-<slug>` branches) carry over unchanged.
source: { type: chat, ref: "2026-10-13 user approved review recommendation 3 ('yes')" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: d-0021
tags: [ids, tickets, storage]
pinned: false
---
