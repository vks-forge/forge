# @forge/memory

Project memory for the Director and the Workers: records in the database behind one write door, a full-text index with an access log, the one-time import (and removal) of the old per-project git repositories, a markdown export, and the old git-backed adapter kept for projects not yet imported.

## Why it exists

The Director plans every card against what the owner decided and what they ruled out, and Workers must not contradict it, yet pasting every record into every prompt grows without bound. Memory therefore lives in the database (d-0168, x-0013): one door writes it (so an inference can never pass as an owner decision), triggers keep it append-only, and an index answers "which few records matter for this" for the Director, the Worker tools, the owner's screen and the CLI. Earlier versions kept each project's memory as markdown in a private git repository (d-0086). Without this package the engine would read files itself and the repositories could never be moved safely. Design: `docs/design/memory-system.md`, brief `docs/briefs/s7-memory-db.md`.

## What it does

Public API (`src/index.ts`; ports are in `@forge/core`):

- `createSqlProjectMemory({ storage, now })` is the `ProjectMemory`: `propose`, `decide`, `approve`, `reject`, `supersede`, `appendOutcome`, `reader.list/get`. One transaction per write stores the record, tags, typed links (`amends`, `reopens`, `cites`, `card`, `ticket`; `supersedes` is added by `supersede`), the history entry and the index entry. `commit` in a result is the history entry's sequence number as a string. Same errors, ids, `pinned` default and confidence cap (0.8) as the git adapter; both pass `__tests__/helpers/writer-behaviour.ts`.
- `createSqlMemoryIndex({ storage, now })` is the `MemoryIndex`: `search` (scope, terms or key words from the question, all-words then any-word, tag hints, one hop of links, reciprocal rank fusion, pinned boost, a replaced decision answered by its successor, cut to `k` and 2,500 characters), `get` (body cut at 4,000), `related` (links both ways, rare shared tags, similar text; at most 5 entries, 1,200 characters), `list`, `digest`, `rejected` (all, never ranked away), `pinned`, `decisions`, `history`. Every search, get and related call writes one access-log row. `pruneAccessLog` keeps 20,000 rows and 90 days per project.
- `createMemoryImporter({ storage, rootDir, now })` reads a project's repository at its last commit and stores every record, even those whose YAML strict parsing rejects (`domain/lenient-record.ts`, `lenient-header.ts`: statement byte for byte, fields that parse kept, missing fields filled fail-closed and listed in `lenient_fields`, the original header kept). `import` records an attempt and verifies it (every file a record or a listed reject, statements byte-equal, body hash and tags equal, counts per kind and status); `verify` repeats it; `deleteRepo` removes the folder only for a verified attempt when HEAD still equals the recorded commit, the folder is the project's own repository inside `rootDir` and nothing is uncommitted. `importStatusOf`, `hasRepo`, `repoDirOf` are helpers.
- `createMarkdownExporter({ storage, now })`: `render(project)` and `exportTo(project, dir)` write the old layout with the existing codec, plus a generated `MEMORY.md` (at most 200 lines); the same rows give the same bytes.
- `scanMarkdown(dir, manifest)`, `loadMarkdownInto(storage, dir, project, now)`, `readMarkdownFiles(dir)`: the local index of a plain markdown folder (this repository's own `.forge/memory`), with a size/time/hash manifest. The CLI builds a new index file when anything changed.
- `createRoutedMemory({ db, dbIndex, files, fileSource, stateOf })` chooses the database or the old repository per project on every call, and gives a file-backed project an index answered from the files' active slice.
- `createProjectMemory`, `createFileMemorySource`, `MemoryRecordFrontMatter`: the git-backed writer, reader and slice (one commit per write, crash repair, committed-only reads); unchanged from earlier versions and used for a project until its import is verified.

## Why this approach

- SQLite FTS5 over our own rows (porter stemming; statement weighted above gist, aliases, tags and body) with filters, links and rank fusion, no vectors and no embedder: r-0001 is reopened only for an index over our own rows, and the access log is the measure that decides a later vector slice.
- Every term is quoted by core `buildMatch` and scope is a SQL condition on the record row, so no query text reaches the FTS syntax and a Worker can never see a proposal, an outcome or a superseded record. Rejected approaches are fetched whole, never ranked away (d-0141 item 6).
- A lenient parser, not a repair of the 36 files: the importer must not change a record, and records stay untouched on disk (the owner's call 9). It reads the header block by block with `yaml` alone and keeps the raw text of a block that does not parse.
- Import, verify, then delete in that order, with a backup first (made by the server): a project that fails its proof stays on its repository, writable, and is retried; nothing is deleted on any doubt.
- This package imports `@forge/core` only and receives a `StorageAdapter`; the SQL lives in `@forge/db` behind `tx.memory`. `yaml` parses and writes headers (flow maps, quotes and colons must round-trip), `zod` validates at every boundary, `git` runs through `execFile` with a fixed identity and a scrubbed environment.

## Requirements

- Node 24.20, pnpm; runtime deps `@forge/core`, `yaml` 2.9.1, `zod` 4.6.7; dev dep `@forge/db` (test storage). `git` on PATH for the importer and the git adapter. No env vars, no external services.
- Files: `<dataHome>/memory/<slug>/` (old repositories only), exports under `<dataHome>/exports/`. The caller supplies paths; this package never reads env.
- Tests: `pnpm vitest run --project heavy packages/memory` (real git in temp folders; slow on Windows, run with few workers). Importer tests copy this repository's own `.forge/memory`.

## Extending

A new retrieval step is a pure function in `@forge/core/domain/memory-search` plus one list fed to `rrf` in `adapters/sql-memory-index/search.ts`. A new write is a planner in `domain/row-plans.ts` and a call through `tx.memory` (only `@forge/db`'s records repository ever updates a row; `__tests__/adapters/memory-write-door.test.ts` scans for any other writer). A new import source is a reader producing `SourceFile`s for `planImport`.

## Limits

- Vectors and embeddings are a later gated slice (S7+); the gate is the access log showing lexical misses. No janitor, no `playbook/`, no repository mirror (d-0086), no daily backup system (d-0098: only the server's one-shot pre-migration backup).
- A project still on its repository answers searches with a plain keyword filter over its active slice, with no links, history or pinned flag. `MemorySource` and the git adapter stay for it and go in a later slice.
- Stored words never change: to change a decision, supersede it. Imported rejected approaches are stored as `rejected` whether the file said `active` or `rejected`; a decision with no status is stored `pending` (not in force) and listed as filled in.
- Records of the markdown index are rebuilt, not updated, when a file changes. The CLI does no query rewrite: the caller supplies key words.
