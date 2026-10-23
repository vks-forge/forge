---
id: x-0017
kind: decision
statement: Director spend is recorded in its own dated ledger table (`director_spend`, one row per Director step with model and USD, card and ticket when known), so Cost, Overview and budgets count Worker and Director spend together. This amends d-0159's "no new tables" for the Overview, which meant no dashboard-only tables.
source: { type: chat, ref: "docs/briefs/eval-fix-6-cost-cancel-status.md open question A1 (recommended answer), built during the owner-authorised autonomous run of 2026-10-23" }
author: director
origin: agent
status: active
confidence: 0.8
approved_at: 2026-10-23
approved_source: { type: chat, ref: "2026-10-23: user \"approved\" after the autonomous-run report listing x-0016 and x-0017" }
valid_from: 2026-10-23
amends: [d-0159]
tags: [cost, director, overview, storage]
---

Built in eval-fix-6 step 1 using the brief's recommended answer; the owner approves or rejects at the next pause.
