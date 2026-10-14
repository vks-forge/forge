---
id: d-0106
kind: decision
statement: Cards start with four types - Discussion (talk only, no tickets until converted), Plan (Director writes a plan in the card, the user approves, then tickets), Issue (normal triage to tickets), PR issue (review comment / failing check / reopened bug on a Forge PR -> rework ticket linked to the original card). The Director suggests the type at intake; the user can change it; cards convert between types keeping history; all types share one card page and differ only in the actions offered. Card types must be future-proof - defined as data in a type registry (name, icon, allowed sources, allowed actions, whether tickets need plan approval, default lane hint), stored with the company config (d-0085) so new types are added later without engine changes.
source: { type: chat, ref: "2026-10-14 card grill Q2: \"its works. but we need to make this suture proof so later we can add more as needed\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [cards, types, config, extensibility]
pinned: false
---
