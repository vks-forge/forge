# @forge/tools

Tool policy as pure functions: signed catalogue, lane grants, shell tokenizer, call-time rules, one `admit()`, hash-chained receipts and budgets.

## Why it exists

Workers are LLM sessions inside third-party harnesses, and what they can touch (shell, files, MCP servers, the web) decides what an unattended run can break. The Director must decide which tools a Worker sees, whether each call is allowed, and later prove what was allowed and what actually happened, without trusting the Worker or the harness. Without one policy surface, listing, calling and nested calling would each carry their own check; a tool could be listed but refused, or reached through a wrapper unchecked. The Claude hook, the Factory MCP server and the engine all call this package, so the answer is the same everywhere. Design: `docs/design/tool-system.md`.

## What it does

Public API (`src/index.ts`):

- Catalogue: `loadCatalogue(yaml, key)` and `readCatalogueFile(path, key)` return `verified` or `quarantined` (nothing usable); `signCatalogue(entries, key)`; `schemaMatches` checks a live schema hash.
- Grants: `effectiveGrant(lane, projectGrant?, ticketGrant?, managed?)`, `checkToolGranted()`, `parseGrant()`, `LANE_DEFAULTS`, `FLOOR_RULES`. The result is the intersection of lane, project, ticket and managed rules; deny always wins.
- Shell: `tokenizeShell(command, 'bash' | 'powershell')`, `evaluateShell()`, `evaluateToolRules()`. Chains are judged by their worst segment.
- Admission: `admit(ctx, call)` returns `Decision {decision, reason, enforced_by:'forge_admit', matched_rule, layer, enforcement}`. It never throws; an internal error is `deny` with `inspector_error`, and an `ask` becomes `deny` (`unattended`) when nobody can answer (default on Express). `visibleTools(ctx)` lists tools built from `admit()` with `phase: 'list'`.
- Receipts: `makeDecisionReceipt()`, `makeEffectReceipt()`, `verifyChain()`. Each receipt is HMAC'd and linked to the previous one; `verifyChain` fails at a named index on edit, delete, reorder or splice.
- Budgets: `checkBudget()`, `recordUsage()`, `EMPTY_USAGE`. Hard caps deny, soft rolling-window caps force an approval, non-sane counters deny.

Layout: `schemas/` zod, `types/` hand-written types, `domain/` policy, `adapters/catalogue-file.ts` (the only file reader), `shared/` canonical JSON, HMAC and matchers. Tests in `__tests__/` mirror `src/`.

## Why this approach

- `zod@4.6.7` for every boundary; `yaml@2.9.1` for the catalogue file; HMAC via `node:crypto` (no crypto dependency); `@forge/core` for lane and error types.
- Signed catalogue: a Worker or a stray edit in its worktree must not be able to add or loosen a tool. Any signature mismatch quarantines the whole catalogue. A per-tool `schema_hash` catches an MCP server that changes a tool's schema after review.
- Hash-chained HMAC receipts under a per-run secret the harness never sees: gates can prove behaviour without trusting the Worker. The MAC covers `prev_hash || seq || tool || input_hash || output_hash`.
- Shell tokenizer, not a full parser (d-0038, which superseded the tree-sitter-first plan x-0009): split on `;`, `&&`, `||`, `|`, newlines, `$(...)` and backticks, honouring quotes, with longest-prefix matching. Anything it cannot understand is refused or forced to `ask`. Claude Code's own `Bash(prefix:*)` rules remain a floor underneath.
- Floors are managed deny rules no lane, project, ticket or approval can lift (no push, publish, credential reads, writes outside the worktree, editing policy files). Argv-aware floors survive reordered flags and wrappers (`git -C x push`, `sudo npm publish`).
- One door: do not add a second check next to `admit()`. Workers never push (d-0012).

## Requirements

- Node 24.20 and pnpm; no native binaries, no external services.
- The signing key is passed in by the caller (`key` parameters); this package reads no env var. Where the key is stored: not verified in this package.
- A catalogue file (`.forge/tools/catalog.yaml` by convention in the docs) read from the main checkout's HEAD by the caller, never from the Worker's cwd (d-0038). The `.forge/tools/` folder holds the signed catalogue produced by `scripts/sign-catalogue.mjs`.
- `pnpm build` at the root produces `dist/`; the `development` export condition resolves `src/` in tests and typecheck.
- Tests: `pnpm test` at the root. Coverage floor is 80% lines.

## Extending

To add a tool to the catalogue:

1. Add an entry to `.forge/tools/catalog.yaml`: `id` (`mcp__<server>__<tool>` or a native snake name), `kind`, `version`, declared `risk`, `exposure`, `schema_hash` (`sha256:` of the live schema), `support` per harness with `enforced` (`os|harness|hook|in-tool|server|attribution-only`).
2. Add the id to the right lane in `domain/lane-defaults.ts` (`allow`) and a rule for its action (`toolAction(id)`: bare name; `project_mcp` for project servers).
3. Re-sign with `signCatalogue(entries, key)` and commit (Tier C). The loader quarantines on any mismatch.

New policy logic goes in `domain/` as a pure function reached through `admit()`.

## Limits

- Shell tokenizer: heredocs, process substitution and bare `( )` are refused; `$(...)`, wrappers (`env`, `sudo`) and interpreter eval (`bash -c`) force at least `ask`. Tree-sitter parsing is not built.
- The catalogue text must come from the main checkout's HEAD; this package does not do that read.
- This package decides and records; it does not persist receipts (see `@forge/db`) or intercept calls (hook and MCP packages).
- Tail truncation of a chain is detected only if the final chain hash is recorded on the run row by the caller.
