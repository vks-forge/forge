---
id: d-0054
kind: decision
statement: For M0, a Forge server restart kills every in-flight run. The per-run HMAC secret lives only in server memory and is never persisted; on start, reconcile marks `running` runs not owned by this server instance as crashed, revokes their tokens and re-queues the ticket per errorFamily `crash`. A restart-survivable scheme (per-run secret derived from a DPAPI-held master key) is deferred.
source: { type: chat, ref: "2026-10-13 user approved review recommendation 2 ('yes')" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-13
superseded_by: d-0092
valid_to: 2026-10-14
supersedes: null
tags: [execution-plane, receipts, secrets, engine]
pinned: false
---
