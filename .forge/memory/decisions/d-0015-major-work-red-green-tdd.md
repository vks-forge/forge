---
id: d-0015
kind: decision
statement: Every major workflow goes through red-green TDD (failing test written and seen to fail before implementation, then made to pass). The orchestrator (Director) decides which work is major and which is simple.
source: { type: chat, ref: 2026-10-12 user message "all major workflow(decided by orhastrator that which work is major and which is simple) should go though red-green TDD tests for better quality" }
author: user
origin: owner
status: active
valid_from: 2026-10-12
superseded_by: null
supersedes: null
tags: [quality, tdd, director, lanes, verification]
pinned: true
---
Mapping to existing design:
- "major vs simple" = the lane decision (d-0006). Standard and Full = major
  → TDD mandatory. Express = simple → TDD optional. Director's `triage` step
  owns the call; user can override in chat.
- Enforcement is not trust-based. G1 checks tool receipts for the red-green
  order: a test-run receipt with failures on the new test, an edit receipt on
  non-test files after it, then a passing test-run receipt. Missing red phase
  fails G1 on Standard/Full with the receipt gap quoted.
- Worker prompt for major lanes loads the `tdd` skill
  (`~/.claude/skills/tdd/SKILL.md` exists; render into per-run HOME).
- Applies to this repo's own build too: Standard/Full tickets on the factory
  codebase start with a failing test.
