---
id: d-0149
kind: decision
statement: Agents exist at two levels - company agents (available in every project; built-ins live here) and project agents (only in that project) - and a project may override a company agent's instructions or model for itself, or disable it there (company default + project override, d-0085). Forge settings -> Agents manages company agents; Project settings -> Agents shows the project's effective list tagged company / overridden / project, with Override for this project, Disable here, and Duplicate. The Director assigns agents per ticket from the project's effective roster (description, role, tools, scorecard, d-0081), starting from the lane's default pipeline and adapting it (swap, add in parallel, drop), and records each ticket's pipeline, agents and reasons in the plan so they are approved with it. Hard limits - every writer is followed by an independent reviewer or gate, roles cannot exceed their permissions, Tier C needs the owner, one merge door. Owner controls - disable per project, routing rules that add required agents the Director cannot remove (d-0069), per-project default pipelines.
source: { type: chat, ref: "2026-10-16 user, Agents grill: asked \"so director will have full access to all agents, and will assign specific agents for specific work?\" then on Q2 (company + project agents): \"yes\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0069, d-0077, d-0085, d-0147]
tags: [agents, director, pipelines, config, ui]
pinned: false
---
