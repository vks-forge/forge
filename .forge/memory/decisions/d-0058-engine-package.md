---
id: d-0058
kind: decision
statement: The Director engine (tick reconcile → refresh → dispatch, wake requests and re-wake cap, settle, invariant check, and the DirectorLLM step runners triage / dispatch_prompt / steer_reply) lives in a new package `@forge/engine` in the inner ring beside `@forge/tools`. It is pure orchestration over ports (StorageAdapter, WorkerDriver, DirectorLLM, ReceiptLog, GitHost, Clock), imports `@forge/core` and `@forge/tools` only, and never opens a DB, spawns a process or reads env. `apps/server` composes adapters into it and owns HTTP/SSE.
source: { type: chat, ref: "2026-10-13 user chose 'New @forge/engine (Rec.)' for the engine home" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [layering, engine, director, architecture]
pinned: true
---

Amends code.md rule 1 (adds `engine` to the inner ring). Rejected: engine
logic in `apps/server` (breaks "apps compose only"); engine in `core` (core
stays types + pure rules).
