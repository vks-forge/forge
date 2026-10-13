# @forge/gates

The verification plane: independent checks (G1 to G6, blast radius) that decide whether a Worker's ticket may move forward. Not implemented yet; this package has only a `package.json`.

## Why it exists

Agents overclaim. A Worker's own summary ("I ran the tests, I read every file") is untrusted, and a single LLM reviewer catches only a minority of human-flagged issues. The Director therefore needs checks that run outside the Worker's process and read only artifacts the Worker cannot forge: the git diff, HMAC-signed tool receipts, frozen tests and a compiled rule set. Without them a ticket could reach Review on a false claim, a deleted test or a weakened assertion. Gates are the independent half of the governing rule: Workers self-report, separate processes verify (d-0001). Design: `docs/design/verification-plane.md`.

## What it does

Intended role, from the design (none of it exists yet):

- G1 compares the Worker's typed claims (`ran_tests`, `edited <path>`, `added_test`, `read <path>`) with tool receipts and `git diff --name-status`, runs lint and types, and applies a deterministic test-diff gate (removed tests, `.skip` / `.only`, weakened matchers, edits to frozen tests). It also checks red-before-green order for major work (d-0015).
- G2 compiled ADR rules, SAST/SCA and a migration check; G3 frozen hidden intent tests; G4 adversarial critic and mutation testing; G5 execution arbiter; G6 residual judge. Blast radius (BR) maps a diff to a ledger tier.
- Lane selects the chain: Express runs G1 and G3, Standard G1 to G4, Full all. First failure returns the ticket to InProgress with the report attached.
- Under `profile: generic` (d-0034), TS-bound checks report `skipped` with a reason, never `pass`.
- Verdicts are stored in `gate_results` (table already created in `@forge/db`).

Public API: none yet.

## Why this approach

- Gates run as separate processes over unforgeable evidence, because Worker self-reports are untrusted. LLM gates (G4, G6) are bug-finders that feed deterministic gates, never final approvers.
- Each gate is cheaper than the next and the chain stops at the first failure.
- Dependencies: none yet. The design proposes adopting dependency-cruiser, ast-grep, Semgrep CE, StrykerJS, Inspect AI and promptfoo and building G1 and BR; these are proposals, not pinned.
- Decisions: d-0001 (independent gates), d-0006 (lanes), d-0015 (TDD order), d-0034 (profiles).

## Requirements

- No TypeScript exists yet, so there is no `tsconfig.json` and the root `tsconfig.json` has no reference to this package. The first source file must add `tsconfig.json` and `tsconfig.test.json` (copy `packages/tools`) and add both to the root `references`; the root `vitest.config.ts` coverage include and threshold need an entry too.
- Node 24.20 and pnpm. Nothing else is required today: no source, no tests, no env vars.
- Intended inputs: `tool_decisions` / `tool_effects` receipts and the run secret held by the dispatcher (see `@forge/tools`), and the project's `commands` in `project.yaml`.
- Build and test follow the root scripts (`pnpm build`, `pnpm test`) once source exists.

## Extending

Follow the standard package skeleton: `src/index.ts`, `src/schemas/`, `src/types/`, `src/domain/` (pure gate logic), `src/adapters/` (one folder per external tool), `__tests__/` mirroring `src/`, headers on every file. One interface for a gate, many implementations, with a contract test run against each.

## Limits

- Not implemented yet: no source, no gates, no exported API, no tests.
- `none yet` for dependencies, env vars and configuration.
