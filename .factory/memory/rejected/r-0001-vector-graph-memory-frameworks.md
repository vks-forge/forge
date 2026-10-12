---
id: r-0001
kind: rejected
statement: Use a vector or graph memory framework (mem0, Zep/Graphiti, LangMem, Cognee, A-MEM) as the Director's memory backend.
source: { type: chat, ref: 2026-10-12 memory research synthesis, accepted by user }
author: user
origin: owner
status: active
valid_from: 2026-10-12
tags: [memory]
---
Reason: chat-recall benchmarks disagree (full-context wins LoCoMo, graph wins
LongMemEval); the coding-specific benchmark (VibeMemBench) shows 11/12
memory systems below the memory-off baseline; Letta's own test shows plain
files + grep at 74% LoCoMo. Git gives diff/review for free. Revisit only if
the §11 evals in `memory-system.md` show retrieval misses on >5% of tickets.
