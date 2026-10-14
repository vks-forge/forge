---
id: d-0080
kind: decision
statement: When an agent cannot run (rate limit, harness down, model unavailable) Forge combines three steps in order - (1) wait and retry the same agent with the existing backoff policy for short outages; (2) then try the agent's ordered `fallback:` list (other model or other harness), recording which one actually ran; (3) if the list is exhausted, the Director picks a substitute agent/model at runtime and records why. If nothing can run, the ticket pauses and the user is notified. These settings are configurable per agent and must be refinable from the UI later.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q15: user note \"merge all 3 option, should be able to refine this from UI\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [agents, fallback, resilience, director, ui, x-0011]
pinned: false
---

Director note: a critic's fallback and substitute still follow d-0073 (different
model family from the Worker, warning-only until a second harness exists).
