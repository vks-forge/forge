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
  - Every write starts with a repair step. If `git status` shows leftovers from a write that died, a move whose new file landed while the proposal copy still exists is completed (destination kept, proposal removed, commit "recover: complete <id>"); anything else is reset to the last commit (`reset --hard` plus `clean -fd`), so the next commit holds only its own change. A repository with no commit yet (died between `git init` and the first commit) is finished. An id found in two files is a `MemoryIntegrityError` (family `crash`) naming both paths.
  - `reader.list(slug)` returns pending proposals, then decisions, then rejected, as `{ id, kind, status, statement, tags }`; `reader.get(slug, id)` returns the record with its `body`. Both read the last commit, not the working tree. Reading never creates a repository; an unknown project reads as empty.
- `createFileMemorySource(rootDir, deps?)` returns a `MemorySource` (port from `@forge/core`). `slice(projectSlug)` reads the last commit of `<rootDir>/<slug>/` (one `git ls-tree -r HEAD` and one `git cat-file --batch`), files under `decisions/` and `rejected/`, and returns `{ decisions, rejected }` as `{ id, statement }` lists sorted by id.
  - Decisions count only with `status: active`. Rejected records count with `status` absent, `active` or `rejected`. Superseded records are dropped.
  - `proposed/`, `outcomes/` and `MEMORY.md` are never read, so unapproved inferences cannot become constraints.
  - Committed content only: a write in flight (an old decision already marked superseded, its successor not yet written) never shows a tick a torn state. A folder that is not a git repository, or whose git cannot be read, gives an empty slice and an `onSkip` report.
  - Fails closed: a file with no front matter, bad YAML, a bad id or an empty statement is skipped and reported through the optional `deps.onSkip(path, reason)`; nothing throws.
  - An unknown project, a missing folder, or a slug that is not `[a-z][a-z0-9-]*` (path traversal guard) gives an empty slice; a bad slug is also reported through `onSkip`.
- `MemoryRecordFrontMatter`: the loose zod schema the reader applies to a header (`id` like `d-0001`, non-empty `statement`, optional `status`; other fields pass through). The full record schema (`MemoryRecord`) and the writer inputs live in `@forge/core`.

Front matter is the YAML block between `---` fences; BOM and CRLF are tolerated.

- **Agent memory view (S5a).** `slice(slug, filter?)` takes an optional `{ tags, include_rejected }`: records carry their `tags` from the front matter (a malformed `tags` reads as none), an empty tag list is the whole slice (what every Worker saw before agents), a record with no tags shows only then, and rejected approaches are dropped unless asked for.

## Why this approach

- Git-backed markdown per project, SQLite as a rebuildable index, one gated writer, Workers read-only, event-triggered propose-only janitor (d-0007). Git gives diff, blame, revert and human review for free, which is the approval workflow memory writes need. The repository lives in the data home, not in the user's repo (d-0086, d-0098).
- Rejected: vector and graph memory frameworks such as mem0, Zep, LangMem (r-0001); an always-on memory janitor agent (r-0002); a long-lived LLM session as the orchestrator (r-0003).
- Records are never edited or deleted; a change is a state move or a new record with `supersedes`. Provenance (`author`, `origin`) guards against taint.
- `yaml` parses and writes the front matter: the records use flow mappings and lists, which a hand-rolled parser would get wrong, and statements with colons, quotes or line breaks must round-trip. Field order is fixed so a status change is a two-line diff. If strict YAML fails on a hand-written file, a line-based pass recovers only `id`, `statement` and `status` for the reader, and still refuses files whose values start with structured YAML.
- `zod` validates each header at the file boundary (code rule 4). The reader enforces only `id`, `statement` and `status`, so a hand-edited record still loads; the writer reads records back with the full `MemoryRecord` schema.
- `git` runs through `execFile` with no shell, a fixed Director identity and an allow-listed environment (only `PATH`, `SystemRoot`, `TEMP` and similar; `HOME` points at an empty folder; `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` an empty file, `GIT_TERMINAL_PROMPT=0`). Each call also pins `core.hooksPath` to an empty folder, `core.fsmonitor=false`, `core.untrackedCache=false`, `protocol.allow=never`, an empty `credential.helper`, and `git init` uses an empty `--template`. The daemon therefore never executes a program named in the owner's global git setup (hooks, fsmonitor, template hooks). The `GIT_*` names to keep out are the ones the tools package lists as `RISKY_GIT_ENV`; the list is copied in `shared/git.ts`, not imported. Rejected: a git library (a native or WASM dependency with Windows caveats for five commands) and no git at all (loses diff, blame and revert, which are the owner's review tools).
- IO is confined to `adapters/` and `shared/`; planning (`domain/memory-plans.ts`), state moves, ids, the index and the file codec in `domain/` are pure.

## Requirements

- Node 24.20 and pnpm. Runtime dependencies: `@forge/core`, `yaml` 2.9.1, `zod` 4.6.7.
- `git` on PATH (the writer and the engine reader shell out to it; `init` throws a `CrashError` naming git when it is missing).
- Files: `<rootDir>/<slug>/{decisions,rejected,proposed}/*.md`, `outcomes/YYYY-MM/*.md`, `MEMORY.md`. Beside the projects, `<rootDir>/.forge-git/` holds the empty hooks, template and home folders and the empty global config git runs with; it is created on first use and never read as a project. The caller chooses `rootDir` (an app composition root; this package never reads env). The server passes `<dataHome>/memory`.
- No env vars, no native binaries beyond git, no external services.
- Tests: `pnpm vitest run packages/memory`. The adapter tests run real git in a temp folder; the concurrency test makes many commits and takes tens of seconds on Windows.

## Extending

Follow the standard package skeleton (`src/index.ts`, `schemas/`, `types/`, `domain/`, `adapters/`, `__tests__/` mirroring `src/`). A different store (for example the SQLite index) is a new folder under `adapters/` returning a `MemorySource` or a `ProjectMemory`. A new kind of write is a pure planner in `domain/memory-plans.ts` (records in, `PlannedChange` out) plus one line in the writer; keep state moves in `domain/transitions.ts` so the immutable fields stay untouchable.

## Limits

- No SQLite index and no janitor yet; `MEMORY.md` is the only index, rebuilt from the files on each write (every write reads the whole project folder, fine for hundreds of records).
- The engine slice does not read `proposed/` or `outcomes/` and does not follow `supersedes` links; it trusts each record `status`.
- The opt-in mirror of decisions to the user's repository (a PR copying them to a chosen path, one-way, default off; d-0086) is deferred and not built.
- A crash mid-write is repaired by the next write, not at startup, and the repair discards uncommitted edits in the memory repository: do not hand-edit a project's memory folder without committing. A write that dies before its commit is lost, and its caller never saw a result.
- Owner-authored `decide` and `supersede` have no API route yet. Nothing calls the Director writer yet either (only `memory.slice` is used by the engine); the Director's write calls arrive with the Director steps work.
- Records that fail the schema are skipped and reported through `onSkip`, never repaired; the writer refuses to move or supersede one.
- Lenient parsing recovers only `id`, `statement` and `status`, single-line; multi-line statements need valid YAML.
- This repository's own `.forge/memory/` is the dev team's memory and is not read by the product.
- Files are read on every call; there is no cache.
