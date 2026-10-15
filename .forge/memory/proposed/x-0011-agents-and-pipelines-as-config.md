---
id: x-0011
kind: proposal
statement: Agents and the per-lane process are config, not engine code. Each agent role is a file under `.forge/agents/<name>.yaml` (kind worker | reviewer | tester | planner, harness, model, instructions, tools, output schema). Each lane's process is a pipeline file under `.forge/pipelines/<lane>.yaml` — an ordered list of stages, each an agent, a gate or a human step. The engine becomes a generic stage runner over ports. Fixed invariants no config can break - no agent approves its own work (an agent stage is followed by an independent gate or a human before merge, d-0001); one merge door after gates pass at tier A (rule 6); every ticket move via `transition()`; reviewers/testers read-only unless granted a scoped write area; lanes only escalate (d-0006). Express becomes `worker → G1 → merge` as a pipeline file. Built before the Standard lane so the G4 critic and any reviewer/tester are the first config-defined agents.
source: { type: chat, ref: "2026-10-14 user: \"so how customizable is this? for later i want to add more agents between the code process then how we are going to do this?\" then \"yes record this. lets grill this idea with me with more cutomization\"" }
author: director
origin: inferred
status: pending
confidence: 0.75
created: 2026-10-14
tags: [engine, agents, pipelines, config, customization]
---

Today the engine hard-wires triage → Worker → verify → merge; adding a role
means editing `packages/engine`. Grill session with the user on 2026-10-14
refines this before a brief is written; answers are recorded as decisions.

Note 2026-10-15 (orchestrator, from the B14 docs pass): superseded parts - the
file shape (`.forge/agents/<name>.yaml`, `.forge/pipelines/<lane>.yaml`) and any
signing or tier-C handling of those files are replaced by d-0085 (database rows
with immutable versions, UI-only editing, company defaults + per-project
overrides; d-0085 also supersedes d-0065 and d-0068). "Engine as a generic stage
runner over ports" stands; definitions arrive through the `ConfigSource` port.
Still open: pipeline graph, handoffs, per-agent budgets, replay and canary
(d-0066 to d-0081); the engine does not read pipelines yet.
