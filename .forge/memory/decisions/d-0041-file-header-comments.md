---
id: d-0041
kind: decision
statement: Every source and test file opens with a header comment stating what the file is, why it exists (with the design doc or decision id), its exports and its dependencies, so other developers and agents understand it without reading the code. Enforced by lint.
source: { type: chat, ref: "2026-10-13 user: 'write proper comments in every files explaining what is this file is about and why its needed or functionality. need this because other developer|agents will understand this clearly'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, comments, onboarding]
pinned: true
---

Written into `.claude/rules/code.md` rule 12 with the header template.

Amendment 2026-10-13 (user: "'why' is why this software needs this; it
should be knowledge data for agents and developers, not local rules"):
`Why:` describes the problem in the running system, the actors, the failure
prevented or invariant protected. Doc/decision ids only as pointers. Never
code rules, slices, milestones or future plans.
