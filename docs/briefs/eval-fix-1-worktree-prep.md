# Eval fix 1 — Forge prepares each worktree before the Worker starts (builder brief)

Status: **draft, needs owner approval** · 2026-10-20 · Source: `docs/reports/2026-10-20-forge-usefulness-eval.md` item 1,
`docs/reports/2026-10-20-eval/forge.json` bugs "Worktrees have no dependencies…" (critical), "Ecosystem not recorded",
"Worktrees and branches of cancelled tickets not cleaned". Rests on d-0059 (worktree per run), d-0098/d-0170 (worktrees in
the data folder), d-0095 (any language, role-tagged commands, detectors), d-0085/d-0090 + code.md rule 9 (config is UI data),
d-0135 (typed escalations, no dead ends), d-0175 (Express still denies; installs stay Worker-denied), d-0161 (real isolation
later). No `rejected/` record covers this. Supersedes the `.worktreeinclude` line in `execution-plane.md` §6 (a hand-edited
file breaks d-0090).

## Problem (verified in code at HEAD `81b645b`)

1. `worktrees.create()` (`packages/git/src/adapters/git-cli/worktree-manager.ts`) is a bare `git worktree add`; nothing
   installs dependencies. Callers: `engine/src/tick/dispatch-run.ts:133`, `dispatch-check.ts:89`, `restart.ts:110`,
   `stage-advance.ts:208`, `verify.ts:75`. Workers may not install (lane rules deny/ask), so G1 checks fail on every
   ecosystem whose tools need a project-local install (`node_modules`, `.venv`, `vendor/`).
2. Ecosystems never recorded: `apps/server/src/routes/projects.ts:100` hard-codes `ecosystems: []` on the row, and
   `apps/web/src/domain/project-draft.ts` `buildCreateRequest` sends only `checks`. The inspection detected `node`
   correctly. Settings `ecosystems` (what gates and the shell allow-list read; empty means "detect from the diff") is a
   separate field and was not affected.
3. Leftover worktrees: `plan-to-tickets.ts` `cancelReplaced()` cancels an earlier plan's `waiting_human`/`blocked`
   tickets (which have worktrees) but never calls `stopCancelled()`, so re-planned tickets (FR-8, FR-11) keep their tree.
   Branches are never deleted on cancel (the port keeps them by design, d-0059 "branch kept until merged"), so FR-12's
   branch stays. A failed `git worktree remove` (Windows locked file, long path in `node_modules`) is only logged.
   This falls naturally in scope: the prep record and the outputs live with the worktree, so removal has to be fixed too.

## Decisions recommended

