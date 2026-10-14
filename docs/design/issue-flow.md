# Issue flow — from GitHub issue to card

Proposal for d-0113 / d-0114, built from two studies on 2026-10-14: our own
earlier system **councilor** (councilor-harness/councilor, commit 9deec86) and
public prior art (CodeRabbit Issue Enrichment + Issue Planner, Devin, GitHub
Copilot agent, OpenHands resolver, Agentless, Issue2Test, Linear Triage
Intelligence, GitHub Agentic Workflows). Status: **draft for approval**.

## 1. What we take from where

| Source | Take | Leave |
|---|---|---|
| councilor | cheapest-first triage chain with typed results; job table with `dedup_key`; tree-sitter code graph with incremental index, recursive blast radius, `file::Class.method` identifiers; two-step finding verification (citation check, then a different model judges); confidence bands; "deterministic floor, LLM can only raise"; fencing of untrusted issue text; split secrets per stage; versioned prompt files | auto-fixing every issue with no analysis or approval; 200 issues dumped into one duplicate call; keyword labelling; stack-specific prompts |
| CodeRabbit | enrichment (duplicates, related issues + PRs with state, suggested owner, labels); plan sections (summary, research, design, phases, tasks); re-run on issue edit; label opt-in/opt-out (`!no-plan` wins) | fixed-format report that cannot say "unknown"; vector-only dedupe that closes issues |
| Devin | green / yellow / red confidence before execution | trusting self-reported confidence alone |
| OpenHands | separate judge after a fix ("was the issue resolved?") | pushing branches on failure |
| Agentless / Issue2Test | localise coarse→fine (file → symbol → line); reproduction test that fails for the issue's reason before any fix | — |
| gh-aw | analyst proposes actions through a constrained channel; a policy layer performs them | — |

## 2. The flow

```
GitHub issue opened / edited / reopened
  │ poll (local install, no webhooks) → job with dedup_key = repo#n@body-hash
  ▼
Stage 0  Fetch + fence      issue, comments, labels → stored; text fenced as UNTRUSTED
  ▼
Stage 1  Triage (cheap, every issue, deterministic first)
  1 skip label (e.g. `forge:skip`, `!forge`)          → Skipped (silent)
  2 already closed / empty body and no comments       → Not actionable
  3 related search: keyword + code-graph + label pre-rank → top 10 candidates
  4 duplicate judge on those 10 (fenced)              → Duplicate of #n (proposed)
  5 needs-info check (too short, no repro for a bug)  → Needs info (question drafted)
  6 rough size + risk class from paths/keywords
  → Triage result + "deep analysis warranted?" (budget, size, labels)
  ▼
Stage 2  Deep analysis (read-only agent, budgeted, only when warranted)
  a localise: files → symbols → lines (code graph + search)
  b reproduce: write a test that fails for the issue's reason (sandbox, no git creds)
  c root cause hypotheses with file:line evidence
  d blast radius: callers/callees (3 hops), consumers, covering tests, missing tests,
     config/migration surfaces, risk-class matches
  e history: recent commits + blame on the lines, CODEOWNERS
  f related: open cards/tickets/PRs touching the same symbols (Forge's own board)
  g plan: phases, tasks, acceptance criteria, test plan, size, rollback
  ▼
Stage 3  Verify the report
  every finding: citation check (grep/ast-grep at HEAD must match) →
  different-model judge on the enclosing code → confidence 0.2 / 0.5 / 0.9;
  findings < 0.7 are shown but never drive the verdict
  ▼
Stage 4  Verdict  (typed; LLM proposes, deterministic floor can only make it stricter)
  auto-ready | needs-approval | needs-info | duplicate | not-actionable
  ▼
Stage 5  Act (policy layer, not the analyst)
  auto-ready      → card created (type Issue), report attached, tickets per d-0108
  needs-approval  → waits on Issues page + Needs you; Approve → card
  needs-info      → question drafted; posted to GitHub after you OK it (or auto, per setting)
  duplicate       → proposed link; closing the issue always needs your confirm
  not-actionable  → reason recorded; GitHub comment/close only after your confirm
```

## 3. Auto-ready gate (all must pass)

The analyst's verdict can only be **auto-ready** when every check passes;
any failure, or "unknown", makes it **needs-approval**.

| Check | Pass when |
|---|---|
| Reproduction | a new test fails for the issue's reason (or the issue is not a bug and acceptance criteria are concrete) |
| Confidence | root cause confidence high (≥ 0.7 after verification) |
| Risk class | no touched path matches auth, secrets, payments, migrations, CI, Forge config, policy doors, or the project's own sensitive globs |
| Blast radius | callers outside the plan are covered by tests; no public API / breaking change |
| Acceptance criteria | written and testable |
| Tests available | the project has a test-role check (d-0095) |
| No conflict | no open card/ticket/PR touches the same symbols |
| Budget | estimated cost within the card budget (d-0112) |
| Project setting | "Always ask" (d-0108) is off |

The floor is proven like councilor's depth router: an eval with an adversarial
"always auto-ready" analyst must produce zero unsafe auto-ready verdicts.

## 4. Report (stored per issue, shown on the Issues page)

1. Header: issue, content hash, analysed at, models, cost.
2. Verdict + confidence + the deciding reason (one line).
3. Problem restated: expected vs actual; what is missing.
4. Reproduction: test written, command, output, or why not reproducible.
5. Root cause: hypotheses with file:line evidence and confidence each.
6. Blast radius: graph (callers / callees / tests / config), risk-class hits.
7. History and owners.
8. Related: duplicates (with basis), related issues, PRs, Forge cards/tickets.
9. Plan: phases, tasks, files, acceptance criteria, test plan, size, rollback.
10. Gate checklist: each check pass / fail / unknown.
11. Questions for you, each with a suggested answer.
12. Actions: taken / waiting for approval.

The report can say "unknown" anywhere; a missing fact never becomes a guess.

## 5. Issues page

List of open issues with: verdict chip, confidence, size, risk, related count,
analysis state (queued / triaged / analysing / ready), cost. Filters by
verdict and label. Open an issue → the report (sections above), the
reproduction test, the blast-radius graph, buttons: Approve → card, Re-analyse,
Ask a question, Skip. Re-analysis runs on issue edit (body hash changes).

## 6. Safety

- Issue text is untrusted input: fenced in every prompt, never followed as instructions.
- The analyst is read-only; it proposes actions through a typed channel; the
  policy layer performs them (one door, fail closed).
- Reproduction runs in the project sandbox with no git or GitHub credentials.
- Budgets: per-issue analysis cap, per-project daily cap (d-0114).
- Learning: your approve / reject / edit of verdicts is recorded per category
  and feeds scorecards (d-0081); it never auto-loosens the floor.

## 7. Depends on

Code graph + project context (x-0012); card model (d-0105 … d-0112); GitHub
connection (B4/P2); sandbox for reproduction tests (d-0005, isolation known
limit); scorecards (d-0081).
