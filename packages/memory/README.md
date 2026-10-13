# @forge/memory

File-backed project memory for the Director. Today it provides a read-only `MemorySource`; the gated writer, index and janitor are still to come.

## Why it exists

The Director plans every epic from scratch unless it remembers, per project, the decisions the user gave, the approaches already rejected and why, and what happened to past tickets. Workers are ephemeral and must not carry memory between tickets, so memory belongs to the Director. It also has to be safe against an agent writing something wrong once and reading it forever. This package is the code boundary for that memory: the read path that puts the active constraints into triage and Worker prompts today, and in future the single gated writer and the checks that keep unapproved inferences out of the authoritative set. Without it the engine would either read markdown itself or plan against superseded decisions. Design: `docs/design/memory-system.md`.

## What it does

Public API (from `src/index.ts`):

- `createFileMemorySource(rootDir, deps?)` returns a `MemorySource` (port from `@forge/core`). `slice(projectSlug)` reads `<rootDir>/<slug>/decisions/*.md` and `<rootDir>/<slug>/rejected/*.md` and returns `{ decisions, rejected }` as `{ id, statement }` lists sorted by id.
- Decisions count only with `status: active`. Rejected records count with `status` absent, `active` or `rejected`. Superseded records are dropped.
- `proposed/`, `outcomes/` and `MEMORY.md` are never read, so unapproved inferences cannot become constraints.
- Fails closed: a file with no front matter, bad YAML, a bad id or an empty statement is skipped and reported through the optional `deps.onSkip(path, reason)`; nothing throws.
- An unknown project, a missing folder, or a slug that is not `[a-z][a-z0-9-]*` (path traversal guard) gives an empty slice; a bad slug is also reported through `onSkip`.
- `MemoryRecordFrontMatter`: the zod schema for the minimum header (`id` like `d-0001`, non-empty `statement`, optional `status`; other fields pass through).

Front matter is the YAML block between `---` fences; BOM and CRLF are tolerated and the markdown body is ignored.

## Why this approach

- Git-backed markdown per project, SQLite as a rebuildable index, one gated writer, Workers read-only, event-triggered propose-only janitor (d-0007). Git gives diff, blame, revert and human review for free, which is the approval workflow memory writes need.
- Rejected: vector and graph memory frameworks such as mem0, Zep, LangMem (r-0001); an always-on memory janitor agent (r-0002); a long-lived LLM session as the orchestrator (r-0003).
- Records are never edited or deleted; a change is a new record with `supersedes`. Provenance (`author`, `origin`) guards against taint.
- `yaml` parses the front matter: the records use flow mappings (`source: { type: chat, ref: ... }`) and lists, which a hand-rolled parser would get wrong. If strict YAML fails (hand-written statements often hold an unquoted colon or backtick), a line-based pass recovers only `id`, `statement` and `status`, and still refuses files whose values start with structured YAML.
- `zod` validates each header at the file boundary (code rules 4); only `id`, `statement` and `status` are enforced so the future writer can add fields freely.
- Only `node:fs/promises` and `node:path` for IO, confined to `adapters/`; parsing in `domain/` is pure.

## Requirements

- Node 24.20 and pnpm. Runtime dependencies: `@forge/core`, `yaml` 2.9.1, `zod` 4.6.7.
- Files: `<rootDir>/<slug>/{decisions,rejected}/*.md`. The caller chooses `rootDir` (an app composition root; this package never reads env).
- No env vars, no native binaries, no external services.
- Tests: `pnpm vitest run packages/memory`. One test reads the real `.forge/memory` of this repo to pin that every record parses.

## Extending

Follow the standard package skeleton (`src/index.ts`, `schemas/`, `types/`, `domain/`, `adapters/`, `__tests__/` mirroring `src/`). A different store (for example the SQLite index) is a new folder under `adapters/` returning a `MemorySource`. The gated writer, once built, belongs here as its own module behind a port in `@forge/core`; it must write only `decisions/`, `rejected/` and `proposed/` records per `memory-system.md`.

## Limits

- Read-only: no writer, no SQLite index, no janitor, no `MEMORY.md` handling. Memory is still maintained by hand following `CLAUDE.md`.
- Does not read `proposed/` or `outcomes/`, and does not follow `supersedes` links; it trusts each record `status`.
- Transitional layout: the factory repo keeps its own memory flat at `.forge/memory/decisions`. When `<rootDir>/<slug>/` does not exist but `<rootDir>/decisions/` does, that flat folder is used for any slug. Remove the fallback when memory moves to per-project folders (x-0010).
- Lenient parsing recovers only `id`, `statement` and `status`, single-line; multi-line statements need valid YAML.
- Files are read on every `slice()` call; there is no cache.
