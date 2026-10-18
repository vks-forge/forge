---
id: x-0013
kind: decision
statement: Move memory (decisions, rejected, proposals, outcomes) from markdown files into the Forge database with retrieval - exact lookup (id, tag, status, scope) and relevance search (full-text first, e.g. SQLite FTS5 with ranking; semantic/embedding search only if research shows FTS is not enough) - so an agent loads a small relevant slice per task instead of every file each session. Records keep the same schema, provenance and append-only rules (never edit statement/source, supersede instead); export to markdown stays possible for review and the repo mirror (d-0086). Agents read memory through tools (search, get, related) rather than having it pasted in. Applies to project memory in the product and, as a dev-tooling step, to this repo's own `.forge/memory` session loading.
source: { type: chat, ref: "2026-10-14: user \"also add in propsal for moving moemory to database with proper functionlity to find relative or exact memories etc(need research), i need this beacuse loading all memory file per session is conting me too much content.\"" }
author: director
origin: user-requested
status: active
confidence: 0.7
valid_from: 2026-10-14
approved_at: 2026-10-18
approved_source: { type: chat, ref: "2026-10-18: user \"approved\" after the x-0013 summary" }
amends: [d-0007, d-0086]
reopens: [r-0001]
tags: [memory, database, search, retrieval, cost, research]
---

Reopens part of r-0001 (vector / graph memory frameworks such as mem0, Zep,
LangMem rejected for Director memory). Reason to reopen: loading every memory
file per session costs too much context. Distinction to keep: a retrieval index
over our own records in our own DB is not adopting an external memory
framework; embeddings would be the part r-0001 actually rejected. Amends d-0007
(git-backed markdown) and d-0086 (private git repo per project) if approved -
the git history could stay as the audit log or be replaced by DB version rows.

Research needed (hyperresearch / SearXNG): FTS5 vs embeddings recall on short
decision records; hybrid retrieval; how Claude Code / Cursor / Letta / mem0
scope memory per task; token cost measurements; keeping provenance and
contradiction detection. Quick interim fix possible now: session start reads
only MEMORY.md (one line per record) and opens full records on demand.