| # | Decision | Alternatives rejected |
|---|---|---|
| D1 | **Setup steps are project settings** (`ProjectConfig.setup`), versioned, edited only in Project settings → Checks. Absent = use the detected defaults (computed from the worktree at prep time); `[]` = no setup. | Seeding the list at create (existing projects get nothing; detection drift); a repo file such as `.worktreeinclude` (d-0090). |
| D2 | **Defaults come from one data table** in `packages/gates` keyed by ecosystem id + marker files (lockfile first). Core and engine never name a tool. | Per-ecosystem `if`s in engine (rules 2, 3); Director-written setup (slow, non-deterministic). |
| D3 | **Forge runs setup outside the Worker's policy**, through a new core port `WorktreePreparer`, adapter in `packages/gates` (reuses `runShellCommand`, `scrubEnv`, command resolution). Workers stay denied installs. | Granting Workers `npm ci` (lane policy, d-0175 Express denies, one approval per ticket). |
| D4 | **No cross-worktree copying.** Run the install per worktree and let each tool's own global cache (pnpm store hardlinks, npm/pip/uv/cargo/go/nuget caches) make repeats cheap. Skip when the **prep key** (sha256 of the steps + contents of their `inputs` files) equals the worktree's stored key. | Hardlink/junction a prepared `node_modules` (Windows junction/permission quirks, Worker edits leak between tickets, pnpm symlink layout breaks); copy a template (slower than a warm `npm ci`). |
| D5 | **Prep runs as a background job** beside the tick (same pattern as `tick/gate-jobs.ts`), and a preparing ticket **holds its Worker slot**. The tick never awaits an install (eval item 5). | Awaiting in `tryStart` (blocks every other ticket for minutes). |
| D6 | **Failure on base content = `setup` escalation** to the owner (new `SetupCause` `worktree_setup`), never a G1 failure, never a spent Worker run. Failure after the Worker changed an `inputs` file = a check failure sent back to the Worker (its change broke the install). | Treating every failure as owner setup (the owner would debug the Worker's lockfile edit). |
| D7 | **Frozen installs only** in this fix; a missing lockfile uses the variant that writes no lockfile where the tool has one. Letting Workers add dependencies is a separate brief (Q1). | Non-frozen re-install after a manifest change (lockfile churn lands in the Worker's diff and breaks claims). |
| D8 | **Install outputs never reach the diff.** Untracked top-level paths that appear during setup (e.g. an un-ignored `.venv`, a `composer.lock` written by install) are recorded and excluded via `:(exclude)` pathspecs in `changedFiles`/`diff`/`commitAll`. | Writing `info/exclude` (shared by all worktrees and the owner's checkout); trusting `.gitignore` (G1 false positives were eval item 2). |
| D9 | **Ecosystems recorded at create**: the server re-runs `detectProjectAt(placement.localPath)` and writes the row; a "Detect again" action refreshes it. Settings `ecosystems` is **not** seeded (keeps "empty = detect from diff"). | Trusting a client-sent list (any client could lie or omit it). |
| D10 | **Cancel cleans up fully**: every cancel path calls `stopCancelled()`; it removes the worktree, its prep record and the **local** branch of a cancelled ticket; removal falls back to `fs.rm` with retries, then `git worktree prune`. A first-tick sweep retries removal for terminal tickets. | Leaving branches "for history" (the card log and receipts keep the history). |

## Data model (zod in core; no DB migration)

- `core/src/schemas/project.ts`: `SetupStep = { name, command (trim, min 1), cwd?: RelativeDir, at_repo_root?: boolean,
  inputs: Glob[] (default []), env: Record<EnvName,string> (default {}), pass_env: EnvName[] (default []),
  path: RelativeDir[] (default []), timeout_minutes: int 1..120 (default 20) }`; `ProjectConfigShape.setup:
  z.array(SetupStep).max(10).optional()`, names unique. `path` = folders put first on PATH (when they exist) for later
  steps, gate checks and the Worker run env. `pass_env` names extra variables copied from the server env (registry tokens);
  values are never stored.
- `core/src/schemas/worktree-prep.ts`: `WorktreePrep = { key: Sha256Hex, status: 'ready'|'skipped', outputs: string[]
  (max 50), path: string[], steps: { name, exit_code, ms }[], at: iso }` (the record stored per worktree);
  `PrepPlan = { steps: SetupStep[], source: 'detected'|'settings' }`; `PrepOutcome = { ok: true, prep } | { ok: false,
  step, command, exit_code: int|null, timed_out, tail (≤ 4 KB), inputs_changed_by_worker: boolean }`.
- `core/src/schemas/escalation.ts`: `SetupCause` adds `{ type: 'worktree_setup', step, command, exit_code: int|null,
  timed_out, tail, settings_version: int }`; `ESCALATION_ACTIONS` adds `skip_setup`; `EscalationActBody` adds
  `{ action: 'skip_setup' }`. Mirror in `apps/web/src/schemas/escalation.ts`.
- Storage: settings are JSON versions (`config_versions`), the row column `ecosystems_json` exists (migration 0011), the
  prep record is a file `<worktreeRoot>/.forge-prep/<ticketId>.json` owned by the git adapter (outside every Worker cwd,
  so the outside-cwd floor denies it; removed with the worktree). **No migration needed** (next free id would be `0030`).

## Ecosystem table (defaults; first matching row per ecosystem wins; steps run in this order)

| Ecosystem / marker (project folder, else repo top → `at_repo_root`) | Setup command (frozen) | No-lockfile variant | `inputs` (prep key) | Outputs / PATH |
|---|---|---|---|---|
| any: `.gitmodules` | `git submodule update --init --recursive` | same | `.gitmodules` | none |
| node: `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` | — | lockfile, `package.json`, `pnpm-workspace.yaml` | `node_modules` |
| node: `yarn.lock` + `.yarnrc.yml` | `yarn install --immutable` | — | lockfile, `package.json` | `node_modules` / `.yarn` |
| node: `yarn.lock` | `yarn install --frozen-lockfile` | — | same | `node_modules` |
| node: `bun.lock` / `bun.lockb` | `bun install --frozen-lockfile` | — | lockfile, `package.json` | `node_modules` |
| node: `package-lock.json` / `npm-shrinkwrap.json` | `npm ci --no-audit --no-fund` | — | lockfile, `package.json` | `node_modules` |
| node: `package.json` only | — | `npm install --no-package-lock --no-audit --no-fund` | `package.json` | `node_modules` |
| python: `uv.lock` | `uv sync --frozen` | — | `uv.lock`, `pyproject.toml` | `.venv`; path `.venv/Scripts`, `.venv/bin` |
| python: `poetry.lock` | `poetry install --no-interaction` (env `POETRY_VIRTUALENVS_IN_PROJECT=true`) | — | lock, `pyproject.toml` | same |
| python: `Pipfile.lock` | `pipenv sync` (env `PIPENV_VENV_IN_PROJECT=1`) | — | `Pipfile*` | same |
| python: `requirements*.txt` | `python -m venv .venv` then `python -m pip install -r requirements.txt` (2nd step resolves the venv `python` via `path`) | same | `requirements*.txt` | same |
| python: `pyproject.toml` only | venv step then `python -m pip install -e .` | same | `pyproject.toml` | same |
| go: `go.mod` | `go mod download` (`go.sum` verifies) | same | `go.mod`, `go.sum` | none (global module cache) |
| rust: `Cargo.lock` | `cargo fetch --locked` | `cargo fetch` (`Cargo.toml` only) | `Cargo.toml`, `Cargo.lock` | none (`target/` built by checks, ignored) |
| dotnet: `packages.lock.json` | `dotnet restore --locked-mode` | `dotnet restore` (`*.sln`/`*.csproj`) | lock, `*.csproj`, `*.sln` | `obj/` (ignored) |
| ruby: `Gemfile.lock` | `bundle install` (env `BUNDLE_FROZEN=true`) | `bundle install` | `Gemfile*` | none (gem dir shared) |
| php: `composer.lock` | `composer install --no-interaction --no-progress` | same (writes `composer.lock`; excluded by D8) | `composer.*` | `vendor` |
| jvm (Maven/Gradle), cmake/make, no manifest | **no setup** (Maven/Gradle fetch during the check; C/C++ has no package step) | — | — | — |

"Already prepared" = the record exists, `status` is `ready` or `skipped`, and its `key` equals sha256(effective steps JSON +
each `inputs` file's bytes, sorted by path, missing files hashed as absent). Anything else runs setup again. Adding an
ecosystem = one row in `packages/gates/src/domain/ecosystems/setup-recipes.ts`; no other edit.

## Flow

1. `tryStart` (dispatch-run) and `startChecks` (dispatch-check) call `ensurePrepared(ctx, runtime, ticket, wt)` right after
   `worktrees.create`. Returns `ready` (start the run as today), `pending` (job started or running; return false; ticket
   stays `planned`; wait line `prep`), or `failed` (park with the setup escalation).
2. The job (`tick/prep-jobs.ts`, map `state.prepJobs` by ticket id) calls `runtime.prepare.prepare(wt.path, plan)`, then
   `requestTick`. Restart loses the job; the next dispatch reads the record and runs again if needed.
3. Gate jobs (`verify-gates.ts`) and stage script jobs call `prepare` (awaited, already off-tick) before the checks. If the
   key changed **and** the Worker's diff touches an `inputs` file and setup fails → a failed gate row `setup` with the tail
   (rework path). If the key is unchanged → no-op.
4. PATH folders from the record are added to the env of gate checks, script gates and the Worker `RunRequest.env`
   (`launch-run.ts`). The command resolver may resolve a first token only inside those listed folders (owner-visible).
5. No ecosystem detected and no settings → empty plan → `ready` at once, no job, no record, no error.

## Escalation copy (plain words, non-coding owner)

- Title: **"Forge could not get FR-3's workspace ready"**.
- Body: "Before a Worker starts, Forge makes a fresh copy of your project and installs what it needs. The step
  **Install packages** (`pnpm install --frozen-lockfile`) stopped with an error, so no Worker started and nothing was spent."
  Then one hint line: not found → "This computer does not have **pnpm**, or Forge cannot find it. Install it, or change the
  setup step."; timed out → "It ran longer than 20 minutes. Try again, or raise the time limit in the setup step.";
  else → "The last lines it printed are below." Collapsible "What it printed (last 40 lines)" with the tail.
- Buttons: **Try again** (`retry`), **Edit setup steps** (link `/p/<slug>/settings/checks#setup`), **Start without setup**
  (`skip_setup`; confirm: "The Worker starts without these packages. Checks that need them will likely fail."),
  **Cancel ticket**. Saving new setup steps resumes the ticket by itself (`isSetupFixed`: settings version newer than
  `settings_version`); the settled line says "Setup steps changed; trying again".
- Wait line while running: "Getting the workspace ready: Install packages (0:42)". Card log: one folded line
  "FR-3 workspace ready in 38 s" or "FR-3 workspace: setup skipped by owner".

## Files per package (layer rules respected; src only, tests listed below)

- **core** (pure): `schemas/project.ts` (SetupStep, `setup`), `schemas/worktree-prep.ts` (new), `schemas/escalation.ts`,
  `types/ports/worktree-prep.types.ts` (new: `WorktreePreparer { plan(worktreePath, config): Promise<PrepPlan>; prepare(worktreePath,
  plan, opts{baseSha}): Promise<PrepOutcome> }`), `types/ports/worktree.types.ts` (add `readPrep(path)`, `writePrep(path, rec)`,
  `remove(path, opts?: { deleteBranch?: string })`), `domain/escalation-actions.ts` (setup actions by cause:
  `worktree_setup` → retry, skip_setup, cancel), `domain/setup-fixed.ts`, `types/escalation.types.ts` (SetupFacts
  `setup_version`), `index.ts`.
- **git**: `adapters/git-cli/worktree-manager.ts` (prep record file, `:(exclude)` outputs in changedFiles/diff/commitAll,
  `remove` fallback + `branch -D`), maybe split `adapters/git-cli/worktree-prep-store.ts` (new, ≤300 lines rule).
- **gates**: `domain/ecosystems/setup-recipes.ts` (new table), `types/setup.types.ts` (new: SetupRecipe), `domain/detect-setup.ts`
  (new, pure), `domain/detect-project.ts` + `types/detect-project.types.ts` (return `setup`), `adapters/detect-project-at.ts`
  (repo-top fallback), `adapters/worktree-preparer.ts` (new: key, run steps, outputs diff via `git ls-files --others
  --exclude-standard --directory` before/after, tail), `shared/env.ts` (`pass_env`, PATH prepend), `index.ts`.
- **engine**: `tick/prep-jobs.ts` (new), `tick/dispatch-run.ts`, `tick/dispatch-check.ts`, `tick/verify-gates.ts`,
  `tick/launch-run.ts` (PATH env), `tick/dispatch-park.ts` (`parkForSetup`), `tick/escalation-act.ts` /
  `escalation-effects.ts` (`retry` reruns, `skip_setup` writes a `skipped` record then retries), `domain/escalation-copy.ts`,
  `domain/wait-reason.ts` + `types/pick-next.types.ts` (`prep`, slot counting in `pick-next.ts`), `types/engine-state.types.ts`,
  `types/verify.types.ts` (`ProjectRuntime.prepare?`), `tick/plan-to-tickets.ts` (`stopCancelled` after commit),
  `tick/ticket-cancel.ts` (delete branch), `tick/restart.ts` (one sweep).
- **apps/server**: `routes/projects.ts` (detect + record ecosystems), `routes/project-inspect.ts` (+ `GET
  /projects/:slug/detected` returning ecosystems, checks, setup; `POST …/detected` refreshes the row),
  `services/project-registry.ts` (wire `createWorktreePreparer({ worktrees, env: process.env })`), `schemas/api.ts`
  (`setup` in StartingSettings and settings PUT), `services/escalation-view.ts` if it maps actions.
- **apps/web**: `routes/project-settings/setup-editor.tsx` (new), `settings-form.tsx`, `domain/settings-draft.ts`,
  `types/project-settings.types.ts`, `routes/project-settings/project-section.tsx` ("Detect again"), `domain/escalation-copy.ts`,
  `components/escalation/escalation-card.tsx` (tail block, confirm), `schemas/escalation.ts`, `schemas/` project settings
  mirror, `components/onboarding/step-checks.tsx` + `domain/project-draft.ts` (show/send detected setup read-only).

## Web UI (describe only; builder runs hallmark + nielsen first)

Checks tab gets a **"Before each ticket"** section above the checks: rows of name, command, folder; an "Advanced" disclosure
per row for files that trigger a re-install (`inputs`), PATH folders, variables to pass, time limit. With no override it
shows the detected steps greyed with their source ("from pnpm-lock.yaml") and **Customise**; overridden shows **Use
detected**; a **No setup** toggle saves `[]`. Project tab: "Detected ecosystems: node" + **Detect again**. Wizard checks step:
one read-only line "Before each ticket Forge will run: pnpm install --frozen-lockfile" with "change later in settings".
Nielsen: #1 wait line + timer; #3 skip/cancel/use-detected; #5 confirm on skip, `[]` explicit; #9 hint + tail; #10 one-line
help under the section heading ("Workers cannot install packages, so Forge does it first").

## Tests

- core: SetupStep parse (relative cwd, unique names, bounds); escalation action table for `worktree_setup`; `isSetupFixed`
  on newer settings version (property test with the state machine kept green).
- gates: `detect-setup` table test over `any-language-fixtures` (every row above + none/cmake → `[]`, repo-top fallback);
  preparer with fake `runCommand`: skip on equal key, rerun on lockfile change, failure tail ≤ 4 KB, timeout, outputs
  recorded, `pass_env`/PATH, step order, stops at first failure.
- git: extend `__tests__/contract/worktree.contract.ts` (runs on real git + `helpers/fake-worktree.ts`): prep record round
  trip and removed with `remove`; recorded outputs hidden from changedFiles/diff/commitAll while a Worker file beside them is
  seen; `deleteBranch`; remove of a tree with a read-only file.
- engine (fake ports): pending prep → not started, wait `prep`, slot counted; failure → setup escalation with three actions,
  no run row; retry reruns; skip starts; settings change auto-resumes; empty plan starts at once; Worker-changed lockfile +
  failing setup → gate rework not escalation; plan replacement removes worktree + branch.
- server: POST /projects records detected ecosystems; GET/POST detected. web: setup editor states, escalation copy per new
  cause/action (existing "every enum has a sentence" test).
- heavy (one, `packages/gates`): real `npm ci` on a fixture with a `file:` dependency (offline), then a second prepare is a
  skip, then a lockfile edit reruns.

## Docs

READMEs of core, git, gates, engine, apps/server, apps/web (What it does, Requirements: tools on PATH, Limits). `PRODUCT.md`:
user flow ("Forge installs your project's packages before each ticket"), status, progress-log line. `docs/design/execution-plane.md`
§6 (replace `.worktreeinclude`), §8 (Prepare state before Spawn); `verification-plane.md` (G1 runs on a prepared tree; setup
gate row); `tool-system.md` (installs stay Worker-denied, Forge runs them). Memory: orchestrator writes `d-0176` (owner goal
in this request) and `outcomes/` entry.

## Build steps

1. **Core + git + gates** (~15 src): schemas, ports, escalation cause/action, worktree-manager prep record/excludes/remove,
   recipes, detection, preparer adapter, fake worktree, contract + unit tests, three READMEs. Gate: `pnpm check`.
2. **Engine + server** (~15 src): prep jobs, dispatch/check/verify wiring, PATH env, park + actions + copy, wait reason +
   slots, cancel cleanup + sweep, ecosystems on create, detected route, registry wiring, heavy test, READMEs.
   Gate: `pnpm check --heavy`.
3. **Web + docs** (~12 src): setup editor, detect again, escalation card/copy, wizard line, schemas mirror; design docs,
   `PRODUCT.md`. Gate: `pnpm check`; `pnpm -C apps/web build`; live check on 4310 with a Node and a Python demo repo.

## Risks

- Install scripts (npm `postinstall`, `setup.py`) run outside Worker policy with network. Same exposure G1 already has
  (it runs Worker-written tests); real fix is the sandbox (d-0161). Base-content setup runs the owner's own code.
- Disk: ~150 MB per Node worktree; D10 cleanup matters. Windows long paths in `node_modules`: removal fallback + `core.longpaths`.
- First run waits for the install (20-90 s cold, seconds warm with pnpm/uv). Visible via the wait line.
- Tool missing on PATH, private registries (`pass_env`), corporate proxies: all surface as setup escalations with the tail.
- PATH folders let a Worker-modified `.venv` binary run in checks; equal to today's `node_modules/.bin` exposure.

## Open questions (with recommended answers)

1. Let Workers add dependencies (non-frozen re-install, lockfile in diff)? **Rec: not now**; separate brief with G1 claim rules.
2. Share Rust `target/` across worktrees? **Rec: no** (lock contention, stale artefacts); revisit on measured cost.
3. "Test setup now" button in settings (temp worktree)? **Rec: yes, next UI pass**; the first ticket already reports clearly.
4. JVM defaults? **Rec: none**; Maven/Gradle fetch during checks; owner can add `mvn -B dependency:go-offline`.
5. Delete the remote branch / close the PR of a cancelled ticket? **Rec: local branch only here**; remote cleanup with the
   merge-conflict fix (eval item 4).
6. Limit concurrent installs? **Rec: no separate limit**; a preparing ticket holds its Worker slot (D5).
7. Seed settings `ecosystems` from detection? **Rec: no** (D9).
