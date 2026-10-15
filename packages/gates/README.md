# @forge/gates

The verification plane: independent gates that decide whether a Worker's ticket may move forward. G1 (claims, receipts, test integrity, project checks) is implemented; G2 to G6 and blast radius are not.

## Why it exists

Agents overclaim. A Worker's own summary ("I ran the tests, I edited X") is untrusted, and the Worker can also make a suite green by weakening it. The Director therefore needs checks that run outside the Worker's process and read only evidence the Worker cannot forge: the git diff, HMAC-chained tool receipts written by the hook, and the project's own commands re-run by the server. Without them a ticket reaches Review on a false claim, a deleted test or a loosened assertion. Gates are the independent half of the governing rule: Workers self-report, separate processes verify (d-0001). Design: `docs/design/verification-plane.md` §2.

## What it does

Public API (`src/index.ts`):

- `createG1Gate(deps: G1Deps): Gate` returns a core `Gate` named `G1`. It pairs the pure `buildG1Gate` (domain, `runCommand` required) with the real spawner; the domain never imports an adapter.
- `runShellCommand(req)` is the default command runner (`G1Deps.runCommand` seam).
- `createFileReportStore(dataDir)` is the core `ReportStore` on disk: `<dataDir>/runs/<runId>/gates/<name>.md`, written under a temp name and linked into place (atomic), never overwriting (a taken name gets `-2`, `-3`, ...), run id and name checked against a strict pattern. The engine names a report `<gate>-<head sha>`. `createStorageToolCallLister(storage)` is G1's `listToolCalls` over the stored `tool_call` run events. `createStorageEarlierRuns(storage)` is G1's `earlierRunIds`: the ticket's runs that started before the one being gated.
- Types: `G1Deps`, `ToolCallRef`, `CommandRequest`, `CommandResult`, `RunCommand`.

`G1Deps`: `receipts: ReceiptLog`, `worktrees: Pick<WorktreeManager,'diff'>`, `listToolCalls(runId)`, `runSecrets(runId, generation): Promise<HmacKey | null>`, `env`, and optional `earlierRunIds(run)` (receipts of those runs back `edited` claims only, so a rework run can claim edits an earlier run made; `ran_tests`, `read` and `added_test` need the run's own evidence; the verified chain stays the run's own), `passEnv` (extra env names for project commands), `runCommand`, `commandTimeoutMs` (default 10 min), `ignoreToolCall`, `now`.

G1 runs five checks and folds them into one `GateVerdict` (`failed` if any finding, else `error` if a check could not run, else `passed`; `report` is markdown, one section per check):

