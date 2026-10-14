---
id: d-0100
kind: decision
statement: To let G1 verify receipts written before a server restart (d-0092 resume), each run's HMAC receipt secret is stored encrypted in the SecretStore (`run/<runId>/secret`) for the life of the run and deleted when the run settles. A resumed run gets a new run token and a new secret generation; the receipt chain records a `resumed` link and G1 verifies each segment with its own generation's secret. The build plan B0-B14 (`docs/design/build-plan.md`) is approved and runs autonomously.
source: { type: chat, ref: "2026-10-14 after build plan: user \"approved and go autonomus\" (approving the plan and the D-1 recommendation)" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0054, d-0092]
tags: [receipts, g1, resume, secrets, build-plan]
pinned: false
---

Alternative rejected: sealing the chain at shutdown with a final hash (fails on
crash, where no shutdown runs).
