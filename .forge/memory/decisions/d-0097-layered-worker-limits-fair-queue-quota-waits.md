---
id: d-0097
kind: decision
statement: Worker concurrency uses layered limits set in Settings - a global max (default 2, with a RAM/CPU-based hint), a per-project max (default 1), and a per-harness/login max (subscription window or API rate limit). The queue picks by ticket priority, round-robin across projects so no repo starves. When a harness hits quota, Forge parses the reset time, parks that harness until then, and either applies the agent's fallback list (d-0080) or keeps the ticket waiting; the UI shows the wait reason and reset time. Automatic scaling from live CPU/RAM is deferred.
source: { type: chat, ref: "2026-10-14 grill product shape Q14: user replied \"ok\" to the recommendation 'option 2: layered limits + fair queue + quota waits'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [engine, concurrency, queue, quota, settings, product]
pinned: false
---

Extends today's `engine.max_concurrent_by_state` (core forge-config schema),
which stays for per-state caps such as verifying.
