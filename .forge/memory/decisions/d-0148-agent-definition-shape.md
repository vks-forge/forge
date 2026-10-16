---
id: d-0148
kind: decision
statement: Every agent, built-in or user-made, is one versioned config record with the same fields - name and description (the Director reads the description when choosing agents), role (writer / reviewer / tester / researcher; the role bounds what it may do), instructions (markdown system prompt/playbook), harness and model (fallback list later, d-0080), tools from the catalogue limited by role (a reviewer can never get write tools), write scope (writers only), typed inputs and output (d-0070; reviewers never see the writer's narrative), skills and memory tags (d-0078), budget per run (usd, minutes, turns), and scope (company or project). Built-ins (implementer, test-writer, reviewer, critic) use the same form, are editable, and have Reset to default; every save is a new version and runs record the version they used.
source: { type: chat, ref: "2026-10-16 user, Agents grill Q1 (agent fields): \"looks good\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0147, d-0078, d-0070]
tags: [agents, config, ui]
pinned: false
---
