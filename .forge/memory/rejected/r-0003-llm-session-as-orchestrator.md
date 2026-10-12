---
id: r-0003
kind: rejected
statement: Make the Director one long-lived LLM agent session that orchestrates everything.
source: { type: chat, ref: 2026-10-12 orchestrator research; user "ok" on engine-vs-heartbeat }
author: user
origin: owner
status: active
valid_from: 2026-10-12
tags: [director, control-plane]
---
Reason: every production system that tried it retired it (Kilo deprecated
orchestrator mode, Roo Code archived, Plandex shut down); Symphony and
Paperclip both use a scheduler tick with finite runs. A long session drifts
and cannot be replayed. The LLM is still used, as finite schema-validated
steps inside the engine (d-0003).
