---
id: d-0018
kind: decision
statement: The enhancement skill(s) the orchestrator runs after grilling are written by us for this factory, not adopted from existing skills.
source: { type: chat, ref: 2026-10-12 user message "enhancment skills we have to create by our own." }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [skills, director, planning]
pinned: true
---
Lives in `.factory/skills/enhance-decisions/SKILL.md` (Agent Skills format).
Input: finalized grill answers + codebase (graft / code graph) + project ideas
(`research/`, memory). Output: amended decision list with risks, missed
points, and cheaper alternatives, each tagged keep / change / drop for the
user to finalize. Must honour d-0001 (independent gate) and memory origin
rules (`memory-system.md` §7).
