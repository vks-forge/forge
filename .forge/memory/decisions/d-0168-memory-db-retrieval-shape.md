---
id: d-0168
kind: decision
statement: Memory in the database (x-0013) is built as - (1) retrieval by full-text search plus explicit links and tags, with the Director first rewriting a question into 2-4 key terms and synonyms (one cheap model call); local vector embeddings only later if logged searches still miss; (2) Workers get read-only memory tools (search, get, related) over their project's active decisions and rejected approaches, the Director stays the only writer; (3) each project's existing memory git repo is imported into the database once and then deleted; (4) this repo's own `.forge/memory/` markdown stays in git but gets a local index and a `forge memory search/get/related` CLI that development sessions use instead of opening files, sharing the product's search code.
source: { type: chat, ref: "2026-10-18 user answers to the memory-in-DB questions: 'Keywords + AI rewrite (Recommended)'; 'Read-only for Workers (Recommended)'; 'Import, then delete'; 'Yes, search tool for it (Recommended)'; earlier: \"need functionality for AI like find relative memory etc\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-18
superseded_by: null
supersedes: null
amends: [x-0013, d-0086, d-0007]
tags: [memory, database, search, retrieval, workers, migration]
pinned: false
---

Delete is done only after the import is verified (record count and content
match per project) and the git repo is kept in the data-folder backup taken
before the migration (d-0098), so the old history is recoverable from that
backup. Research: `docs/briefs/memory-db-research.md`.
