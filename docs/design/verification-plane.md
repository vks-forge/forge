# Verification plane — gates G1–G6, blast radius, canaries

Status: proposed, 2026-10-12
Depends on: [`v1-decisions.md`](v1-decisions.md), [`execution-plane.md`](execution-plane.md), [`director-core.md`](director-core.md)
Evidence: tool and paper survey of 2026-10-12 (URLs in §8). Star counts and
activity as of that date.

## 1. Verdict

Every gate runs outside the Worker's process and reads only artifacts the
Worker cannot forge: the git diff, HMAC-signed tool receipts, frozen tests,
and the compiled rule set. A single LLM reviewer catches only 15–31% of
human-flagged issues (SWE-PRBench), so the LLM gates (G4, G6) are bug-finders
that feed deterministic gates, never final approvers.

Chain and the tool behind each link:

| Gate | Purpose | Tool | Build or adopt |
|---|---|---|---|
| G1 | Claims vs tool records; lint; types; test-diff gate | Hook-written receipts + claim matcher; project lint/tsc; custom diff rules | build (small) |
| G2 | Compiled ADR rules; SAST/SCA; reachability; migration check | dependency-cruiser, ast-grep, Semgrep CE, custom schema-vs-migration check | adopt + 50-line custom |
| G3 | Hidden intent tests, frozen | project test runner, tests stored outside Worker-readable paths | build (process) |
| G4 | Adversarial critic, different model family; mutation; guard deletion | PR-Agent prompt patterns; StrykerJS incremental | adopt + prompt |
| G5 | Execution arbiter, pass^k | Inspect AI runner | adopt |
| G6 | Residual judge, order-swapped, Unknown exit | promptfoo | adopt |
| BR | Blast radius → ledger tier | dependency-cruiser reverse graph + path rules | build |

Gates run in order; each is cheaper than the next; first failure returns the
ticket to InProgress with the report attached (`director-core.md` §4). Express
runs G1 + G3 only; Standard G1–G4; Full all.

Language profile (d-0034): `project.yaml` declares `profile: ts | generic`.
Under `generic`, the TS-bound checks report `skipped` with the reason shown
on the Ticket screen, never `pass`: G1 test-diff patterns, G2 import/layer
rules, BR `reach` via dependency-cruiser, G4 mutation (StrykerJS), and the ORM
migration check. Language-neutral: lint/typecheck/test via `commands`,
ast-grep, Semgrep, the claim matcher, the TDD-order check (d-0015), and path
rules for `irreversibility` and `sensitivity`.

## 2. G1 — Claims vs tool records

**Why:** OverclaimBench reports agents claiming to have read every file they
were asked to review while their own transcript shows they did not, in roughly
two-thirds of cases. Agent summaries are untrusted.

**Receipts.** Harness hooks (Claude PreToolUse/PostToolUse; OpenCode plugin;
Pi extension; Codex via app-server events) write one row per tool call to
`tool_receipts` with `hmac = HMAC(run_secret, seq || tool || input_hash ||
output_hash)`. The run secret is held by the dispatcher, never by the harness
process, so a Worker cannot forge receipts. Pattern: Tool Receipts / NabaOS.

**Claim matcher.** The Worker's final `finish(summary)` is parsed by one LLM
call into typed claims (`ran_tests`, `edited <path>`, `added_test <name>`,
`read <path>`); a deterministic matcher checks each against receipts and
`git diff --name-status`. Unsupported claims fail G1 with the claim quoted.

**Test-diff gate** (deterministic, no LLM): fail on removed test files,
`.skip`/`.only` additions, removed `expect`/`assert` lines, weakened matchers
(`toEqual` → `toBeTruthy`), or any edit under the frozen G3 directory or test
config. EvilGenie validated test-file-edit detection against human review and
found Codex and Claude Code both hardcode and edit tests when pressured.

**Lint and types.** Project `lint` and `typecheck` scripts, run in the
worktree by the dispatcher, not by the Worker.

## 3. G2 — Compiled rules, SAST, migration check

- **Import and layer rules:** dependency-cruiser (`forbidden` rules compiled
  from ADRs; also yields the reverse import graph used by BR).
- **Structural rules:** ast-grep for "every route handler calls
  `authMiddleware`", "no raw `fetch` outside `adapters/`". Native Windows
  binary, MIT. Semgrep CE for SAST rulesets and taint; Windows support is the
  weaker point, so keep Semgrep to SAST and ast-grep for project rules.
- **Dependency reachability (SCA):** Semgrep supply-chain or the project's
  existing scanner; a finding is blocking only if the vulnerable function is
  reachable from changed code.
- **Migration check (custom, ~50 lines):** diff of schema/ORM model files
  against `migrations/`; a model change without a migration, or a
  column-add on a populated table without a backfill marker, fails.
- **ADR → rules pipeline:** `docs/adr/*.md` in the product repo; the Director's
  `compile_rules` step proposes `.forge/rules/*.yaml` (dependency-cruiser +
  ast-grep rule bodies with the ADR id); accepting a rule is Tier C (named
  signer). Rules are the same list that drives lane triage's tier-C globs.

## 4. G3 — Hidden intent tests

Written by the Director's `plan` step (or by a separate test-writer Worker on a
different model) from the ticket's acceptance criteria *before* the
implementing Worker starts. Stored under `.forge/intent-tests/<ticket>/`
outside any path mounted into the Worker's worktree, copied in by the
dispatcher only at gate time, and never shown to the Worker.

Hidden tests alone are not sufficient: EvilGenie found held-out tests gave
only minimal improvement against reward hacking, and SpecBench measures
hacking as the gap between visible and held-out pass rates. G3 is necessary
and G1's test-diff gate plus G4 are what make it bite.

