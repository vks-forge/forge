# @forge/tools

Tool policy as pure functions: signed catalogue, lane grants, shell tokenizer, call-time rules, one `admit()`, hash-chained receipts and budgets.

## Why it exists

Workers are LLM sessions inside third-party harnesses, and what they can touch (shell, files, MCP servers, the web) decides what an unattended run can break. The Director must decide which tools a Worker sees, whether each call is allowed, and later prove what was allowed and what actually happened, without trusting the Worker or the harness. Without one policy surface, listing, calling and nested calling would each carry their own check; a tool could be listed but refused, or reached through a wrapper unchecked. The Claude hook, the Factory MCP server and the engine all call this package, so the answer is the same everywhere. Design: `docs/design/tool-system.md`.

## What it does

Public API (`src/index.ts`):

- Hook wire schemas (`schemas/hook-wire.ts`, also the subpath `@forge/tools/hook-wire`, which imports zod only so the hook process starts fast): `HookPayload`, `HookRequest`, `HookResponse`, `HookVerdict`, `HOOK_EVENTS`. A harness driver's hook client and the receipt ingress in `@forge/hooks` share them (d-0056).
- Catalogue: `loadCatalogue(yaml, key, { allowDevKey? })` and `readCatalogueFile(path, key, opts)` return `verified` or `quarantined` (nothing usable, never a throw; reasons `malformed`, `bad_signature`, `bad_key`); `signCatalogue(entries, key)`; `schemaMatches` checks a live schema hash. A key under 32 bytes, or the public `DEV_CATALOGUE_KEY`, is `bad_key` unless `allowDevKey: true`. `devKeyAllowed(env)` is the one pure test production callers use for that flag: true when `NODE_ENV === 'test'` or `FORGE_ALLOW_DEV_CATALOGUE_KEY=1` (this package still reads no env itself; the caller passes `process.env`).
- Crypto helpers (`shared/hmac.ts`, used by hooks and mcp too, do not copy them): `sha256Hex`, `hashToken` (what is stored for a bearer token), `constantTimeEqual` (digest both sides, then `timingSafeEqual`), `hmacHex` (throws on a key under `MIN_KEY_BYTES` = 32).
- Grants: `effectiveGrant(lane, projectGrant?, ticketGrant?, managed?)`, `checkToolGranted()`, `parseGrant()`, `LANE_DEFAULTS`, `FLOOR_RULES`. The result is the intersection of lane, project, ticket and managed rules; deny always wins.
- Shell: `tokenizeShell(command, 'bash' | 'powershell')`, `evaluateShell()`, `evaluateToolRules()`. Chains are judged by their worst segment.
- Admission: `admit(ctx, call)` returns `Decision {decision, reason, enforced_by:'forge_admit', matched_rule, layer, enforcement}`. It never throws; an internal error is `deny` with `inspector_error`, and an `ask` becomes `deny` (`unattended`) when nobody can answer (default on Express). `visibleTools(ctx)` lists tools built from `admit()` with `phase: 'list'`.
- Call resource: `callResource(ctx, call)` names what a call touched, with the same path and shell handling `admit()` judges on: the normalised path (relative to the cwd when inside it) for path tools; the first 200 characters of the normalised shell segment texts joined by `;` for the shell; the host for a network tool given a `url`; the tool id for a project MCP tool or any other MCP tool; `null` when nothing can be named safely. The hook writes it into the decision receipt.
- Receipts: `makeDecisionReceipt()`, `makeEffectReceipt()`, `verifyChain()`. A decision receipt has a `resource` (from `callResource`, `null` if none), covered by the MAC. Each receipt is HMAC'd and linked to the previous one; `verifyChain` fails at a named index on edit, delete, reorder or splice, on a second effect for one decision (`duplicate_effect`) and on an effect for a decision that was not `allow` (`effect_not_allowed`).
- Budgets: `checkBudget()`, `recordUsage()`, `EMPTY_USAGE`. Limits and usage are parsed with their zod schemas inside the check; hard caps deny, soft rolling-window caps force an approval, invalid or non-sane input denies.
- Receipt log port (types only, `types/ports/receipt-log.types.ts`): `ReceiptLog` (`append(runId, build)` atomic and serialised per run, `list(runId)`) and `ChainView`. Implementations live in `@forge/db`; the hook is the writer.
- Catalogue `support[harness].harness_version` (optional) is the harness build whose native tool schemas were reviewed. Native tools have no live schema source, so the server trusts a native `schema_hash` pin only while the running harness reports exactly that build (d-0053); otherwise `admit()` denies the tool as `schema_changed`. Changing it changes the entry's pin: re-sign with `node scripts/sign-catalogue.mjs`.
- Hook wire: `TruncatedOutput` (`{ truncated, bytes, sha256, prefix }`) is what the hook posts for a tool output over `MAX_TOOL_OUTPUT_BYTES` (1 MiB); the receipt's `result_hash` is the `sha256`. New denial reason `fail_closed_no_liveness`.
- Catalogue `support[harness].native` is one name or a list (`shell` is `[Bash, PowerShell]`: the Windows CLI says PowerShell, ACP says Bash); `nativeNames(support)` normalises it.

