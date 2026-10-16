---
id: d-0133
kind: decision
statement: A finished plan is approved either by the Director itself or by the user. The Director auto-approves when its verification finds nothing that needs the owner; when it genuinely needs a human (risky or sensitive change, conflicting cards, a real product choice, significant open assumptions, budget) it raises the card to Needs you with specific questions and does not proceed. The per-project "Always ask before running" setting (d-0108) forces user approval for every card. User actions on a ready plan - Approve plan (the only path that creates tickets; shows "creates N tickets in this order" first; tickets get priority and dependencies, card goes In progress, first unblocked ticket queues), Request changes (Director re-grills only the changed points and writes the next plan version with a diff), and light ticket edits before approval (rename, reorder, remove, priority). A card that depends on an unfinished card can be planned and approved; its tickets wait and the card shows "Blocked by <card>".
source: { type: chat, ref: "2026-10-16 user, grill Q6: \"looks good. cards can be auto approved by director, if its really need human or owner then also raise the card with need action with proepr questions etc.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0108, d-0132]
tags: [director, planning, approval, cards, tickets]
pinned: false
---
The user kept Director auto-approval (d-0108's spirit) instead of "every card
needs a click", with escalation to Needs you carrying concrete questions.