1. **chain**: `verifyGenerations` over the run's receipts, one segment per secret generation (d-0100): a run resumed after a server restart (d-0092) has one `resumed` receipt per resume, linking to the last receipt before it and signed with the new generation's secret. G1 asks `runSecrets(runId, g)` for every generation `1..N` (N = the larger of the run row's `generation` and the generations the chain records), verifies each segment under its own secret and the links between them, and requires the chain's generation count to equal the run's, so a cut-out segment or a missing `resumed` link is a finding ("Receipt chain broken at index i" or "Run reached generation R but its receipt chain records G"). Every tool-call run event must have a decision receipt whose `id` equals the event's `call_id` (hook `tool_use_id` equals ACP `toolCallId`, d-0057). A key too weak to verify with is `error`, never `passed`. A missing secret of any generation (for example a run past the registry's retirement, or a wiped secret store) is `failed` with the finding "Receipt chain unverifiable: the run secret of generation N is gone; re-running the ticket.": an `error` would park the ticket and unparking would hit the same missing secret for ever, while a failed gate sends it to rework, which starts a fresh run with a fresh secret.
2. **claims**: each `finish` claim needs evidence, else a finding quoting it.
   - `edited P`: allowed `edit`/`write` decision with a `mutation_committed` effect on P, and P is in the diff. The decision may come from an earlier run of the ticket (rework); no other claim kind accepts earlier-run receipts.
   - `read P`: allowed `read` decision with a `read_completed` effect on P.
   - `ran_tests`: allowed `shell` decision (effect `mutation_committed`, or `uncertain` for a run that failed; the report notes when only a failed run backs the claim) with a segment that starts with the command of ANY test-role check (`checks` with `role: test`). Match rule: split the resource on `;`, `&&`, `||`, lower-case and collapse whitespace, ignore leading `NAME=value`; the segment must equal the command or continue it after a space, must not be piped, and must not carry `--help`, `-h` or `--version`. So `echo pnpm test` and `git commit -m "pnpm test"` do not count. No test-role check (or an empty command, which never matches) means the claim is unsupported.
   - `added_test N`: an added line of a test file (by the active ecosystems' test patterns, or a file whose changed lines carry a test marker such as Rust `#[cfg(test)]`) declares a test (`it(`, `def test_x`, `func TestX`, `fn x`, `@DisplayName`, `TEST(S, N)`, ...; per-ecosystem regexes) and its title or name contains N. Comments and strings do not count.
   - Paths are folded (slashes, case, `./`, worktree prefix) before comparison.
   - Coverage: a non-empty diff with no claims is a finding ("finish carried no claims for N changed files"); every changed file except lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`, `Cargo.lock`, `poetry.lock`) and deletions must be named by an `edited` claim, else one finding lists them.
3. **test-diff**: deleted test files, test files renamed to non-test paths, added skip/ignore/focus markers of the active ecosystems (node `.skip`/`.only`/`xit(`; python `@pytest.mark.skip`/`xfail`; go `t.Skip`; rust `#[ignore]`; jvm `@Disabled`/`@Ignore`; dotnet `[Ignore]`/`Skip =`; ruby `xit`/`pending`; php `markTestSkipped`; cmake `DISABLED_`), more removed assertion lines than added (per-ecosystem assertion regexes), and, for node, `expect(X).strong` re-added as `expect(X).toBeDefined/toBeTruthy/...`. It fails closed: a test file git printed as `Binary files ... differ` (what a Worker-written `.gitattributes -diff` produces), or a `diff --git` header the parser cannot read, is a finding.
4. **gate-config**: any change to a gate configuration file of an active ecosystem (node: `vitest.config.*`, `eslint.config.*`, `tsconfig*.json`, `.npmrc`, ...; python: `pyproject.toml`, `setup.cfg`, `tox.ini`, `pytest.ini`, `conftest.py`, `mypy.ini`, `ruff.toml`, ...; go: `.golangci.*`; rust: `rustfmt.toml`, `clippy.toml`, `.cargo/config.toml`; jvm: Checkstyle, Spotless, Detekt, PMD files; dotnet: `Directory.Build.props`, `.editorconfig`, `*.runsettings`; ruby: `.rubocop.yml`, `.rspec`, `Rakefile`; php: `phpunit.xml`, `phpcs.xml`, `phpstan.neon`; cmake: `CMakePresets.json`, `CTestTestfile.cmake`, `.clang-tidy`), a project `gate_rules.config_globs` entry, or a file that steers every stack (`.gitattributes`, `Makefile`, `justfile`). Dependency manifests (`go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`, `composer.json`) are deliberately not guarded; any added or modified `*.cmd|*.bat|*.exe|*.ps1|*.com` anywhere in the diff; or a `package.json` script (or its `pre`/`post` hook) named by a check command. The script name is parsed from the invocation: flags and the values of `--filter`, `-F`, `--dir`, `-C`, `--prefix`, `--workspace`, `--cwd` are skipped (`-w` is read both ways, as npm and pnpm differ), then `run <name>` or a bare `<name>`.
5. **project-checks**: every entry of the project's `checks` list in list order, whatever its role (test, lint, typecheck, build, format, custom), in the worktree or its `cwd`, each with a timeout, last 4 KB of output in the report and the last 1500 characters in the finding message (the rework prompt must say why). The finding's `check` is `project:<name>`. Every check runs even after a failure. A role the project did not configure is absent from the report, never skipped or passed. An empty command or a `cwd` outside the worktree is a finding and nothing runs (fail closed).

Which ecosystems' rules apply (`domain/gate-rules.ts`): the project's `ecosystems` if it names any Forge knows; otherwise the ones detected from the diff's paths and the check commands' first words; if nothing is detected, all of them (so detection can only narrow the guard when it is sure). Data lives one file per ecosystem in `domain/ecosystems/` (node, python, go, rust, jvm, dotnet, ruby, php, cmake) plus `common.ts` for files that blind every gate. A project's `gate_rules` (`config_globs`, `test_globs`, `skip_patterns`, `replace`) adds to that data, or replaces a non-empty list when `replace` is set; `.gitattributes`, `Makefile` and `justfile` stay guarded either way.

- The environment is an allowlist (`PATH`, `PATHEXT`, `SystemRoot`, `ComSpec`, `TEMP`, `HOME`, `USERPROFILE`, `APPDATA`, ... see `shared/env.ts`) plus `G1Deps.passEnv`; `CI=1` and `NoDefaultCurrentDirectoryInExePath=1` are forced. `ANTHROPIC_API_KEY`, `GH_TOKEN` and `FORGE_*` never reach the child.
- The command's first token is resolved to an absolute executable through PATH and PATHEXT only, never the cwd, and refused (the check is `error`) if it is not found or lies inside the worktree. cmd.exe would otherwise run a Worker-committed `pnpm.cmd` from the cwd.

## Why this approach

- Evidence over assertion: claims are matched to HMAC-chained receipts and git's own diff; nothing the Worker writes is trusted.
- Every side effect is injected (receipt log, secret, spawner, clock, env), so the gate is tested with in-memory fakes and real receipts built by `@forge/tools`.
- Project commands are repo-owner config strings from `.forge/project.yaml`, often with pipes or `&&`, so they run through the platform shell (`shell: true`) with the first token pre-resolved (see check 5). They are never Worker input. On timeout the whole tree is killed (`taskkill /T /F` on Windows, process group elsewhere).
- Heuristics are deterministic and simple on purpose; a cleverer gate that sometimes guesses is worse than one that explains each finding.
- Rejected: pushing logic into the engine (it must stay IO-free, d-0058). Decisions: d-0001, d-0015, d-0033, d-0052, d-0095 (checks by role and per-ecosystem rules; supersedes d-0034).

## Requirements

- Node 24; layer rule: imports `@forge/core` and `@forge/tools` only (d-0052).
- `G1Deps.runSecrets(runId, generation)` must return that generation's receipt secret, which the server keeps in the SecretStore until the run is retired (d-0100); the server keeps a successful run's secrets until its ticket has left the gates.
- `ProjectConfig.checks`, `ecosystems` and optional `gate_rules` from the project settings (the old `profile` + `commands` form is converted by `@forge/core` when settings are read).
- Tests: `npx vitest run packages/gates`. `command-runner.test.ts` spawns real `node` processes (30 s per-case timeout for full-suite load).
- The diff handed to G1 must come from a `WorktreeManager.diff` that passes `--text` and `-c core.quotePath=false` (`@forge/git` does).
- Coverage floor 80% lines (root `vitest.config.ts`).

## Extending

A new gate is a new `create<Gx>Gate(deps): Gate` in `src/domain/` over injected ports; reuse `CheckOutcome` and `renderReport`. A new G1 check is a function returning `CheckOutcome`, added to the list in `domain/g1-gate.ts`. A different process runner implements `RunCommand`.

## Limits

- Heuristics: the removed-assertion count is per file and ignores moves between files; matcher weakening only sees `expect(X).matcher` on the same subject text; `assert` counts any line containing the word. A cleverly rewritten weakening passes.
- `package.json` scripts are matched by key on changed lines, not by parsing the `scripts` object, so a same-named key elsewhere also trips it. Only scripts invoked as `npm|pnpm|yarn|bun [run] <name>` are known; a direct `vitest run` command has no script to guard.
- Ecosystem rules are regex and glob heuristics per language, not parsers: a Ruby `skip` or a Python `@pytest.mark.skipif` is flagged by its text, a test silenced by another mechanism (a build-file exclude, a runtime flag) is not. Rust test modules are recognised by changed lines (`#[cfg(test)]`, `#[test]`, `#[ignore]`), so an edit inside an untouched module is judged by its path only. Onboarding detection from repo root files is not built; detection uses the diff and the check commands.
- Truncating the tail of the chain is not detectable from the chain alone (the run record's final hash covers that, not G1).
- Receipt resources are lower-cased and the shell resource is cut at 200 characters by policy, so a test command longer than that cannot match.
- Forge's own MCP tools are expected to carry hook receipts; if a harness does not hook them, pass `ignoreToolCall`.
- Path comparison is case-insensitive (Windows); two files differing only by case are not told apart.
- G2 to G6 and blast radius: none yet. Red-before-green order (d-0015) is not checked.
- Residual risk: project checks execute Worker-written code (tests, scripts) as the server's Windows user. The env allowlist and the executable resolution narrow what leaks and what can be swapped, but same-user files and DPAPI blobs (`forge secret wrap`) are reachable by that code. Real isolation needs the container/WSL lane (d-0005); until then a passing G1 is evidence about behaviour, not a sandbox.
- Command resolution pins only the first token of a command line; later segments (`a && b`) are resolved by cmd.exe with `NoDefaultCurrentDirectoryInExePath=1`, and any added `*.cmd|*.bat|*.exe|*.ps1|*.com` is a finding. Shell builtins (`cd`, `echo`, `set`, ...) and `NAME=value` prefixes pass through unresolved.
- Earlier-run receipts are not tied to a commit: an `edited` claim backed only by an earlier run's edit passes if the path is in the current diff, even if a later run changed that file again. The rework run must re-run tests itself for `ran_tests`.
- Coverage: deleted files cannot be backed by an edit receipt, so they are exempt from the `edited` claim requirement (test deletions are still caught by test-diff). Files a Worker generates through the shell and leaves untracked need an `edited` claim too.
- With `--text` a real binary file appears in the patch as text; the parser only inspects test and config paths, so this costs size, not correctness.
