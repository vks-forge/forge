---
id: d-0066
kind: decision
statement: A pipeline (`.forge/pipelines/<name>.yaml`) is a graph — named nodes (agent | gate | human | terminal) with outcome-labelled edges (e.g. pass/fail, approve/changes/escalate, worker_right/critic_right), branches and loops — not only a linear list. The engine walks the graph one node at a time, recording the current node and loop counters on the run so a restart resumes correctly.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q2: user chose 'Full graph (DAG + loops)' over linear+extras (recommended) and simple linear" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, engine, config, x-0011]
pinned: false
---

Safety conditions added by the director (to be confirmed in the brief, not the
user's words): the pipeline is validated at load and refused if (1) any path
from start to a `merge` terminal skips a required gate for its lane/tier,
(2) any cycle lacks a `max` visit count, (3) a node has an outcome with no
edge, (4) terminals other than merge / park / cancel exist, or (5) an agent
node's output reaches merge without passing an independent gate or human (d-0001).
