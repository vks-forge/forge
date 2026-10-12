---
id: d-0014
kind: decision
statement: Before any work proceeds, the orchestrator (Director) always runs the `grill-me` skill with the user until no point is left open, then runs an enhancement skill over the resulting decisions against the full codebase and project ideas, then the user finalizes. Until that finalization, everything is discussion only; no work is dispatched.
source: { type: chat, ref: 2026-10-12 user message "the orhastrator will alwys use grill-me skill with user so no points should be left out, after grill me in finished, it will run a enhancment skill on the decisions by analyzzing the full codebase and project ideas, after finalizing this all then only the work is going forward otehrwise its only a disscussion" }
author: user
origin: owner
status: superseded
valid_from: 2026-10-12
valid_to: 2026-10-12
superseded_by: d-0017
supersedes: null
tags: [director, process, planning, skills]
pinned: true
---
Sequence: grill-me (one question at a time, recommended answer each, explore
codebase instead of asking when possible) → enhancement pass (decisions ×
codebase × project ideas) → user finalizes → dispatch. Applies to this repo's
own build sessions and to the factory's Director `plan` phase.

Open points to resolve with the user (not yet decided):
- Interaction with Express lane (d-0006): grill-me on every one-file change
  defeats Express. Likely reading: applies to Standard / Full and to any
  session that changes design; Express stays interview-free.
- No skill named "enhancement" exists in `~/.claude/skills/`. Nearest:
  `improve-codebase-architecture`, `before-building`, `codebase-design`,
  `level-up`. Either pick one or write a factory-specific `enhance-decisions`
  skill.
