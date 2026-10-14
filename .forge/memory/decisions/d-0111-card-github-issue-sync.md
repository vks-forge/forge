---
id: d-0111
kind: decision
statement: Card <-> GitHub issue sync - (1) issue edited: a note in the card chat; if scope changed the Director re-triages (unstarted tickets updated, running ones steered or sent to Needs you); (2) issue comments appear in the card chat attributed to the GitHub user; the Director may reply on GitHub; Workers do not receive them directly, the Director relays; (3) the user's card chat stays private in Forge - only the Director's deliberate public updates (plan summary, PR links, done) are posted to GitHub; (4) Forge mirrors the card column as labels `forge:shaping`, `forge:needs-you`, `forge:in-progress`, `forge:done`; (5) card Done -> summary comment with merged PRs, then the issue closes; (6) card Closed -> comment with the reason, issue closes as "not planned" only after the user confirms in the card; (7) issue closed on GitHub -> card Closed and running tickets paused for the user's call; reopened -> card back to Shaping.
source: { type: chat, ref: "2026-10-14 card grill Q7: user \"approved\" (GitHub sync package as proposed)" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0096]
tags: [cards, github-issues, sync, privacy]
pinned: false
---
