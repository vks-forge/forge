# @forge/tools

Tool policy as pure functions: signed catalogue, lane grants, shell tokenizer,
call-time rules, one `admit()`, chained receipts, budgets. Depends on
`@forge/core`, `zod`, `yaml`. IO only: `adapters/catalogue-file.ts` reads a
catalogue file; HMAC via `node:crypto`. Design: `docs/design/tool-system.md`.

## Public API (`src/index.ts`)

- `loadCatalogue(yaml, key)` / `readCatalogueFile(path, key)` -> `verified` or `quarantined` (nothing usable); `signCatalogue()`
- `effectiveGrant(lane, projectGrant?, ticketGrant?, managed?)`, `checkToolGranted()`, `parseGrant()`; `LANE_DEFAULTS`, `FLOOR_RULES`
- `tokenizeShell(command, 'bash' | 'powershell')`; `evaluateShell()`, `evaluateToolRules()`
- `admit(ctx, call)` -> `Decision {decision, reason, enforced_by:'forge_admit', matched_rule, layer, enforcement}`; `visibleTools(ctx)`
- `makeDecisionReceipt()`, `makeEffectReceipt()`, `verifyChain()`; `checkBudget()`, `recordUsage()`

## Layout

`schemas/` zod, `types/` hand-written types, `domain/` policy, `adapters/` file
reader, `shared/` canonical JSON, HMAC, matcher. Tests in `__tests__/` mirror `src/`.

## How to add a tool to the catalogue

1. Add an entry to `.forge/tools/catalog.yaml`: `id` (`mcp__<server>__<tool>` or a
   native snake name), `kind`, `version`, declared `risk`, `exposure`,
   `schema_hash` (`sha256:` of the live schema), `support` per harness with
   `enforced` (`os|harness|hook|in-tool|server|attribution-only`).
2. Add the id to the right lane in `domain/lane-defaults.ts` (`allow`) and a rule
   for its action (`toolAction(id)`: bare name; `project_mcp` for project servers).
3. Re-sign: `signCatalogue(entries, key)` over the entries; commit (Tier C).
   The loader quarantines on any mismatch. Call-time and list-time both go
   through `admit()`; do not add a second check.

## Notes

- Catalogue text must come from the main checkout's HEAD; the caller does that read.
- Shell tokenizer is the M0 one (d-0038): heredocs, process substitution and
  bare `( )` are refused; `$(...)`, wrappers (`env`, `sudo`) and interpreter
  eval (`bash -c`) force at least `ask`.

## db follow-ups (packages/db migration 0002, not edited here)

- `tool_decisions`: add `reason TEXT` and `parent_call_id TEXT` (nested calls, section 5.5).
- `tool_effects`: add `run_id TEXT NOT NULL` and a chain position (`chain_seq`),
  since the chain interleaves both tables and `tool_effects` has neither.
- `hash` holds the HMAC (`HMAC(run_secret, prev_hash || seq || tool || input_hash || output_hash)`);
  `finding_ids_json` stores `finding_ids`. Record the final chain hash on the run
  row so tail truncation is detectable.
