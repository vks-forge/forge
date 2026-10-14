---
id: d-0110
kind: decision
statement: The Director sets ticket dependencies when planning (shown as arrows on the card's ticket timeline). A dependent ticket starts only when the tickets it needs have merged, or - when the Director judges it safe - have passed the gate (stacked on that branch). When an upstream ticket is stopped, re-planned or reworked, its running dependents are paused automatically and the Director decides per ticket - continue, restart on the new base, or cancel - sending the card to Needs you only when it wants the user's call. Dependencies may cross cards (shown on both). The engine refuses a plan with a dependency cycle.
source: { type: chat, ref: "2026-10-14 card grill Q6: user \"ok\" to the recommended dependency rules" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [tickets, dependencies, director, cards, engine]
pinned: false
---

Today `ticket_relations` exists (migration 0001) and dispatch skips blocked
tickets; stacking on a gated branch and automatic pause-on-upstream-change are new.
