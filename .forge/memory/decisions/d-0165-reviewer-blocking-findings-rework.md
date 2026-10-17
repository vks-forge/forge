---
id: d-0165
kind: decision
statement: A check-stage reviewer's blocking findings (critical or high, with evidence) send the ticket back for rework through the gate-failure path, up to the auto-rework cap, then to the owner; they do not simply hold the merge. This resolves the d-0071 / d-0152 tension in favour of rework (S5b open question 1).
source: { type: chat, ref: "2026-10-18 user, answering S5b Q1 (reviewer rework vs hold): \"1) back for rework\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-18
superseded_by: null
supersedes: null
amends: [d-0071]
tags: [pipelines, reviewer, rework, s5b]
pinned: false
---

Built-in check stages use `on_blocking: 'rework'`; `hold` stays available per stage.
