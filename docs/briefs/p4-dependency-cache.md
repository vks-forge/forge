# Phase 4.3: faster setup with a dependency cache, any language (builder brief)

Items D and X5 of `next-work-queue.md`; plan step 4.3; idea from Anneal (`docs/reports/2026-10-23-anneal-comparison.md`
row 8). Binding: `.claude/rules/code.md`, d-0176 (never Node-only; ecosystem specifics are editable recipe data),
d-0180 (Forge runs setup outside the Worker's policy).

## Problem

Every ticket worktree runs a cold install: 78-90 s for `npm ci` on CHE-2 / CHE-6 / CHE-3, 234 s for CHE-10. Two
tickets of the same project with the same lockfile pay it twice. The setup key
(`packages/gates/src/adapters/prep-key.ts`) only skips a re-run inside the same worktree.

## Design: two layers, both driven by recipe data

1. **Shared package-manager caches (safe for every ecosystem).** Each detected recipe (gates `domain/detect-setup.ts`
   / the setup recipe table) may declare `cache_env`: variables pointing the tool's own download cache at one
   Forge-owned folder per ecosystem under Forge's data folder (`cache/<ecosystem>/`), e.g. npm `npm_config_cache`,
   pnpm `npm_config_store_dir`, yarn `YARN_CACHE_FOLDER`, pip `PIP_CACHE_DIR`, uv `UV_CACHE_DIR`, cargo
   `CARGO_HOME`, go `GOMODCACHE`, composer `COMPOSER_CACHE_DIR`, bundler `BUNDLE_PATH`-style caches only where the
   tool keeps them outside the project. The preparer sets them for the step (they are Forge values, not secrets).
   Downloads are reused, installs get faster, nothing is relocated.
2. **Restore outputs by copy (only where the output is relocatable).** `SetupStep` gains optional `cache_outputs:
   RelativeDir[]` and the recipe marks them only for relocatable folders (e.g. `node_modules`, `vendor`); Python
   virtual environments are NOT relocatable and are not copied (layer 1 covers them). Key = sha256 of: step command,
   cwd, the bytes of the step's `inputs` files, the toolchain id (output of an optional recipe `toolchain` probe like
   `node --version`, cached per server start), OS and arch. Hit: copy the stored folders into the worktree (Node
   `fs.cp` recursive; use copy-on-write where the OS supports it), record the step as "restored from cache", skip the
   command. Miss: run the step, then store the outputs in the background. One cache folder per key under
   `cache/setup/<key>/`; a size budget (setting, default 5 GB) evicts the least recently used; a failed or partial
   store is discarded, never used.
3. **Settings / owner view**: project setup settings show per step "Cache: on (restores node_modules)" or "Downloads
   shared"; a "Clear setup cache" action in Forge settings. Defaults come from recipes; the owner can turn a step's
   copy cache off.
4. **Wait line**: the setup note says "workspace ready in 4 s (restored from cache)".

## Tests (red first)

Key changes with any input byte, command, toolchain or OS; same key on a second worktree → restore, command not run;
partial store not used; budget eviction; recipes: cache_env per ecosystem table test, Python step has no
`cache_outputs`; heavy test with a tiny fake package manager script (language-neutral: a shell / node script that
writes a folder) proving restore skips the command.

## Builder steps

- **4.3a**: core schema + gates preparer + recipes + tests (layers 1 and 2, item 4).
- **4.3b**: settings UI + clear-cache action (item 3), hallmark + nielsen first.
