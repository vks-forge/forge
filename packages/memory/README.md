# @forge/memory

Project memory for the Director: markdown records in a private git repository per project in the data home, a Director-only writer, and a read-only `MemorySource` for the engine. The janitor is still to come.

## Why it exists

The Director plans every epic from scratch unless it remembers, per project, the decisions the user gave, the approaches already rejected and why, and what happened to past tickets. Workers are ephemeral and must not carry memory between tickets, so memory belongs to the Director. It also has to be safe against an agent writing something wrong once and reading it forever. This package is the code boundary for that memory: the read path that puts the active constraints into triage and Worker prompts, and the single gated writer that keeps unapproved inferences out of the authoritative set. Each project's memory is a private git repository in `<dataHome>/memory/<slug>/` (d-0086); the Worker floor denies the data home by absolute path, so a Worker has no route to it. Without this package the engine would either read markdown itself or plan against superseded decisions. Design: `docs/design/memory-system.md`.

## What it does

Public API (from `src/index.ts`):

- `createProjectMemory({ rootDir, now, onSkip? })` returns a `ProjectMemory` (port from `@forge/core`): `init(slug)`, `reader` and `writer`. `rootDir` is `<dataHome>/memory`.
  - `init(slug)` makes `<rootDir>/<slug>/` a git repository (`git init -b main`, `MEMORY.md`, one commit "memory: initialise repository"). It is idempotent and also runs before the first write, so projects registered before memory lived here get theirs.
  - Writer: every call is one commit by "Forge Director <forge@localhost>" whose subject names the record, and returns `{ id, commit }`.
    - `propose` writes `proposed/x-NNNN-*.md` (status `pending`, author `director`, confidence at most 0.8).
    - `decide` writes `decisions/d-NNNN-*.md` (status `active`, author `user`, pinned by default).
    - `approve(slug, id, by)` moves a pending proposal to `decisions/`, keeping its id and adding `approved_at` and `approved_by`.
    - `reject(slug, id, reason, by)` moves it to `rejected/` with `rejected_reason`, `rejected_by`, `rejected_at`.
    - `supersede(slug, oldId, input)` writes a new decision with `supersedes` and marks the old one `superseded` (with `superseded_by` and `valid_to`) in place.
    - `appendOutcome(slug, text)` writes `outcomes/YYYY-MM/o-NNNN-*.md`.
  - `statement`, `source`, `author` and `origin` are never edited: state moves are pure functions that only set status fields. Answering a proposal that is not pending, superseding something that is not an active decision, or naming an unknown id throws `MemoryRecordStateError` or `MemoryRecordNotFoundError` and commits nothing.
  - Ids are sequential per letter (`x`, `d`, `o`) over the whole repository, so an id is never reused after a proposal moves folder. `MEMORY.md` is rebuilt on every write (decisions, rejected, pending, a count of superseded, outcomes newest first) and stays within 200 lines by archiving the oldest outcome pointers; decisions are never dropped from it.
  - Writes to one project run one at a time; each file is written to a temp file under `.git/` and renamed over its target.
  - `reader.list(slug)` returns pending proposals, then decisions, then rejected, as `{ id, kind, status, statement, tags }`; `reader.get(slug, id)` returns the record with its `body`. Reading never creates a repository; an unknown project reads as empty.
- `createFileMemorySource(rootDir, deps?)` returns a `MemorySource` (port from `@forge/core`). `slice(projectSlug)` reads `<rootDir>/<slug>/decisions/*.md` and `<rootDir>/<slug>/rejected/*.md` and returns `{ decisions, rejected }` as `{ id, statement }` lists sorted by id.
  - Decisions count only with `status: active`. Rejected records count with `status` absent, `active` or `rejected`. Superseded records are dropped.
  - `proposed/`, `outcomes/` and `MEMORY.md` are never read, so unapproved inferences cannot become constraints.
  - Fails closed: a file with no front matter, bad YAML, a bad id or an empty statement is skipped and reported through the optional `deps.onSkip(path, reason)`; nothing throws.
  - An unknown project, a missing folder, or a slug that is not `[a-z][a-z0-9-]*` (path traversal guard) gives an empty slice; a bad slug is also reported through `onSkip`.
