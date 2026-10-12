---
id: d-0019
kind: decision
statement: Skills and agent definitions must be self-improving: the factory observes outcomes and proposes improvements to its own skills and agents.
source: { type: chat, ref: 2026-10-12 user message "need self improving skills and agents are reuqired for improvemnts in them." }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [skills, agents, self-improvement, memory, ledger]
pinned: true
---
Constraint from d-0001 and `memory-system.md`: self-improvement is
propose-then-gate, never self-apply. Sketch for the design doc (pending):
- Signal: `skill_usage` and `outcomes/` (gate results, rework count, cost,
  lane escalations) joined per skill / agent version.
- Trigger: same as janitor (Epic close, every 25 runs, manual).
- Step: `improve_skill` LLM step reads failing outcomes + current SKILL.md /
  agent YAML, emits a diff + rationale to `.factory/proposed-skills/<name>/`,
  opens a PR. Origin recorded; untrusted-tainted turns excluded.
- Promotion by ledger tier (`execution-plane.md` §5a): prose / `references/`
  = Tier A after canary pass; `allowed-tools`, scripts, agent `tools` /
  `lanes` = Tier C (user signs).
- Eval before merge: run the changed skill on a held-out set of past tickets
  (replay) and require no regression on G1–G3 pass rate.
Revives parts of the skills registry deferred in x-0005 (`skill_usage`,
versions, signatures).
