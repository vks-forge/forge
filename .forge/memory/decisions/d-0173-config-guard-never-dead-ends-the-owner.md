---
id: d-0173
kind: decision
statement: The owner never has to write code to get past G1's gate-configuration guard. A Worker may create gate configuration files (tsconfig, vitest/eslint config, ...) in a project that has no project checks configured, since nothing can be loosened yet; and when a ticket's only G1 finding is gate configuration, it is not reworked automatically but held for the owner, who sees the config files changed and can Merge anyway (recorded as an owner override), Send back, Re-plan or Cancel. Every other G1 check (receipt chain, claims, scope, test tampering, project checks) still blocks as before.
source: { type: chat, ref: "2026-10-20 user, after CHE-1 failed G1 three times on tsconfig.json / vitest.config.ts / eslint.config.mjs it was asked to create: \"the main problem forge is that user dont have to code. so failing this task is very bad, i want you lo loosen this G1 gate test as you are suggesting and make it workable\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-20
superseded_by: null
supersedes: null
amends: [d-0071]
tags: [gates, g1, config-guard, verification, owner]
pinned: false
---

Found on CHE-1 ("Scaffold Next.js 16 app ..."): five of six G1 checks passed; gate-config
failed on files the ticket required, two automatic reworks could not change anything
(same head sha), and the rework-cap item offered only Retry / Re-plan / Cancel. d-0071
said deterministic gates always block; this narrows that for the config guard only.
