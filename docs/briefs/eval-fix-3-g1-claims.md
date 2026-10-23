# Eval fix 3 — G1 claims false positives, unverifiable earlier runs, turn-limit diagnosis (builder brief)

Status: **draft, needs owner approval** · 2026-10-20 · Source: `docs/reports/2026-10-20-forge-usefulness-eval.md`,
`docs/reports/2026-10-20-eval/forge.json` bugs "G1 claims check false positives across pipeline stages", "Run that errors
(turn limit) leaves edits no later run can vouch for", "Turn-limit hit shown as 'unknown'". Evidence was re-read from the
eval instance (G1 reports under `forge-home/runs/*/gates/`, `tool_decisions`/`tool_effects`/`run_events` rows), HEAD `81b645b`.
Rests on d-0015, d-0033, d-0071/d-0165/d-0173, d-0072, d-0100, d-0117, d-0135, rule 9 (config is UI data). No `rejected/`
record covers this. **Language-neutral:** nothing below names a language; test-name matching works through the per-ecosystem
`declarations` data, read-evidence through the tool catalogue's `risk: read`.

## What actually failed (all 10 G1 failures, re-classified)

| Run (ticket) | Finding | Class |
|---|---|---|
| 9bd770 (FR-1), 7662f7 (FR-2) | typecheck TS2688 only | deps (eval-fix-1) |
| ceb149 (FR-2) | typecheck **and** 7× `added_test "shelf add rejects …"` **and** `read package.json` | deps + B + A |
| 1d20c6 (FR-1) | `read package.json`, `read tsconfig.json` | **A** |
| 335288 (FR-15) | `read src/store.ts` | **C** |
| 34aed0 (FR-14) | `read test/cli.test.ts` | **C** |
| 7cfef9, 24281d, cb0381 (FR-11) | `edited src/cli.ts`: no edit receipt | **D** |
| 6214ef (FR-11) | `src/cli.ts` not covered; earlier runs f6da59, a1c85e "run secret of generation 1 is gone" | **D** |

So the 7 claims-only failures are 4×D, 2×C, 1×A. Pipeline stages are not the cause: G1 already reads every run of the
ticket that started no later, test-writer included (`packages/gates/src/adapters/storage-earlier-runs.ts:27-32`), and FR-2's
test-writer edits were covered ("test/cli.test.ts covered by … earlier run run-7be11b…", report of 7662f7).

## Root causes (file:line)

**A — paused runs lose their secret.** A run that pauses for an owner answer or tool approval is stored `settled`
(`packages/engine/src/domain/results.ts:38-39`). The retirement sweep treats every non-`success` ended run as over
(`apps/server/src/services/secret-retirement.ts:45-51`) and deletes its secrets (`packages/hooks/src/server/run-secrets.ts:78-83`).
The next run continues the **same harness session** (FR-1 runs 1ed2cb → 83dc34 → 1d20c6 share session `adc2c798`), so the
Worker truthfully remembers reading `package.json` in 1ed2cb, but that chain is now unverifiable and is set aside
(`packages/gates/src/domain/earlier-runs.ts:251-256`); its read receipts back nothing (`claim-check.ts:303-308`).

**B — suite-qualified test names.** The claim was `"shelf add rejects an empty title"` (the runner's full name: `describe("shelf add")`
+ `it("rejects an empty title")`). The node declaration regex captures only the `it(` title
(`packages/gates/src/domain/ecosystems/node.ts:62-64`) and `declaresTest` requires `title.includes(name)`
(`packages/gates/src/domain/test-files.ts:50-54`): the title is shorter than the name, so it never matches. The `describe` line was
not even added (it existed). Same shape in every ecosystem with grouping (`Class::test_x`, `Mod::test`, `Class.method`).
The tool text never says which name to give (`packages/mcp/src/domain/tools/finish.ts:21`, `packages/engine/src/domain/worker-contract.ts:24`).

**C — search reads do not count.** A `read P` claim needs tool `read` on exactly P (`claim-check.ts:265-274` →
`receipt-calls.ts:327-343`). FR-14 only ran `grep` on `test` (a folder); FR-15's implementer ran `grep` on `src`, its
test-writer `grep` on `src/store.ts`. Any catalogue tool with `risk: read` already ends `read_completed`
(`packages/hooks/src/server/tool-resolver.ts:47-54`), so the evidence exists; the matcher ignores it.

