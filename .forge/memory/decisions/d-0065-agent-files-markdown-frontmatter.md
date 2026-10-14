---
id: d-0065
kind: decision
statement: Agent role definitions are Markdown files with a YAML frontmatter header under `.forge/agents/<name>.md` — settings (name, kind, harness, model, tools, output, budget …) in the frontmatter, the role's instructions as readable prose in the body. Same shape as SKILL.md and the harnesses' own subagent files, so one canonical file can later be rendered into each harness's native format. Validated by a core zod schema at load.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q1: user chose 'Markdown + frontmatter (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [agents, config, x-0011]
pinned: false
---

Rejected: pure YAML (long prompts hard to edit as a YAML string); agents only
in the Settings UI / database (no git history or review, against d-0008).
