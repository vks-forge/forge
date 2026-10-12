---
id: x-0007
kind: proposed
statement: Amend the self-improvement design per the 2026-10-12 surveys: 18-step loop (instrument, freeze, scrub, attribute, small edit with no_op/remove, artifact caps, static gate, minibatch, balanced replay probe with hard regression budget, use-eval per harness, separated proposer/gate/metric, tiered human merge with no auto-merge until 20 clean promotions, pointer promotion, monitor + auto-rollback, lifecycle retire/cap/rebuild, churn stop, budget, monthly review); per-run skill cap of 3.
source: { type: chat, ref: 2026-10-12 user request "tell me by searching online with proper research, what is self-improvments steps should be in a plan" }
author: director
origin: agent
status: active
approved_at: 2026-10-12
valid_from: 2026-10-12
confidence: 0.8
tags: [self-improvement, skills, agents, research]
---
Details and evidence: `docs/design/self-improvement.md` §12–§13. Reports:
`research/notes/self-improvement/`. Strongest negative finding: ungated
self-written skills score 8–11.5 points below no skills (SkillsBench), so
the gate is the product, not the proposer.

Form: a system, not a skill. Collector, freeze, gates, probe, acceptance,
pointer, monitor, rollback, lifecycle, budget = code in `packages/improve/`
and engine jobs. One LLM step (`improve_skill`) reads one skill
(`.factory/skills/skill-author/`) for authoring guidance.

Approved 2026-10-12 (user: "approved").