Layout: `schemas/` zod, `types/` hand-written types, `domain/` policy, `adapters/catalogue-file.ts` (the only file reader), `shared/` canonical JSON, HMAC and matchers. Tests in `__tests__/` mirror `src/`.

## Why this approach

- `zod@4.6.7` for every boundary; `yaml@2.9.1` for the catalogue file; HMAC via `node:crypto` (no crypto dependency); `@forge/core` for lane and error types.
- Signed catalogue: a Worker or a stray edit in its worktree must not be able to add or loosen a tool. Any signature mismatch quarantines the whole catalogue. A per-tool `schema_hash` catches an MCP server that changes a tool's schema after review.
- Hash-chained HMAC receipts under a per-run secret the harness never sees: gates can prove behaviour without trusting the Worker. The MAC covers `prev_hash || seq || tool || input_hash || output_hash`.
- Shell tokenizer, not a full parser (d-0038, which superseded the tree-sitter-first plan x-0009): split on `;`, `&&`, `||`, `|`, newlines, `$(...)` and backticks, honouring quotes, with longest-prefix matching. Anything it cannot understand is refused or forced to `ask`. Claude Code's own `Bash(prefix:*)` rules remain a floor underneath.
- Floors are managed deny rules no lane, project, ticket or approval can lift: no push or publish; credential files, `**/.forge/data` (at any depth, because a Worker's cwd is a worktree and the data lives in the main checkout) and anything outside the worktree for every path tool (`read`, `grep`, `glob`, `edit`, `write`), with the directory itself floored as well as its contents; the harness's user config (`**/.claude/**`, `**/.claude.json`, `**/.codex/**`) for reads; `.forge/tools` and `.git` for edits. Paths are compared case-insensitively on their normalised absolute form (`shared/path.ts`: `\\?\` and `//?/` prefixes stripped, trailing dots/spaces and `:stream` dropped, dots resolved before making the path cwd-relative, a leading `~` and drive-relative `C:x` counted as outside). A path tool whose input has no string path is denied (`invalid_resource`), never read as "the cwd"; `grep` and `glob` are judged on `path` and on the pattern.
- Argv-aware floors survive reordered flags, wrappers and nesting. `domain/command-classes.ts` is the one list of wrappers and interpreters used by the tokenizer flags, the floors and the always-allow ban. A wrapped segment (`sudo`, `env`, `timeout 10`, `xargs`, ...) is checked at every later word; the string argument of `bash|sh|zsh -c`, `cmd /c`, `powershell|pwsh -Command` (and decoded `-EncodedCommand`) and `eval` is re-tokenised and the same floors run on it, a hit being a deny. Also floored: `git -c` keys that run programs or push (`alias.*`, `core.sshCommand`, `core.hooksPath`, `push.*`, ...) and risky `GIT_*` env, `git log|diff|show|format-patch --output=<f>` / `-o <f>` as a write of `<f>`, recursive delete of the cwd, any ancestor of it, `*`, `/`, `~` or a drive, and the files named by `ls`/`dir`/`cat`/`type`/`Get-Content`/`head`/`tail`/... as reads (a glob such as `cat .e*` is refused when it could expand to a protected name).
- Lane: `admit()` reads the lane from `ctx.grant.lane` only (a `ctx.lane` that disagrees is a deny) and `LANE_UNATTENDED` decides whether an `ask` becomes `deny`; `ctx.unattended: true` can tighten Standard or Full, nothing can loosen Express.
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
   When a harness reports one capability under several names, list them: `native: [ Bash, PowerShell ]`.
3. Re-sign with `signCatalogue(entries, key)` and commit (Tier C). The loader quarantines on any mismatch.

New policy logic goes in `domain/` as a pure function reached through `admit()`.

## Limits

- Shell tokenizer: heredocs, process substitution and bare `( )` are refused; `$(...)`, wrappers (`env`, `sudo`) and interpreter eval (`bash -c`) force at least `ask`. Tree-sitter parsing is not built.
- The catalogue text must come from the main checkout's HEAD; this package does not do that read.
- This package decides and records; it does not persist receipts (see `@forge/db`'s `ReceiptLog` implementations) or intercept calls (hook and MCP packages).
- Floors act only through `admit()`; a harness that bypasses the hook (or a shell the tokenizer cannot see into, such as a script file or `node -e` code beyond a textual scan for `git push`) is not stopped by them alone.
- Path matching is lexical: symlinks, junctions and 8.3 short names (`FORGE~1`) are not resolved, and shell variable expansion (`$X/..`) is not evaluated. The wildcard check for shell readers compares a glob with a fixed list of protected names; it is a heuristic, not an expansion.
- Signing keys are 32 bytes or more. The committed catalogue is signed with the public dev key (`node scripts/sign-catalogue.mjs --dev`); loading it needs `allowDevKey`, which production code should derive from `devKeyAllowed(process.env)`. A real operator key is set with `FORGE_CATALOGUE_KEY` and the same script without `--dev`.
- Tail truncation of a chain is detected only if the final chain hash is recorded on the run row by the caller.
