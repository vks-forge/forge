---
id: d-0112
kind: decision
statement: Card policing - chat always creates cards; GitHub issues only when the project opts in, and issues from authors outside the allow-list wait for approval; the Director checks every open card at intake and merges likely duplicates (reversible split); a per-project cap on new cards from GitHub (default 20 per hour) with excess waiting for approval and bulk dismiss in Needs you; idle cards in Shaping or Needs you get a Director nudge at 7 days and a close suggestion at 14 days, never auto-closed without the user; each card has a budget cap (sum of its tickets, default from settings) that pauses the card to Needs you; every card action is logged with its actor (user, Director, GitHub user); tickets touching CI, secrets or Forge config always need approval. All numbers are per-project settings.
source: { type: chat, ref: "2026-10-14 card grill Q8: user \"ok for this i have more idea in mind\" (accepting the policing package, then adding the Issues page idea, d-0113)" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [cards, policing, github-issues, budgets, audit]
pinned: false
---
