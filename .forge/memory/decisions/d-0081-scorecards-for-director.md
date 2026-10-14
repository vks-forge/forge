---
id: d-0081
kind: decision
statement: Forge keeps scorecards per agent and per pipeline shape, computed from ticket outcomes - pass rate, rework count, cost, time, and reviewer findings later judged real vs false alarm - sliced by ticket type, severity and tier. The Director reads them when it builds a ticket's pipeline (d-0077); the user sees the same scorecards in the control room. Scorecards inform choices; they do not change default pipelines or agent settings automatically.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q16: user chose 'Scorecards from outcomes (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [director, scorecards, metrics, x-0011]
pinned: false
---

Rejected: rules + memory only (the Director never improves its choices);
auto-tuning defaults from results (behaviour drifts without a user decision).
Open for the brief: how a finding is judged real vs false alarm (user verdict,
later bug linked to the change, mutation/test evidence).
