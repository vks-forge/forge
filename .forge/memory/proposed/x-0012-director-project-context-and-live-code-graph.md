---
id: x-0012
kind: proposal
statement: Give the card Director a persistent, queryable project context - an index over all cards, tickets, runs, gate results, PRs, memory records and conversation summaries, plus a code graph of the repo (symbols, files, call edges) that updates incrementally as tickets merge and as the main branch moves. The Director reads it through tools (search, get, graph queries) instead of having everything pasted into its prompt; card chats keep rolling summaries so long conversations stay within context.
source: { type: chat, ref: "2026-10-14 card grill: user \"need system to save context here, we might need a code graph here also thats keepupdating in realtime etc\"" }
author: director
origin: inferred
status: pending
confidence: 0.6
valid_from: 2026-10-14
tags: [director, context, code-graph, memory, cards]
---

To grill: build vs reuse (this repo already uses a code-graph tool, graft, in
development), incremental update trigger (on merge / on file change), per-
language support (d-0095 any language), storage (Forge data folder), cost,
and whether Workers get read access too. r-0001 rejects vector/graph MEMORY
frameworks for Director memory - this is a code/project index, not memory;
name that distinction when deciding.