**D — ended-by-error runs lose their secret (problem 2).** FR-11's implementer f6da59 edited `src/cli.ts` (4 committed edit
receipts) and ended `error` (turn limit). Same sweep line as A deletes its secrets. Every later run either claims `edited
src/cli.ts` with no receipt of its own (`claim-check.ts:250-259`) or drops the claim and fails coverage
(`claim-coverage.ts:69-100`). A rework cannot help: the file stays in the branch, the evidence never comes back. Note d-0100
says secrets are deleted "when the run settles"; the code already keeps `success` runs until the ticket closes. A `max_turns`
run (once problem 3 is fixed) hits the same line.

**E — turn limit read as unknown (problem 3).** The ACP adapter rejects `session/prompt` with
`Internal error: Reached maximum number of turns (3)` (eval `run_events` seq 20/63). `classifyRejection` falls through to
`classifyText` (`packages/drivers/src/domain/failure-classify.ts:195`), whose `TURNS = /error_max_turns|max(imum)?.?turns?/i`
(`:50`) allows one character between "maximum" and "turns", so "maximum number of turns" misses and the end is `unknown`
→ `error/unknown` (`packages/drivers/src/domain/run-result.ts:37`). The engine then retries it once as a crash-like unknown
(`packages/engine/src/domain/failure-policy.ts:78-89`, a wasted run a1c85e that hit the limit again in 32 s) and parks with
"unknown: failed 2 times (retry limit 1)". The `max_turns` road already exists downstream (`failure-policy.ts:32-34`,
`core/src/domain/escalation-classify.ts:64`, `escalation-actions.ts` `max_turns: RETRYABLE`, web title "ran out of turns"),
but no payload names the limit or where to change it, and the Director's recover step gets no error text at all
(`packages/engine/src/tick/escalation-recover-step.ts:98-103` sends cause, summary, attempts, family only) — hence "gave no error text".

## Fixes

**F-A/F-D (prevention): keep every ended run's secrets while its ticket is open.** `secret-retirement.ts` `isOver`: a run
is over when it is gone, or ended (any status but `starting|running|settling|interrupted`) **and** its ticket is missing or
terminal. Drop the `status !== 'success'` shortcut. This is the rule success runs already follow; it closes A and D for all
new runs.

**F-B: suite-qualified names match the declared title.** `declaresTest(line, name, rules)` also accepts a name that **ends with**
the declared title at a separator boundary (`\s`, `::`, `.`, `/`, `#`, `>`, `›`), compared after collapsing whitespace, case
kept. Guards: the title must be ≥ 2 words or ≥ 12 characters (a bare `it("works")` cannot back "parser works"), and the
existing "added line of a test file" rule is unchanged. Exact/contains matching stays first. Tool text (finish +
worker contract): "`name` is the test's own title as written in its declaration".

**F-C: any completed read-risk call backs a read.** `read P` is supported by an allowed call whose effect is `read_completed`
(tool-agnostic: that state is only written for `risk: read` tools) and whose resource is P **or a folder containing P**
(folded paths; `.` and the worktree root contain everything). Same `provenCalls` set as today (this run + verified earlier
runs). `edited` keeps exact-path `edit|write` + `mutation_committed`. Report note says "backed by a search over <folder>".

**F-D2 (recovery when a secret is really gone: pre-fix tickets, store loss): the next Worker re-admits the file.** When a
changed file's only cover is an earlier run set aside as unverifiable, the coverage finding says so in plain words and the
rework prompt tells the Worker: "re-apply <files> through your edit/write tool (rewrite them as they should be) and claim
them". The rewrite goes through `admit()` and the hook under the current run's secret, so it produces ordinary receipts and
the file is covered by the normal rule. Nothing new is trusted; G1 code only changes its message plus a verdict flag.

**F-D3 (owner vouch, no dead end):** G1 sets `provenanceOnly: true` on a verdict whose only findings are claims/coverage
findings for files whose sole cover is an unverifiable earlier run. `core/src/domain/stage-route.ts`: `provenanceOnly` sends
back for rework while the cap allows (F-D2 can fix it); when the cap is spent, or the Worker's write scope denies the rewrite
(a test file adopted by an implementer under d-0070), it holds as a new decision cause `provenance_hold` (beside `config_hold`,
same engine path): **Merge anyway** (owner vouches for the shown diff, reason recorded, then the normal merge door; other
gates must have passed, same rule as d-0173), Send back, Re-plan, Cancel.

