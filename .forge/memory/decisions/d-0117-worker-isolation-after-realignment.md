---
id: d-0117
kind: decision
statement: Accepted risk until isolation lands - Workers and project checks run as the user's own OS account, so Worker-executed code (tests, scripts) can read Forge's data folder (install token, database, secrets) despite the policy floor; the floor is a policy layer over tool arguments, not an OS boundary. Now - document this limit plainly (tools README, PRODUCT.md known limits) and close the easy routes (C2 review fixes F1-F3). Next - real Worker isolation is the first work item after the realignment plan (B14/C3): run Workers and project checks under a separate low-privilege OS account (or WSL2/container per d-0005) with the data folder readable only by the Forge account.
source: { type: chat, ref: "2026-10-15 C2 review finding C2: user replied \"ok\" to the recommendation 'option 1 now (document + close easy routes), isolation as the first item after the realignment'" }
author: user
origin: owner
status: active
valid_from: 2026-10-15
superseded_by: null
supersedes: null
amends: [d-0005, d-0098]
tags: [security, isolation, workers, risk, roadmap]
pinned: true
---

Independent review 2026-10-15 (C2) proved the path floor bypassable by allowed
git subcommands (fixed in F1) and noted the architectural limit above.
