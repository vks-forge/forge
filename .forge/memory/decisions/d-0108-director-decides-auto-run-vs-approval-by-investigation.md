---
id: d-0108
kind: decision
statement: Whether a card's tickets start immediately or wait for the user's approval is decided by the Director's own investigation before any user interaction, not by a file-count rule. The Director examines the request against the project - the code it would touch, every current card and ticket (in-flight work, overlaps, conflicts, duplicates), project memory and recent outcomes - and decides "run now" or "needs approval", recording its findings and reasons on the card. Small work that spans many files may run without approval; risky or ambiguous work waits. Approved / auto-run work then proceeds through lanes as usual; if a running ticket turns out bigger or riskier than judged, it escalates and the card returns to Needs you. A per-project "Always ask before running" setting forces approval for every card.
source: { type: chat, ref: "2026-10-14 card grill Q4: \"ok. Express - its not about only 3-5 files, before user intraction directior should run in its own finding that if this can be done with user approval or not. there can be many work that is small but required changing in mutiple files. also while deciding this director should be able to find view all current tickets|cards etc to confirm his decisions validly\"" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-14
superseded_by: d-0142
valid_to: 2026-10-16
supersedes: null
amends: [d-0006, d-0017, d-0025]
tags: [director, triage, approval, cards, lanes]
pinned: true
---

Replaces the approval role of the fixed heuristic in
`packages/core/src/domain/lane-triage.ts` (`EXPRESS_MAX_FILES` 3, body length);
lane choice and approval are now separate Director judgements. Depends on the
Director's project-wide read access (x-0012). Director note: tier C paths
(CI, secrets, Forge's own config) default to always needing approval; confirm.
