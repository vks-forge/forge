---
id: d-0137
kind: decision
statement: MVP built-in agents - implementer (worker; writes only the ticket's write scope), test-writer (tester; writes failing tests first, test files only, d-0015), reviewer (read-only; findings with severity, file:line, evidence, d-0071), critic (read-only; different model family, same-family allowed with a warning until a second harness exists, d-0073). Default pipelines - Express: implementer -> gates -> merge; Standard: test-writer (red) -> implementer (green) -> gates -> reviewer -> merge; Full: test-writer -> implementer (parallel writers allowed) -> gates -> reviewer || critic -> Director check against the plan -> sign-off -> merge. Gates are the existing deterministic checks (red-green proof, project tests, lint, types) plus script gates (d-0074). A high or critical finding holds the merge as a ticket escalation (d-0135); sign-off is done by the Director unless a sensitive area needs the owner (d-0133). The Director may reshape any ticket's pipeline with recorded reasons (d-0077). Planned tickets carry the lane chosen in the plan, replacing the separate triage step for planned work.
source: { type: chat, ref: "2026-10-16 user, grill Q10 (MVP agents and default pipelines): \"ok\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0136, d-0025]
tags: [pipelines, agents, lanes, mvp]
pinned: false
---