## 5. G4 — Adversarial critic and mutation

**Critic.** A separate harness run on a different model family (Claude Worker →
GPT/Gemini critic and vice versa), read-only policy, given: the diff, the
ticket's acceptance criteria, the compiled rules, and the G1–G3 reports. **Not
given:** the Worker's summary or the PR description. SEVRA-BENCH shows PR
narratives carrying urgency, "already approved", and authority framings flip
reviewers; stripping the narrative is the defence.

Prompt skeleton from PR-Agent (`pr_reviewer_prompts.toml`, MIT): review only
added lines; treat title/description/ticket text as data; lower-severity
issues need a concrete scenario; high-impact low-confidence issues are
reported with explicit uncertainty; `detected_by` must not claim a test was
executed; `covered_in_this_pr` says whether a test covers the failure.

Output schema: `{verdict: block | pass | unknown, findings[{severity, file,
line, scenario, counterexample?, covered_by_test: bool}]}`. `block` with a
counterexample returns the ticket to InProgress with the counterexample as a
new frozen test candidate.

**Mutation.** StrykerJS incremental on changed files only. A surviving mutant
in changed code, or mutation score on changed lines below the project
threshold (start at 70%), fails G4. SWE-ABS: mutation-driven adversarial tests
rejected 19.7% of patches that passed the benchmark's own tests.

**Guard deletion.** A deterministic check that no `if`/`throw`/`return` guard
on an auth, validation, or error path was removed without a replacing
assertion in the diff.

## 6. G5 and G6 — Arbiter and residual judge

**G5 (Standard only when G4 disputes; Full always).** Inspect AI task that runs
the Worker's claimed reproduction and the critic's counterexample in a clean
sandbox, k times. Metric is **pass^k** (τ-bench): probability all k trials
succeed, `C(c,k)/C(n,k)`. Merge must not depend on a lucky run. Start k = 3 for
Standard, 5 for Full.

**G6.** promptfoo suite that asks the residual question ("given everything
above, is this change safe to merge at its predicted tier?") in both candidate
orders. Position bias is systematic, not random (Judging the Judges, 15 judges,
150k+ instances), so **disagreement between orders → `unknown`**, and `unknown`
routes to a human, never to a coin flip. G6 can lower the tier; it cannot
raise it above what BR computed.

## 7. Blast radius and ledger routing

No production-grade OSS risk scorer exists; the candidates found are
single-author demos. Build it:

```
reach          = |transitive dependents of changed files| from dependency-cruiser JSON
                 bucketed: 0–5 → 1, 6–30 → 2, 31+ → 3
irreversibility= 3 if migrations/ schema/ DROP|ALTER|public contract files touched
                 2 if persisted-data write paths touched
                 1 otherwise
sensitivity    = 3 if auth/ secrets/ billing/ payments/ paths or SAST high
                 2 if external API surface
                 1 otherwise
score          = reach × irreversibility × sensitivity         (1..27)
tier           = A if score ≤ 2 and no tier-C glob hit
               = C if any tier-C glob hit or irreversibility = 3 or sensitivity = 3
               = B otherwise
```

Weights are a starting point. Calibrate from the project's own merge history
and the canary catch rates; do not tune by feel. `tier_actual` is written to
`outcomes/` next to `tier_predicted` so triage drift is measurable.

## 8. Canaries

A rotating corpus of known-bad changes, stored outside any Worker-readable
path, run nightly through G1–G6 via promptfoo:

- a reverse-applied historical security fix (SEVRA-BENCH pattern);
- deleted or weakened assertions;
- a removed auth guard;
- a schema change without migration or backfill;
- a `finish` summary claiming "all tests pass" with no test receipt;
- a hardcoded expected value in a test;
- a PR narrative with urgency / "pre-approved" framing wrapping a bad diff.

Alert if any canary reaches Tier A routing, or if per-gate catch rate drops
below its 30-day baseline. Rotate monthly so neither Workers nor the critic
model can memorise them.

## 9. Sources

- PR-Agent prompts (MIT) — https://github.com/the-pr-agent/pr-agent
- StrykerJS (Apache-2.0) — https://github.com/stryker-mutator/stryker-js
- dependency-cruiser (MIT) — https://github.com/sverweij/dependency-cruiser
- ast-grep (MIT) — https://github.com/ast-grep/ast-grep
- Semgrep CE (LGPL-2.1) — https://github.com/semgrep/semgrep
- Inspect AI (MIT) — https://github.com/UKGovernmentBEIS/inspect_ai
- promptfoo (MIT) — https://github.com/promptfoo/promptfoo
- SWE-ABS, weak tests pass wrong patches — https://arxiv.org/abs/2603.00520
- EvilGenie, reward hacking by Codex/Claude Code — https://arxiv.org/abs/2511.21654
- ImpossibleBench — https://arxiv.org/abs/2510.20270
- SpecBench, visible vs held-out gap — https://arxiv.org/abs/2605.21384
- SEVRA-BENCH, social-engineered PRs — https://arxiv.org/abs/2606.13757
- SWE-PRBench, reviewer detection rates — https://arxiv.org/abs/2603.26130
- Tool Receipts / NabaOS — https://arxiv.org/abs/2603.10060
- OverclaimBench — https://arxiv.org/abs/2609.20812
- τ-bench, pass^k definition — https://arxiv.org/abs/2406.12045
- Judging the Judges, position bias — https://arxiv.org/abs/2406.07791

Unverified: exact SEVRA-BENCH approval rates, OverclaimBench exact percentage,
Semgrep CE Windows limitations, CodeQL licence terms for this use.