**F-E: turn limit is typed.** (1) `TURNS = /error_max_turns|max(imum)?[\s_-]*(number\s+of\s+)?turns?|turn\s+limit/i`
(not `turn_timeout`, not "maximum number of tokens"). (2) `failure-policy.ts` park text carries the limit:
`max_turns: the run used all <n> turns without finishing`. (3) `EscalationFailure` gets optional
`limit: { kind: 'turns', value, source: 'agent'|'forge', fix_href }`, filled in `tick/outcome-escalate.ts` from the same
budget rule as `run-request.ts:53` (`own.turns ?? engine.run_budget.max_turns`); `fix_href` is the agent's budget field or
Forge settings → Limits. (4) Web copy: "The Worker used all 3 of its turns before finishing. Raise **Turns per run** (now 3)
in Settings → Limits, then Retry." with the link, actions unchanged (Retry, Re-plan, Cancel). (5) Recover step facts get
`last_error` (newest `error` run event message, clipped 300 chars, marked DATA as the playbook already requires). The owner
raises the limit through the UI (rule 9); no hidden per-ticket override.

## Vouching threat model (what a malicious or confused Worker could try)

| Attack | Why the fix does not allow it |
|---|---|
| Forge receipts for an earlier run whose secret is kept longer (F-A) | The Worker never holds a secret: it lives in the SecretStore and server memory; tokens are revoked at settle (`engine/src/tick/settle.ts:120`) and the hook refuses any inactive run after the token check (`hooks/src/server/hook-handler.ts:262-264`). Retention widens the window from "run" to "ticket", exactly what success runs already have. |
| Launder an unreceipted change made in an errored run (shell redirect, out-of-band write) | F-D2 does not trust the old run: the current Worker must rewrite the file through `admit()` and claim it, which is the same as a fresh edit; floors, write scope, config guard, test-diff and checks judge it. F-D3 is a human decision on the exact diff. No engine-side "inherit the worktree" receipt exists (that would launder). |
| Claim a test it did not add via the suffix rule | The title must still be on an **added** declaration line of a test file; the suffix rule only drops a group prefix. A 1-word title cannot back a long name. |
| Claim reads it never did via a folder search | A completed read-risk call over the folder did reach the file's contents; read claims back no merge decision. Worst case is an overstated read, which reviewers can still see. |
| Use a kept secret after the ticket closes | The sweep deletes it once the ticket is terminal (unchanged), at start and after every tick. |
| Out of scope (d-0117) | A process running as the user can read DPAPI secrets and the DB. Receipts defend the policy channel, not an OS boundary; this fix neither weakens nor claims that. |

## Files per package

- `packages/gates`: `src/domain/test-files.ts`, `src/domain/claim-check.ts`, `src/domain/receipt-calls.ts`, `src/shared/paths.ts`
  (`containsPath`), `src/domain/claim-coverage.ts`, `src/domain/earlier-runs.ts` (structured reason), `src/domain/g1-gate.ts`
  (`provenanceOnly`), `README.md`.
- `packages/mcp`: `src/domain/tools/finish.ts` (text). `packages/engine`: `src/domain/worker-contract.ts` (text),
  `src/domain/failure-policy.ts`, `src/tick/outcome-escalate.ts`, `src/tick/escalation-recover-step.ts`,
  `src/tick/gate-config-hold.ts` (generalise to `provenance_hold`), `src/domain/escalation-copy.ts`, `README.md`.
- `packages/core`: `src/types/ports/gate.types.ts`, `src/domain/stage-route.ts`, `src/schemas/escalation.ts`
  (`provenance_hold`, `limit`), `src/domain/escalation-actions.ts`, `src/domain/escalation-classify.ts` (`provenance_hold:` prefix), `README.md`.
- `packages/drivers`: `src/domain/failure-classify.ts`. `apps/server`: `src/services/secret-retirement.ts`, `README.md`.
- `apps/web`: `src/domain/escalation-copy.ts`, `src/components/escalation/escalation-line.tsx` (limit link), `README.md`.

## Tests (red first, each reproduces an eval row)

Step 1 (`packages/gates/__tests__/domain/`):
1. `test-files.test.ts`: `declaresTest('  it("rejects an empty title", () => {', 'shelf add rejects an empty title')` is true (FR-2 ceb149); python
   `def test_rejects_empty_title` vs `TestAdd::test_rejects_empty_title` true; `it("works")` vs `parser works` false; `title` not at a boundary false.
2. `claim-check.test.ts`: read `test/cli.test.ts` backed by `grep` on `test` (FR-14 34aed0); read `src/store.ts` backed by an earlier verified run's
   `grep` on `src/store.ts` (FR-15 test-writer 09605d); `grep` on `src` does not back `test/a.ts`; `failed_no_effect` never backs; `edited` still
   rejects a `grep`-only path.
3. New `claim-check-eval.test.ts`: the full FR-2 ceb149 claim list with receipts and patch shaped like the eval rows (Windows absolute paths
   folded) passes claims.

Step 2:
4. `apps/server/__tests__/services/secret-retirement.test.ts`: `settled` run of an open ticket kept (FR-1 1ed2cb); `error`, `max_turns`,
   `timeout`, `cancelled` runs of an open ticket kept (FR-11 f6da59); all retired when the ticket is done/cancelled; run missing → retired.
