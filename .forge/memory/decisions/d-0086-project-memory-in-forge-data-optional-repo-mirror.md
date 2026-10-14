---
id: d-0086
kind: decision
statement: Each managed project's memory (decisions, rejected, proposed, outcomes) lives in Forge's data folder as markdown in a private git repo per project - the source of truth, Director-only writer, never reachable by Workers. A per-project setting "Mirror memory to repo" (default off) opens a PR copying the decisions to a user-chosen repo path (e.g. `docs/decisions/`); the mirror is one-way out and never read back. Customer repos get no `.forge/` folder. This Forge source repo keeps its own `.forge/memory/` as the development team's memory, separate from the product.
source: { type: chat, ref: "2026-10-14 grill product shape Q4: user replied \"ok\" to the recommendation 'option 3: Forge data folder is source of truth, optional per-project mirror to repo, default off'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0007, d-0044]
tags: [memory, projects, multi-repo, git]
pinned: false
---

d-0007 keeps markdown + git-backed + Director-only writer + propose-only
janitor; only the git repo's location changes. d-0044's `.forge/` dir stays
the name for this repo's own config/memory and for Forge's data folder layout,
not a folder written into customer repos. Backup/export of the data folder is
needed (to be decided).
