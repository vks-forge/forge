# @forge/gates

The verification plane: independent gates that decide whether a Worker's ticket may move forward. G1 (claims, receipts, test integrity, project checks) is implemented; G2 to G6 and blast radius are not.

## Why it exists

Agents overclaim. A Worker's own summary ("I ran the tests, I edited X") is untrusted, and the Worker can also make a suite green by weakening it. The Director therefore needs checks that run outside the Worker's process and read only evidence the Worker cannot forge: the git diff, HMAC-chained tool receipts written by the hook, and the project's own commands re-run by the server. Without them a ticket reaches Review on a false claim, a deleted test or a loosened assertion. Gates are the independent half of the governing rule: Workers self-report, separate processes verify (d-0001). Design: `docs/design/verification-plane.md` §2.

## What it does

Public API (`src/index.ts`):

- `createG1Gate(deps: G1Deps): Gate` returns a core `Gate` named `G1`.
- `runShellCommand(req)` is the default command runner (`G1Deps.runCommand` seam).
- Types: `G1Deps`, `ToolCallRef`, `CommandRequest`, `CommandResult`, `RunCommand`.

`G1Deps`: `receipts: ReceiptLog`, `worktrees: Pick<WorktreeManager,'diff'>`, `listToolCalls(runId)`, `runSecret(runId): HmacKey | null`, `env`, and optional `runCommand`, `commandTimeoutMs` (default 10 min), `ignoreToolCall`, `now`.

G1 runs five checks and folds them into one `GateVerdict` (`failed` if any finding, else `error` if a check could not run, else `passed`; `report` is markdown, one section per check):

1. **chain**: `verifyChain` over the run's receipts under the run secret; every tool-call run event must have a decision receipt whose `id` equals the event's `call_id` (hook `tool_use_id` equals ACP `toolCallId`, d-0057). No secret, or a key too weak to verify with, is `error`, never `passed`.
2. **claims**: each `finish` claim needs evidence, else a finding quoting it.
   - `edited P`: allowed `edit`/`write` decision with a `mutation_committed` effect on P, and P is in the diff.
   - `read P`: allowed `read` decision with a `read_completed` effect on P.
   - `ran_tests`: allowed `shell` decision (effect `mutation_committed`, or `uncertain` for a run that failed) whose recorded resource contains `commands.test`. Match rule: split the resource on `;` (the policy's segment joiner), lower-case and collapse whitespace on both sides, substring match. No configured test command means the claim is unsupported.
   - `added_test N`: N appears on an added line of a test file in the diff.
   - Paths are folded (slashes, case, `./`, worktree prefix) before comparison.
3. **test-diff**: deleted test files, test files renamed to non-test paths, added `.skip`/`.only`/`.todo`/`xit(`/`xdescribe(`/`fit(`, more removed assertion lines (`expect(`, `assert`) than added, and `expect(X).strong` re-added as `expect(X).toBeDefined/toBeTruthy/...`.
4. **gate-config**: any change to `vitest.config.*`, `jest.config.*`, `eslint.config.*`, `.eslintrc*`, `tsconfig*.json`, `.prettierrc*`, or to a `package.json` script (or its `pre`/`post` hook) named by a project command.
5. **project-checks**: `commands.lint`, `typecheck`, `test` in the worktree, each with a timeout, env minus `FORGE_*`, last 4 KB of output in the report. Every defined command runs even after a failure. Under `profile: generic` `typecheck` is reported `skipped` with its reason (d-0034).

## Why this approach

- Evidence over assertion: claims are matched to HMAC-chained receipts and git's own diff; nothing the Worker writes is trusted.
- Every side effect is injected (receipt log, secret, spawner, clock, env), so the gate is tested with in-memory fakes and real receipts built by `@forge/tools`.
- Project commands are repo-owner config strings from `.forge/project.yaml`, often with pipes or `&&`, so they run through the platform shell (`shell: true`). They are never Worker input. On timeout the whole tree is killed (`taskkill /T /F` on Windows, process group elsewhere).
- Heuristics are deterministic and simple on purpose; a cleverer gate that sometimes guesses is worse than one that explains each finding.
- Rejected: pushing logic into the engine (it must stay IO-free, d-0058). Decisions: d-0001, d-0015, d-0033, d-0034, d-0052.

## Requirements

- Node 24; layer rule: imports `@forge/core` and `@forge/tools` only (d-0052).
- `G1Deps.runSecret` must return the per-run receipt secret the server holds in memory (d-0054).
- `ProjectConfig.commands` from `.forge/project.yaml`.
- Tests: `npx vitest run packages/gates`. `command-runner.test.ts` spawns real `node` processes.
- Coverage floor 80% lines (root `vitest.config.ts`).

## Extending

A new gate is a new `create<Gx>Gate(deps): Gate` in `src/domain/` over injected ports; reuse `CheckOutcome` and `renderReport`. A new G1 check is a function returning `CheckOutcome`, added to the list in `domain/g1-gate.ts`. A different process runner implements `RunCommand`.

## Limits

- Heuristics: the removed-assertion count is per file and ignores moves between files; matcher weakening only sees `expect(X).matcher` on the same subject text; `assert` counts any line containing the word. A cleverly rewritten weakening passes.
- `package.json` scripts are matched by key on changed lines, not by parsing the `scripts` object, so a same-named key elsewhere also trips it. Only scripts invoked as `npm|pnpm|yarn|bun [run] <name>` are known; a direct `vitest run` command has no script to guard.
- Truncating the tail of the chain is not detectable from the chain alone (the run record's final hash covers that, not G1).
- Receipt resources are lower-cased and the shell resource is cut at 200 characters by policy, so a test command longer than that cannot match.
- Forge's own MCP tools are expected to carry hook receipts; if a harness does not hook them, pass `ignoreToolCall`.
- Path comparison is case-insensitive (Windows); two files differing only by case are not told apart.
- G2 to G6 and blast radius: none yet. Red-before-green order (d-0015) is not checked.