5. `packages/gates/__tests__/domain/g1-gate-earlier-runs.test.ts`: rework run claiming `edited src/cli.ts` passes when the errored earlier run's
   secret is present (FR-11 7cfef9); read claim backed by a paused earlier run (FR-1 1d20c6); gone secret → finding names the files and says
   "re-apply through your edit tool" and `provenanceOnly: true` (FR-11 6214ef); same tree plus an own `write` receipt for the file → passes;
   an unreceipted change to a file no verified run edited still fails without `provenanceOnly`.
6. `packages/core/__tests__/domain/stage-route.test.ts` + `escalation-actions.test.ts` + `escalation-classify.test.ts`: `provenanceOnly`
   reworks with cap left, holds when spent; `provenance_hold:` → decision with merge_anyway/rework/replan/cancel.

Step 3:
7. `packages/drivers/__tests__/domain/claude-domain.test.ts` (or `quota-classify.test.ts`): `classifyRejection` of
   `RequestError.internalError(undefined, 'Reached maximum number of turns (3)')` and of the full `Internal error: …` text → `max_turns`;
   "maximum number of tokens" and `turn_timeout` stay non-turns. `adapters/claude/acp/acp-results.test.ts`: that rejection → status `max_turns`.
8. `packages/engine/__tests__/domain/failure-policy.test.ts`: park text names the limit; no retry for `max_turns`. Escalation test: payload carries
   `limit {value: 3, source: 'forge', fix_href}`; recover-step facts include `last_error`.
9. `apps/web/__tests__/domain/escalation-copy.test.ts`: max_turns body names the limit and the settings link; `provenance_hold` title in plain words.

## Docs

- `docs/design/verification-plane.md` §2 + header bullet: fix "earlier runs for `edited` only" (code already uses them for `read`); add the
  read-evidence rule (any read-risk tool, file or containing folder), the suite-name rule, secret retention to ticket close for every ended run,
  F-D2 re-admission and the `provenance_hold` road next to `config_hold`.
- READMEs: `packages/gates` (match rules, limits), `apps/server` (retention), `packages/engine` (limit escalation, recover facts), `packages/core`
  (new decision cause, `limit`), `apps/web` (copy). `PRODUCT.md`: progress line + limit closed. New owner decision amending d-0100 (see Q1).

## Builder steps (each runs `pnpm check`; red tests committed before the fix per d-0015)

1. **Gates matcher (B, C)** — packages/gates (5 src, 3 tests, README), mcp `finish.ts`, engine `worker-contract.ts`, verification-plane §2 (≈12 files).
2. **Evidence retention and recovery (A, D)** — secret-retirement + test, gates coverage/earlier-runs/g1-gate + test, core gate type, stage-route,
   escalation schema/actions/classify + tests, engine `gate-config-hold.ts`, web copy for `provenance_hold`, READMEs (≈15 files).
3. **Turn limit typed (E)** — drivers classifier + 2 tests, engine failure-policy, outcome-escalate, recover step + tests, core `limit` field,
   web copy + escalation line + test, READMEs, PRODUCT.md (≈13 files). Depends on step 2 only for the shared escalation schema file.

## Risks

- Longer secret life for failed runs (ticket-length): mitigated as in the threat model; secrets stay DPAPI-encrypted and retire at close.
- Suffix rule could accept a vaguer claim than intended; the length guard and the added-line rule bound it. Watch the eval re-run.
- Folder reads make `read` claims weaker evidence; acceptable because no merge decision rests on a read claim.
- `provenanceOnly` misclassification would hold instead of rework; it is set only when every finding is attributable to a set-aside run.
- Retention does not repair tickets already open with retired secrets; F-D2/F-D3 cover them.

## Open questions (recommended answer first)

1. **Amend d-0100** to "secrets live until the run's ticket is terminal, for every ended run"? *Yes*; the code already does this for success runs.
2. Should an unsupported `read` claim stay a blocking finding? *Yes for now*; F-A + F-C cover every observed case. Revisit if one recurs.
3. Build an engine settle-time seal (verify at settle, store a signed digest, retire secrets early)? *Not now*: retention covers it with no new
   trust; d-0100 rejected the shutdown-seal variant and a seal adds a standing install key.
4. Add "Retry with more turns" (one-off per-ticket override) instead of the settings link? *No*: rule 9 keeps budgets as UI config; the link + Retry
   is one extra click and leaves an audit trail in the config versions.
5. Should implementers stop claiming `added_test` for tests the test-writer added? *Leave it*: the claim is true of the diff; G1 checks the diff, not authorship.
