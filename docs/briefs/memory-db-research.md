# Memory in the database: research and recommended design (x-0013)

Status: research brief, 2026-10-18. Nothing here is built.
## 1. Summary and recommendation

x-0013 is approved: project memory moves from markdown in git into Forge's SQLite database, and agents find
what they need through tools instead of loading every record. The owner wants agents to find related and
relevant memories, not only exact ids.

**Recommendation, in one screen:**

1. **Database is the source of truth**: append-only record tables, immutable columns protected by SQL
   triggers, status changes as event rows, supersede as "new row plus link".
2. **Search is SQLite FTS5 first** (porter + unicode61, bm25 column weights, prefix, snippet), plus filters
   (kind, status, tag, id) and an explicit link graph. FTS5, trigram and bm25 work in both `better-sqlite3`
   (Forge's actual driver) and `node:sqlite` (measured, 3.1). No new dependency.
3. **Embeddings are a gated second phase**, behind a port, brute-force cosine in JS (2.6 ms per query at
   5,000 vectors, measured), model `bge-small-en-v1.5` or `all-MiniLM-L6-v2` via transformers.js. No
   `sqlite-vec` (pre-v1, not needed). My smoke test: keyword queries find the target in the top 2 (7 of 7),
   natural-language paraphrases miss often (3 of 11 outside the top 10), so the gap is real but can first
   be narrowed with keywords and aliases. Build vectors only when logged agent queries show a lexical miss.
4. **Hybrid = reciprocal rank fusion** of FTS, vector and link lists, with pin and status boosts.
5. **"Related" is computed**: explicit links, rarity-weighted shared tags, FTS "more like this", later vector
   neighbours; at most 5 one-line entries with a reason label.
6. **Tools are two-step**: `memory_search` (one-line hits, about 500 tokens for 10), `memory_get` (full text,
   capped), `memory_related`, `memory_list`. Director through an engine port; Workers keep a pasted,
   smaller slice (opt-in read-only MCP tools later, owner decision).
7. **Token cost**: session start loads about 203 KB, about 51 thousand tokens (measured, 3.7); digest plus
   top-8 retrieval is about 1.6 to 1.8 thousand per task. A zero-code `MEMORY.md` trim helps this repo now.
8. **r-0001 stands**: it rejected external frameworks; a local embedder over our own rows is a retrieval
   feature. Its own trigger (misses on more than 5 percent of tickets) gates the vector phase.
9. **Migration**: lenient import (36 of this repo's records fail strict YAML), old git repos frozen as audit,
   markdown export on demand, optional mirror (d-0086).
10. **First slice**: migration 0029, importer, `MemoryIndex` port, Director calls use pinned plus top-k.

## 2. Current state

How memory works today, with pointers.

| Piece | Where | Notes |
|---|---|---|
| Record schema (zod) | `packages/core/src/schemas/memory-record.ts` | kinds `decision, rejected, proposal, outcome`; statuses `active, superseded, pending, rejected`; `author`, `origin`, `source`, `tags`, `pinned`, `confidence`, `supersedes`, `superseded_by`, `valid_to`. Loose object, so `amends` and `reopens` survive but are untyped. |
| Read port for the engine | `packages/core/src/types/ports/memory-source.types.ts` | `MemorySource.slice(slug, filter?)` returns all active decisions and rejected as `{id, statement, tags}`. No search, no related, no ids-only mode. |
| Writer and reader ports | `packages/core/src/types/ports/memory-store.types.ts` | `ProjectMemory` = `init`, `reader.list/get`, `writer.propose/decide/approve/reject/supersede/appendOutcome`. |
| File and git adapter | `packages/memory/src/adapters/git-project-memory/*.ts`, `file-memory-source.ts` | One commit per write, repair step, `git ls-tree` + `git cat-file` reads of the last commit, `MEMORY.md` rebuilt on every write. README says "no SQLite index yet". |
| Engine callers | `packages/engine/src/tick/triage.ts:54`, `planning-input.ts:107`, `dispatch-run.ts:144`, `card-chat-context.ts:137` | Every call takes the whole active slice. Only `dispatch-run.ts` narrows it (agent `memory: {tags, include_rejected}`, d-0078). |
| Worker access | `packages/mcp/src/domain/tools/` | Tools: `add-comment`, `ask-director`, `docs-lookup`, `finish`, `get-ticket`, `submit-review`, `web-fetch`, `web-search`. No memory tool. Workers see memory only as the prompt block the engine renders. `docs/design/tool-system.md` (grant table, line 402) lists `memory_search` as Director-only, deny for Workers. |
| Server routes | `apps/server/src/routes/memory.ts` | `GET /projects/:slug/memory`, `GET .../:id`, `POST .../proposals/:id/approve`, `POST .../reject`. No search route. No route creates a decision. |
| Web screen | `apps/web/src/routes/memory/` (`memory-page.tsx`, `memory-tabs.tsx`, `memory-toolbar.tsx`, `record-drawer.tsx`) | Tabs: Decisions, Rejected, Proposals, Outcomes, with counts. Toolbar and drawer exist. |
| DB | `packages/db`, highest migration `0028-research.ts` | Raw SQL migrations, no ORM (d-0047). Driver is **better-sqlite3 13.0.3** (`packages/db/src/adapters/sqlite/better-sqlite-driver.ts`), not `node:sqlite`. `research_sources` already uses a `project` column, so per-project rows in the shared DB is the existing pattern. |
| Design | `docs/design/memory-system.md` sections 4 to 9 | Already says: SQLite index with FTS5 is a rebuildable cache, `memory_search` tool for the Director, ranking `relevance x recency x importance`, decisions never decay, fenced data block with provenance, janitor propose-only. x-0013 changes "markdown is truth" to "database is truth". |

Two facts matter: the prompt cost is two problems (this repo's dev memory loaded by Claude at session start, and the product memory the engine pastes into every prompt), both "load everything active"; and strict YAML already fails on this repo's records (3.6), so import must reuse the lenient recovery.

## 3. Findings

### 3.1 Lexical retrieval: SQLite FTS5

**Measured here** (throwaway script in the session scratchpad, not committed): on Node 24.20.0, SQLite
3.53.4.

| Check | `node:sqlite` | `better-sqlite3` (Forge's driver) |
|---|---|---|
| FTS5 compiled in | yes | yes |
| `bm25()` with column weights | works | works |
| `porter unicode61` tokenizer | works, stems "superseding" to match "supersede" | same |
| `trigram` tokenizer | works, substring "verif" matches "verification" | same |
| `snippet()` | works | works |
| `fts5vocab` | works | works |
| `json_extract` | works | works |
| Loading extensions | `loadExtension` exists, needs `new DatabaseSync(path, { allowExtension: true })`; without it: "extension loading is not allowed". A bad path fails with a normal "module not found" | `loadExtension` exists |

So FTS5, trigram and bm25 are available with no extension. Extensions (sqlite-vec) can load into either
driver but nothing in slice 1 needs one.

**What FTS5 gives** (SQLite docs, https://www.sqlite.org/fts5.html):

- `bm25(ft, w0, w1, ...)` returns a negative score (lower is better), so `ORDER BY bm25(...)` ascending is
  best-first. Constants are fixed at k1 = 1.2 and b = 0.75. Column weights go in column order, so
  `bm25(m, 0, 10, 3, 1)` weights an unindexed id column 0, statement 10, tags 3, body 1.
- Tokenizers: `unicode61` (default, case-folding, diacritics removed), `porter` (wraps another tokenizer,
  English stemming), `trigram` (any substring of 3 or more characters; shorter substrings match nothing).
- Prefix queries: `thr*` on the last token, or `prefix='2 3'` index option for speed.
- `snippet(ft, col, open, close, ellipsis, maxtokens)` (max 64 tokens) and `highlight()` for hit context.
- External-content tables (`content='t1'`) need triggers for insert, update and delete, and
  `INSERT INTO ft(ft) VALUES('rebuild')` repairs an inconsistent index. This matches the "index is
  rebuildable" principle already in memory-system.md.

**How well it works on short records.** I imported this repo's 120 parseable active decisions and rejected
records into an in-memory FTS5 table (`porter unicode61`, weights statement 10, tags 3, body 1). Average
statement 480 characters, average body 204 characters, so these are short documents where bm25 length
normalisation barely matters and exact vocabulary dominates. Two query styles:

| Query style | Queries (targets indexed) | Top 1 | Top 5 | Top 10 |
|---|---|---|---|---|
| Agent-style keywords, 2 to 4 terms OR-ed (`tdd red green`, `pipeline graph`, `model matrix`) | 7 | 6 | 7 | 7 (the other hit is rank 2) |
| Full natural-language question, stop words dropped, OR-ed (`do we run tests first before writing code`) | 11 | 5 | 7 | 8 |

Caveats: the queries and expected ids are mine (18 queries); three more had targets not in the index (two fail YAML parsing, one is superseded) and were excluded. A smoke test, not a benchmark. It shows:

- Keyword queries work well on short decision text. Weighted columns and porter stemming do the job.
- Natural-language questions fail where the question's words are not the record's words. "Run tests first
  before writing code" did not retrieve the red-green TDD decision (d-0015); "how does the user choose a
  project name" did not retrieve the "product is called Forge" record (d-0043). That is the vocabulary gap
  embeddings address.
- OR-ing many common words adds noise. Tool design should try an AND query first, fall back to OR, and
  tell the agent to send short keyword queries.

Tokenizer: `porter unicode61` for the main index; a `trigram` index only if identifier-style queries matter. Ids use exact lookup, not FTS.

### 3.2 Semantic retrieval without an outside service

Options, all local, all behind a port:

| Option | Size and cost | Windows and install | Verdict |
|---|---|---|---|
| **transformers.js** (`@huggingface/transformers` 4.3.1) with `Xenova/all-MiniLM-L6-v2` | 384 dimensions. ONNX: 90.4 MB fp32, 23.0 MB int8/quantised (from the Hugging Face tree API) | Apache-2.0 model. Package unpacked 9.9 MB but depends on `onnxruntime-node` and `sharp` | Good default if vectors are wanted |
| `Xenova/bge-small-en-v1.5` | 384 dimensions, 33.4M parameters, 512 token max, MIT, MTEB retrieval 51.68. ONNX 133 MB fp32, 34 MB quantised. Query prefix `Represent this sentence for searching relevant passages:` optional in v1.5 | same stack | Slightly better retrieval, slightly bigger |
| `onnxruntime-node` directly | npm unpacked size **301 MB** (npm registry metadata, v1.30.0): ships binaries for several platforms | Prebuilt win32-x64 binary, no compiler | The install weight is the real cost, not the model |
| `sqlite-vec` 0.1.9 | `sqlite-vec-windows-x64` is 290 KB. Node usage: `sqliteVec.load(db)`; `node:sqlite` needs `allowExtension: true`; better-sqlite3 takes the connection directly | README says pre-v1, "expect breaking changes" | Not needed at this scale |
| Brute-force cosine in JS | **Measured**: 384-dim float32, 1,000 vectors 0.66 ms/query, 5,000 vectors 2.6 ms, 20,000 vectors 8.0 ms (30.7 MB in RAM) | none | Enough: a project has hundreds to low thousands of records |

transformers.js (https://huggingface.co/docs/transformers.js/index) runs feature-extraction on ONNX Runtime
with `dtype` `fp32`, `fp16`, `q8`, `q4`; the Node guide says the first run downloads and caches the model
(https://huggingface.co/docs/transformers.js/guides/node-audio-processing). I did not install it, so
embedding latency and process memory are **not measured here**; a spike must measure them.

**Recommendation on r-0001.** r-0001 rejected adopting mem0, Zep/Graphiti, LangMem, Cognee and A-MEM as the
memory backend, citing benchmarks where no framework beat plain files plus grep and a coding benchmark
where 11 of 12 memory systems scored below no memory. Those frameworks own storage, extraction and
consolidation. An embedding model that turns our own `statement` text into a vector and stores it in a
column we own does none of that: no LLM at ingest, no automatic merge, no second store. Graphiti, for
contrast, needs an LLM for extraction and deduplication at ingest
(https://github.com/getzep/graphiti), which is exactly what r-0001 and memory-system.md principle 3
reject. So: reopen only the *retrieval index*, keep the framework rejection, and gate the vector slice on
evidence (section 5).

The embedder must be a port (`embed(texts) -> Float32Array[]`, `model`, `dim`) so it can be absent: a 300 MB
native dependency for a few hundred short records is a poor trade until FTS misses are demonstrated.

### 3.3 Hybrid ranking and reciprocal rank fusion

RRF merges ranked lists by position only: `RRF(d) = sum over lists of 1 / (c + rank(d))`, commonly
`c = 60` (Microsoft's RAG guide,
https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-information-retrieval; original
paper Cormack, Clarke and Buettcher, SIGIR 2009, http://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf; I
could not extract the PDF text, so the formula is quoted from the Microsoft page). Microsoft's guidance:
RRF suits results with different score distributions such as BM25 and cosine, it is lightweight, and it is
a practical first-stage merge before any reranker. BEIR (https://arxiv.org/abs/2104.08663) found BM25 a
"robust baseline" across 18 datasets, with dense retrievers often behind in zero-shot use. So hybrid helps
mostly when the lexical list misses on vocabulary, which is the failure my smoke test showed.

On corpora of a few hundred short records I found no study, so this is judgment: hybrid should help paraphrase queries and cost nothing on keyword queries (an FTS rank-1 stays near the top after fusion). The cost is the embedder dependency, hence the gate.

### 3.4 "Related memories"

Signals, strongest first: (1) **explicit links** (`supersedes`, `amends`, `reopens`, ids cited in the body;
x-0013 itself says `amends: [d-0007, d-0086]`, `reopens: [r-0001]`, but today those fields are free-form and
unindexed); (2) **shared ticket or card ids** (outcomes); (3) **shared tags**, weighted by rarity, because
`memory` matches 40 records; (4) **FTS "more like this"**, a query built from the record's distinctive terms;
(5) **vector neighbours** (later); recency and status only as modifiers. Co-citation is too weak at this size.

Presenting related to an LLM without flooding context: at most 5 entries, one line each (id, kind, status,
140-character statement, a **reason** such as `amends`, `shares tags: memory, database`, `similar text`), never
bodies. If a hit is superseded, show it as `d-0004 (superseded by d-0005)` and return the successor, so an
agent never acts on a stale decision. This mirrors Graphiti's invalidation instead of deletion.

### 3.5 How agent products expose memory

| System | What the agent gets | Retrieval shape | Lesson for Forge |
|---|---|---|---|
| Claude Code (https://code.claude.com/docs/en/memory) | `CLAUDE.md` and auto memory loaded every session; auto memory loads only the first 200 lines or 25 KB of `MEMORY.md`; topic files read on demand | Index file always loaded, detail on demand | Same pattern as our `MEMORY.md`; the cap is the admission that "load everything" does not scale |
| Cursor rules (https://cursor.com/docs/context/rules) | Four rule types: always apply, apply intelligently (agent decides from a description), apply to specific files (globs), apply manually. Each rule under 500 lines; reference files instead of copying | Frontmatter scopes per task | Records need a short description field the agent can judge from, and tag/file scoping |
| Anthropic memory tool (https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) | Client-side file commands: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`. Directory listing first, then file with optional `view_range`; text view truncated at 16,000 characters | List then read; paging by range | Two-step list-then-read, a hard output cap, path/ownership validation by the host. Docs also say: cap file size, expire stale memory, strip sensitive data |
| Letta archival memory (https://docs.letta.com/guides/agents/archival-memory) | Tools `archival_memory_insert` (with tags) and `archival_memory_search` (`query`, `tags`, `page`); semantic matching | Search with tag filter and paging | Tag filter plus paging plus separate insert tool; content stays out of context until queried |
| mem0 (https://docs.mem0.ai/core-concepts/memory-operations/search) | `search(query, filters, top_k, threshold, rerank)`; scope via `user_id`, `agent_id`, `run_id` inside `filters` | Filters AND/OR, similarity threshold, optional rerank | `k` and a floor on score; scope ids always required so projects cannot leak into each other |
| Zep / Graphiti (https://github.com/getzep/graphiti) | Bi-temporal facts, invalidation instead of delete, semantic + BM25 + graph traversal | Hybrid with graph | Validity windows and chains are worth copying; the LLM-at-ingest graph build is not (r-0001) |

Common shape: a **search** that returns short items with ids, a **get by id** for full text, a filter on
tags/scope, a result cap, and the host (not the model) enforcing scope and size. None of the above makes
the model rank everything; they all keep a small always-loaded index and load detail on demand.

Recalled records go into the prompt as a fenced data block with provenance visible (memory-system.md section 3); search never returns proposals to Workers.

### 3.6 Provenance and append-only rules in a database

Version rows vs edit-in-place. Both fit; the rules in `CLAUDE.md` forbid editing `statement`, `source`,
`author`, `origin` and forbid deleting records. Git enforced this by history. In a database the safest
equivalent is:

- **Immutable content row** in `memory_records`. `BEFORE UPDATE` and `BEFORE DELETE` triggers raise on any
  change to `statement`, `body`, `source_type`, `source_ref`, `author`, `origin`, `kind`, `created_at`, and
  on any delete. This makes the rule a property of the data, so a future bug or a hand-run SQL statement
  cannot violate it. (Code rule 6: one door. Triggers are the second lock behind the door.)
- **Mutable state** (`status`, `valid_to`, `superseded_by`, `approved_*`, `rejected_*`) changes only through
  one function, and each change appends a row to `memory_events` (who, when, from, to, reason). Current
  state is a denormalised column on the record for fast reads, rebuildable from the events.
- **Supersede** = insert new record + link row `supersedes` + event on the old record. Never edit text.
- **Contradiction detection hints.** At `propose` and `decide` time, run search for the new statement
  restricted to `status = active` and overlapping tags; return the top 3 as "may conflict with". The owner
  sees them in the approval dialog. No automatic resolution (memory-system.md section 9 forbids merge and
  automatic choice). Graphiti invalidates contradicted facts automatically with an LLM; we deliberately do
  not.
- **Export.** Markdown export per record in the existing file format (front matter + body), so a human can
  diff, review and mirror. Deterministic field order (the memory package already fixes it) so exports are
  stable.

Finding in this repo's data: **36 of the records fail strict YAML parsing** (`yaml` package), typically an
unquoted colon in `statement`; for example `d-0071` and `d-0054` are `status: active` yet unreadable
strictly. The product's reader tolerates this through a line-based recovery that keeps only `id`,
`statement`, `status` (`packages/memory/README.md`, "Lenient parsing"). If the importer used strict YAML it
would silently drop about a fifth of the project's decisions. The importer must either reuse that recovery
or report each unparsed file and refuse to finish.

### 3.7 Token cost

Measured on this repo, bytes of markdown, approximate tokens at 4 characters per token (34,465 words
across `MEMORY.md` + decisions + rejected, so 1.3 to 1.5 tokens per word gives 45 to 52 thousand tokens, in
line with the estimate):

| What | Files | Bytes | Approx tokens |
|---|---|---|---|
| `MEMORY.md` (203 lines, index) | 1 | 26,489 | 6,600 |
| Active decisions (`status: active`) | 147 | 172,416 | 43,100 |
| Rejected | 7 | 4,407 | 1,100 |
| **Session start, per `CLAUDE.md`** | 155 | **203,312** | **about 50,800** |
| For reference: all 176 decision files incl. superseded | 176 | 202,705 | 50,700 |
| Proposed (6) and outcomes (10 files) | 16 | about 29,900 | about 7,500 (not loaded at start) |

Retrieval alternative (estimates from the measured average statement of 480 characters):

| Step | Size | Approx tokens |
|---|---|---|
| Tag-grouped digest (tag, count, 3 pinned ids), replaces `MEMORY.md` | about 2 KB | 500 |
| `memory_search` returning 10 one-line hits at 140 characters + id + reason | about 2 KB | 500 |
| `memory_get` of 3 records, statement + rationale capped at 800 characters each | about 2.4 KB | 600 |
| **Typical task** | about 6 KB | **about 1,600** |
| Engine injection before a Worker run: 6 pinned one-liners + top 8 statements (480 characters) | about 7 KB | about 1,800 |

That is about **30 times less** than loading everything, and the gap grows with the project because the
current cost is linear in record count. The zero-code interim step: session start reads only a tag-grouped
`MEMORY.md` of about 8 KB (2 K tokens) and opens records on demand, instead of 50.8 K tokens.

## 4. Recommended design

### 4.1 Tables (migration 0029, raw SQL, additive)

All rows carry `project` (slug), matching `research_sources`. Ids stay `d-0001` style, unique per project,
sequential per letter as today.

Tables (all rows carry `project`; primary key `(project, id)`):

- `memory_records`: `id`, `kind`, `statement`, `body`, `source_type`, `source_ref`, `author`, `origin`, `created_at`, `valid_from`, `imported_from` (all immutable), plus current state `status`, `valid_to`, `superseded_by`, `pinned`, `confidence`, and search aids `gist`, `aliases`. CHECK lists match the core enums as literals (as migration 0028 does).
- `memory_events` (append-only): `seq`, `project`, `id`, `at`, `actor`, `event`, `from_status`, `to_status`, `reason`.
- `memory_links`: `from_id`, `to_id`, `rel` in `supersedes, amends, reopens, cites, refs`.
- `memory_tags`: `(project, id, tag)`.
- `memory_fts`: FTS5 external-content table over statement, tags, aliases, body, `tokenize='porter unicode61'`, `prefix='2 3'`, kept in sync by triggers and rebuildable.
- `memory_vectors` (slice 3 only): `id`, `model`, `dim`, `content_hash`, `vec BLOB`.

Notes: `memory_search_view` is a plain table (or a rowid mapping) that holds `rowid`, statement, tag text,
aliases, body, so the FTS5 external-content triggers have a stable source; the exact shape is a spike
detail. Triggers on `memory_records` block updates to immutable columns and all deletes. Records that fail
the schema at import land in `memory_import_rejects(path, reason)` so nothing disappears silently. A record
is searchable when `status` is `active` (or `pending` for the owner's view only); search filters by status
in SQL, not after ranking.

`gist` and `aliases` are Director-written at propose or decide time (one line each). They are cheap
lexical levers for the vocabulary gap in section 3.1 (store "tests first, TDD, red green" in `aliases`).
They are part of the record's immutable set only if the owner wants them so; recommended default: mutable
through the transition door with an event row, since they are search aids, not provenance.

### 4.2 Ports and layers

- `core/types/ports/memory-index.types.ts`: read-only `MemoryIndex` (`search`, `get`, `related`, `list`,
  `digest`). `MemorySource.slice` becomes a thin wrapper, then goes away. `MemoryWriter` keeps its six calls;
  only the adapter changes. `Embedder` port (slice 3) is optional in composition.
- New adapter `packages/memory/src/adapters/sql-project-memory/` takes a `SqlDriver` (rule 1: it does not
  import `packages/db`); ranking, query building and RRF are pure code in `domain/`. The markdown codec stays
  for import and export. `apps/server` picks the adapter by config; `apps/mcp` exposes Worker tools.

### 4.3 Retrieval pipeline (`search`)

1. **Scope**: `project` required, `status` default `active`, `kinds` default `decision,rejected`. Agents
   with a tag slice (d-0078) get that filter forced by the server, not chosen by the model.
2. **Query building**: sanitise to FTS5 syntax (quote every term, never pass raw agent text to MATCH, it
   can throw on `-`, `:`, quotes); drop stop words; try AND of terms, then OR; last term as prefix `term*`.
3. **Lexical list**: `bm25(memory_fts, 10, 3, 5, 1)` over statement, tags, aliases, body; take top 30.
4. **Vector list** (slice 3, if embedder present): cosine over the filtered candidates, top 30.
5. **Fuse**: RRF with `c = 60` over the lists. Then multiply by boosts: pinned x1.15, `rejected` records
   x1.0, outcomes recency decay with 30-day half-life (memory-system.md section 8; decisions and rejected
   never decay).
6. **Supersede chain resolution**: if a hit is superseded and `include_superseded` is false, replace it by
   its active successor (de-duplicated).
7. **Truncate** to `k` (default 8, max 15) and a character budget (default 2,500 characters of output),
   returning `truncated: true, total_matches: N` when cut so the agent knows to narrow the query.

### 4.4 "Related" computation

`related(id, k = 5)` gathers candidates and ranks by RRF over three lists, each independently ordered:

1. **Link list**: one hop over `memory_links` both directions (`amends`, `reopens`, `supersedes`, `cites`,
   `refs`), ordered by relation priority, then recency.
2. **Tag list**: other records sharing tags, scored by sum of `log(N / df(tag))`, so rare tags dominate.
3. **Text list**: FTS query built from the record's 8 most distinctive terms (term frequency in this record
   weighted by inverse document frequency from `fts5vocab`), excluding itself. In slice 3, add a vector
   neighbour list.

Output per entry: `{ id, kind, status, line, reasons: ['amends','shares tags: memory, database'] }`.
`line` is the gist if present, else the first 140 characters of the statement. Superseded and rejected
neighbours are included only when linked (so the agent learns "this was reopened").

### 4.5 Agent tool set

All tools are read-only, project-scoped by the server, and every result is rendered inside a fenced
`<project-memory>` block with `author` and `origin` labels (data, not instructions).

**Director (engine port, plus tools in any agentic LLM step).** The Director is a deterministic engine with
finite LLM steps (d-0003), so the main change is engine-side: before triage, planning, dispatch and card chat
it calls `MemoryIndex.digest(slug)` (pinned records, tag counts) and
`MemoryIndex.search(slug, { query: cardTitle + description, k: 8 })` and injects both, always including
matching rejected approaches. Agentic steps get the tools below under the existing `memory_search` grant
(`tool-system.md` line 407).

| Tool | Input | Output | Limits |
|---|---|---|---|
| `memory_search` | `{ query: string (1-200 chars), kinds?: ('decision'\|'rejected'\|'proposal'\|'outcome')[], status?: ('active'\|'pending'\|'superseded')[], tags?: string[] (any-of), k?: int 1-15 (default 8), cursor?: string }` | `{ hits: [{ id, kind, status, line, tags, why: 'title match'\|'tag match'\|'text match'\|'similar', score }], total: int, truncated: boolean, next_cursor?: string }` | `line` at most 160 characters; whole result at most 2,500 characters; default `status` `active`; Director only sees `pending` and `outcome`. |
| `memory_get` | `{ ids: string[] (1-3), detail?: 'statement'\|'full' (default 'statement') }` | `{ records: [{ id, kind, status, statement, body?, tags, source, author, origin, valid_from, valid_to, superseded_by, links: [{rel, id}] }] }` | `body` at most 4,000 characters, `truncated_body: true` if cut; unknown id gives a typed error, not an empty success. |
| `memory_related` | `{ id: string, k?: int 1-5 (default 5) }` | `{ related: [{ id, kind, status, line, reasons: string[] }] }` | at most 1,200 characters. |
| `memory_list` | `{ kind?: string, status?: string, tag?: string, limit?: int 1-25 (default 25), cursor?: string }` | `{ items: [{ id, kind, status, line, tags }], next_cursor? }` | one line per item, at most 25 per page. Exact lookup path, no ranking. |

**Workers.** Today they get a pasted slice and no tool. Option A (default, slice 1): the engine uses the same
`search` to pick the Worker's slice, so the prompt block shrinks. Option B (slice 2): two read-only tools in
the forge MCP server (`memory-search.ts`, `memory-get.ts` under `packages/mcp/src/domain/tools/`), forced by
the server to active `decision` and `rejected` records in the agent's tag slice (d-0078); no proposals,
outcomes, related or list; Workers never write. d-0067 disables tool deferral, so both schemas sit in every
Worker session: keep them flat and one sentence each. B means amending the `memory_search` row in
`tool-system.md`; the data-home folder stays denied because the tools go through the MCP server.

**Writes** stay on the existing writer: `propose`, `decide`, `approve`, `reject`, `supersede`,
`appendOutcome`. Add two optional fields to the inputs: `gist`, `aliases`, plus typed `links`
(`amends`, `reopens`, `refs`) instead of free-form front matter. Write results include
`possible_conflicts: [{id, line}]` (top 3, section 3.6).

### 4.6 Migration from git markdown

1. **Importer** (server-side, idempotent by `(project, id)`): read each project's last commit with the
   existing `git ls-tree` + `cat-file` code, parse with the lenient recovery, map status and kind, insert
   records, links (`supersedes`, `superseded_by`, `amends`, `reopens`, ids in bodies), tags and events, set
   `imported_from = path@sha`. Unparseable files go to `memory_import_rejects`; a project does not cut over
   while any remain.
2. **Git history**: keep each repo frozen as the audit trail for everything before cutover. No rewrite, no
   delete, no new commits unless the mirror is on.
3. **Cutover** is a per-project config flag (rule 9); both adapters sit behind the same port until the file
   adapter is deleted.
4. **This repo's `.forge/memory/`** (dev memory): import it as a Forge project (d-0020 dogfood) and add a CLI
   over `search` and `get` so Claude reads a 2 KB digest, not 203 KB. Until then use the slice 0 trim. The
   markdown stays committed here until the owner says otherwise.

### 4.7 Markdown export and mirror

`exportProject(slug, dir)` writes one file per record in the current layout with fixed field order (a pure
function of DB rows, so repeated runs diff clean). Optional git mirror: each write enqueues an export and
one commit in the project's repo (off by default, on for the dogfood project). The d-0086 PR mirror reads the
export, not the DB.

### 4.8 Web Memory screen

A search box in `memory-toolbar.tsx` calls `GET /projects/:slug/memory/search?q=&kind=&tag=` and shows rows
with `snippet()` highlights, an empty state ("0 matches, try fewer words") and a status chip (superseded is
hidden by default). The record drawer gains Related, History (events) and replaces/replaced-by chain. Approval
dialogs show `possible_conflicts`. Tab counts become `GROUP BY kind, status` queries.

## 5. Phasing

| Slice | Content | Done when |
|---|---|---|
| **0** (no code, now) | Trim this repo's `MEMORY.md` to a tag-grouped pointer list of about 8 KB; change `CLAUDE.md` session start to "read the index, open records on demand with rg". Add the memory-DB reopen note for r-0001 as the owner's call. | Session start under about 10 KB |
| **1** (smallest useful) | Migration 0029 (records, events, links, tags, FTS, triggers). SQL adapter for reader and writer. Importer with lenient parsing. `MemoryIndex` port with `search`, `get`, `list`, `digest`, `related` (link and tag lists only). Engine callers switched to pinned plus top-k. Server `GET .../memory/search`. Contract tests run against both the file and SQL adapters (rule 8). | Same planning behaviour on the repo's own data; token count per planning prompt measured before and after |
| **2** | Web search box, Related and History blocks, `possible_conflicts`, markdown export, optional git mirror. Optional Worker MCP tools (option B) if the owner approves. | Owner can search and review in the UI; export diffs clean against the old repo |
| **3** (gated) | `Embedder` port, `memory_vectors`, RRF fusion, background embedding on write, model download step in setup. Gate: logged agent queries (add a `memory_queries` log in slice 1: query text, tool, hits returned, whether a `get` followed) show lexical top-5 recall below an agreed bar, or the owner asks for it. | Eval set built from real queries shows hybrid beats FTS by a margin worth 300 MB of install |

## 6. Risks and open questions for the owner

| # | Question or risk | Recommended default |
|---|---|---|
| 1 | Is the database the single source of truth, with git only audit and export? (amends d-0007 and d-0086) | Yes. Keep old git repos frozen as audit; mirror optional. |
| 2 | Do Workers get memory tools, or only a smaller pasted slice? | Slice 1 smaller pasted slice only (option A). Decide B after slice 1 measurements; requires editing the tool-system grant table. |
| 3 | Embeddings: when? | Not in slice 1. Add logging now; build slice 3 only if lexical recall misses the bar. Reopen record for r-0001 names this as retrieval over our own rows, not a framework. |
| 4 | Will a local embedder install weight be acceptable (onnxruntime-node 301 MB unpacked, plus 23 to 34 MB model)? | Only after a spike on this machine measures latency and RAM, and a lazy first-use download rather than install-time. Not measured here. |
| 5 | Strict YAML fails on 36 of this repo's records. | Importer uses lenient recovery and refuses cutover until every file is accounted for. Optionally quote the colons in the files (formatting change, not a content change; owner approval needed because `CLAUDE.md` says never edit `statement`). |
| 8 | Query injection: agent text into FTS5 `MATCH`. | Server builds the MATCH expression from quoted terms; never pass raw strings. Test with hostile inputs. |
| 10 | Recalled memory poisoning (a Director-inferred record steering later runs). | Keep memory-system.md section 3 principles: only `status: active` and `author: user` reach Workers; fenced data block; proposals never in Worker results. |
| 11 | One DB for all projects: a bug could leak one project's records into another's search. | `project` is a required parameter in every query and part of every primary key; add a contract test that searches project A and asserts nothing from B. |

## 7. Sources

All URLs are cited inline in section 3. Sizes come from the Hugging Face tree API and npm registry metadata. Internal: `CLAUDE.md`, `.claude/rules/code.md`, `docs/design/memory-system.md`, d-0007, d-0067, d-0078, d-0086, r-0001, r-0002, x-0013.

Not available: SearXNG at localhost:8888 was down (empty response); all external reading used WebFetch.
  I did not fetch mem0 or Zep benchmark papers; benchmark claims about r-0001 are quoted from r-0001 itself.
