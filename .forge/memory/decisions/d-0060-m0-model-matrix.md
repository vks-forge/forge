---
id: d-0060
kind: decision
statement: M0 default model matrix — Director LLM steps (triage, dispatch_prompt, steer_reply) run on `opus`; Workers run on `sonnet` in every lane (express, standard, full). The matrix lives in `.forge/config` yaml validated by a core schema (role × lane → model) and is changeable later in Settings; per-run budget caps are set from a measured dry run before the first dogfood ticket. All calls use the logged-in harness subscription (d-0031, d-0032).
source: { type: chat, ref: "2026-10-13 user chose 'Opus director, sonnet worker'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [models, director, workers, config, cost]
pinned: false
---

Full-lane Worker model was not named separately; set to `sonnet` until the
user changes it.
