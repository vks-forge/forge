---
id: d-0052
kind: decision
statement: Layering has two inner rings. `@forge/core` (types, ports, schemas, state machine) imports nothing; `@forge/tools` (admit, floors, grants, receipts, tokenizer) is the pure policy ring and imports core only. Adapter packages (db, drivers, hooks, mcp, gates, memory) may import core and tools, never each other. Standalone processes (MCP stdio server, CLI) get entries under `apps/<name>/src/main.ts` that compose adapters; e.g. the Forge MCP server's SQLite wiring moves to `apps/mcp`, which injects a StorageAdapter into `@forge/mcp`.
source: { type: chat, ref: "2026-10-13 user chose 'Tools = inner policy' when hooks imported @forge/tools and mcp imported @forge/db" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, layering, architecture]
pinned: true
---

Amends code.md rule 1 (was: adapters depend on core only, tools listed as an
adapter). Rejected: moving admit/receipts into core (large move, bloats core);
named exceptions per package (weakens the rule).
