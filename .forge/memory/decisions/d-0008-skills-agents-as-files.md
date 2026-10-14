---
id: d-0008
kind: decision
statement: Skills are canonical `SKILL.md` directories (Agent Skills standard) and agent definitions are our own YAML, both in git under `.factory/`; each WorkerDriver renders them into the harness's layout at dispatch; the database holds only a registry (hash, signature, allowed projects, usage stats).
source: { type: chat, ref: 2026-10-12 user "yes" to files-canonical proposal }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
supersedes: null
superseded_by: d-0085
valid_to: 2026-10-14
tags: [skills, agents, execution-plane]
pinned: true
---
Spec: `docs/design/execution-plane.md` §5a.
