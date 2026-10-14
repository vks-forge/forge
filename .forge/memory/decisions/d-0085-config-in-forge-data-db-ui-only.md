---
id: d-0085
kind: decision
statement: Forge's settings, agent definitions, pipelines and skills live in Forge's own data folder (e.g. `%ProgramData%\Forge` or `~/.forge-home`), stored in Forge's database and edited only through the UI - never as files in customer repos. Two levels - company defaults (agents, pipelines, models, budgets, notifications, skills) and per-project overrides of any setting. Every change is an immutable numbered version with who/when/why, which runs record and which replay/canary (d-0075) use. Config sits outside every worktree, so Workers cannot reach it; file signing / tier C for config files is dropped. Later - UI export/import of a project's config as files (backup, review, share between installs). Agents keep the settings + prose-instructions shape of d-0065 as a form with a rich-text instructions field. The engine still reads definitions through one source port over the core zod schemas.
source: { type: chat, ref: "2026-10-14 grill product shape Q3: user replied \"ok\" to the recommendation 'option 2 now (DB + UI-only, company defaults + per-project overrides), export/import from option 3 later'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: [d-0008, d-0065, d-0068]
tags: [config, agents, pipelines, skills, settings, ui, database, governance, x-0011]
pinned: true
---

Supersedes the file stage of d-0068 (its DB + UI-only end state becomes the
starting point; ACL/admin-only stays deferred per d-0082), d-0065 (agent files
as Markdown) and d-0008 (skills and agents as files in git). d-0078's
`.forge/skills/` path becomes the Forge data folder; harness drivers still
render skills into each harness's native layout at dispatch.
Project memory location (d-0007/d-0044) is decided separately.
