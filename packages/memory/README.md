# @forge/memory

Reader and writer for the Director's per-project memory under `.forge/memory/`. Not implemented yet; this package has only a `package.json`.

## Why it exists

The Director plans every epic from scratch unless it remembers, per project, the decisions the user gave, the approaches already rejected and why, and what happened to past tickets. Workers are ephemeral and must not carry memory between tickets, so memory belongs to the Director. It also has to be safe against an agent writing something wrong once and reading it forever. This package is the code boundary for that memory: the single gated writer, the read paths that put a relevant slice into a Worker's context, and the checks that keep unapproved inferences out of the authoritative set. Design: `docs/design/memory-system.md`.

## What it does

Intended role, from the design (none of it exists yet):

- Reads the markdown record folders: `decisions/` (`status: active` are constraints), `rejected/`, `proposed/` (pending, never loaded as constraints), `outcomes/YYYY-MM/` (append-only), with `MEMORY.md` as a pointer index of at most 200 lines.
- Validates records against the schema (ids sequential per folder, `author`, `origin`, `source`, `status`, `supersedes`) and writes them as the Director only: user statements become `decisions/`, user rejections `rejected/`, inferences `proposed/` with `confidence <= 0.8`.
- Rebuilds a SQLite index from the files at any time; the index is a cache, markdown is truth.
- Selects a memory slice for intake and for Worker dispatch.
- Supports a propose-only janitor (dedupe, contradiction flags, index rebuild) that outputs a diff and never applies changes silently.

Public API: none yet.

## Why this approach

- Git-backed markdown per project, SQLite as a rebuildable index, one gated writer, Workers read-only, event-triggered propose-only janitor (d-0007). Git gives diff, blame, revert and human review for free, which is the approval workflow memory writes need.
- Rejected: vector and graph memory frameworks such as mem0, Zep, LangMem (r-0001); an always-on memory janitor agent (r-0002); a long-lived LLM session as the orchestrator (r-0003).
- Records are never edited or deleted; a change is a new record with `supersedes`. Provenance (`author`, `origin`) guards against taint.
- Dependencies: none yet.

## Requirements

- Node 24.20 and pnpm. Nothing is required today: no source, no tests, no env vars.
- Intended files: `.forge/memory/` (the factory repo today; per-project `.forge/memory/<slug>/` as its own git repo is planned, with the project slug `forge` per x-0010). Runtime index directories under it are gitignored.
- Build and test follow the root scripts once source exists.

## Extending

Follow the standard package skeleton (`src/index.ts`, `schemas/`, `types/`, `domain/`, `adapters/`, `__tests__/` mirroring `src/`). Record types come from zod schemas. A new storage or index backend would be a new folder under `adapters/` behind one interface with a contract test.

## Limits

- Not implemented yet: no source, no API, no tests, no index, no janitor.
- Memory is currently maintained by hand under `.forge/memory/` following `CLAUDE.md`.
- `none yet` for dependencies, env vars and configuration.