- `MemoryRecordFrontMatter`: the loose zod schema the reader applies to a header (`id` like `d-0001`, non-empty `statement`, optional `status`; other fields pass through). The full record schema (`MemoryRecord`) and the writer inputs live in `@forge/core`.

Front matter is the YAML block between `---` fences; BOM and CRLF are tolerated.

## Why this approach

- Git-backed markdown per project, SQLite as a rebuildable index, one gated writer, Workers read-only, event-triggered propose-only janitor (d-0007). Git gives diff, blame, revert and human review for free, which is the approval workflow memory writes need. The repository lives in the data home, not in the user's repo (d-0086, d-0098).
- Rejected: vector and graph memory frameworks such as mem0, Zep, LangMem (r-0001); an always-on memory janitor agent (r-0002); a long-lived LLM session as the orchestrator (r-0003).
- Records are never edited or deleted; a change is a state move or a new record with `supersedes`. Provenance (`author`, `origin`) guards against taint.
- `yaml` parses and writes the front matter: the records use flow mappings and lists, which a hand-rolled parser would get wrong, and statements with colons, quotes or line breaks must round-trip. Field order is fixed so a status change is a two-line diff. If strict YAML fails on a hand-written file, a line-based pass recovers only `id`, `statement` and `status` for the reader, and still refuses files whose values start with structured YAML.
- `zod` validates each header at the file boundary (code rule 4). The reader enforces only `id`, `statement` and `status`, so a hand-edited record still loads; the writer reads records back with the full `MemoryRecord` schema.
- `git` runs through `execFile` with no shell, a fixed Director identity and a clean environment (no inherited `GIT_DIR`, no signing): a user's global git config cannot change or break a memory commit. Rejected: a git library (a native or WASM dependency with Windows caveats for five commands) and no git at all (loses diff, blame and revert, which are the owner's review tools).
- IO is confined to `adapters/` and `shared/`; planning (`domain/memory-plans.ts`), state moves, ids, the index and the file codec in `domain/` are pure.

## Requirements

- Node 24.20 and pnpm. Runtime dependencies: `@forge/core`, `yaml` 2.9.1, `zod` 4.6.7.
- `git` on PATH (the writer shells out to it; `init` throws a `CrashError` naming git when it is missing).
- Files: `<rootDir>/<slug>/{decisions,rejected,proposed}/*.md`, `outcomes/YYYY-MM/*.md`, `MEMORY.md`. The caller chooses `rootDir` (an app composition root; this package never reads env). The server passes `<dataHome>/memory`.
- No env vars, no native binaries beyond git, no external services.
- Tests: `pnpm vitest run packages/memory`. The adapter tests run real git in a temp folder; the concurrency test makes many commits and takes tens of seconds on Windows.

## Extending

Follow the standard package skeleton (`src/index.ts`, `schemas/`, `types/`, `domain/`, `adapters/`, `__tests__/` mirroring `src/`). A different store (for example the SQLite index) is a new folder under `adapters/` returning a `MemorySource` or a `ProjectMemory`. A new kind of write is a pure planner in `domain/memory-plans.ts` (records in, `PlannedChange` out) plus one line in the writer; keep state moves in `domain/transitions.ts` so the immutable fields stay untouchable.

## Limits

- No SQLite index and no janitor yet; `MEMORY.md` is the only index, rebuilt from the files on each write (every write reads the whole project folder, fine for hundreds of records).
- The engine slice does not read `proposed/` or `outcomes/` and does not follow `supersedes` links; it trusts each record `status`.
- The opt-in mirror of decisions to the user's repository (a PR copying them to a chosen path, one-way, default off; d-0086) is deferred and not built.
- A crash after the files are written but before the commit leaves an uncommitted change; the next write's `git add -A` commits it with that write. A crash between writing the new file and deleting the old one in an approve or reject leaves the id in both folders until someone removes one by hand.
- Owner-authored `decide` and `supersede` have no API route yet; the Director calls them once the chat flow exists.
- Records that fail the schema are skipped and reported through `onSkip`, never repaired; the writer refuses to move or supersede one.
- Lenient parsing recovers only `id`, `statement` and `status`, single-line; multi-line statements need valid YAML.
- This repository's own `.forge/memory/` is the dev team's memory and is not read by the product.
- Files are read on every call; there is no cache.
