---
id: d-0143
kind: decision
statement: Cost control on cards is informational, never blocking. A card's budget (d-0112) counts both its ticket runs and its Director steps; crossing it, or any spend threshold, shows a warning on the card, in the card chat and in the Inbox that asks the owner to acknowledge or adjust, while the card and its tickets keep running. Budget is not a condition of Director auto-approval, and an over-budget card can still file tickets.
source: { type: chat, ref: "2026-10-16 user, on the enhance report's cost finding: \"cost control should be only a warning, need user approval to continue, it does not block the card or ticket. this should only be a informationsal guard. accept all\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0112, d-0133, d-0141]
tags: [cost, budget, cards, approval]
pinned: false
---
Per-agent run caps of d-0072 (an agent's own usd/minutes/turns cap stops that
run) are a separate earlier decision and stay unless the owner changes them.
