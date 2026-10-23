# Eval fixes: combined plan (2026-10-20)

Source: `docs/reports/2026-10-20-forge-usefulness-eval.md`. Owner rule for all of it: d-0176 (any language, never
Node-only). Each fix has its own brief; this file sets the order, the shared numbers and the owner decisions.

## Briefs

| # | Fix | Brief | Steps |
|---|---|---|---|
| 2 | Real tool approvals (d-0175) | `real-tool-approvals.md` | 3 |
| 1 | Worktree setup for any language | `eval-fix-1-worktree-prep.md` | 3 |
| 3 | G1 lost evidence, search reads, test names, turn limit | `eval-fix-3-g1-claims.md` | 3 |
| 4 | Merge conflicts: catch up with main, resolver run, cap | `eval-fix-4-merge-conflicts.md` | 3 |
| 5 | Director off the tick, start times, Director quality | `eval-fix-5-director-concurrency.md` | 3 |
| 6/7/8 | Honest cost, cancel a ticket, trustworthy status | `eval-fix-6-cost-cancel-status.md` | 3 |
| 9/10 | Chat room, log folds, focus bugs, plain words | `eval-fix-9-chat-and-language.md` | 3 |

## Order (one builder at a time on the shared tree; gates checked by the orchestrator after each)

1. Approvals 1 → 2 → 3 (step 1 started).
2. Worktree setup 1 → 2 → 3. Biggest blocker in the eval.
3. G1 1 → 2 → 3. Before merge conflicts: resolver runs need the kept-evidence fix.
4. Merge conflicts 1 → 2 (split core+db / engine+gates) → 3.
5. Director concurrency 1 → 2; its step 3 (quality) may run beside step 2 if files are disjoint.
6. Cost/cancel/status 1 → 2 → 3. Cancel cleanup reuses the branch delete from worktree setup and merge conflicts.
7. Chat and language 1 → 2 → 3. After approvals step 3 (both edit the dock).

Many steps touch `packages/core/src/domain/escalation*.ts` and `apps/web/src/domain/escalation-copy.ts`, so steps run
in sequence, not in parallel.

## Shared numbers

- Migrations: 0030 `tickets.conflict_count` (merge conflicts), 0031 `director_spend` (cost). Worktree setup, G1,
  approvals and Director concurrency need none. A builder re-checks `packages/db` for the next free number.
- New escalation causes: `permission`, `worktree_setup`, `provenance_hold`, `merge_conflict`; turn-limit gets a limit
  field and a Settings link. Error family `merge_conflict`.
- One cleanup helper for cancelled/replaced tickets (worktree, local branch, PR close, sweep on restart): built in
  worktree setup step 2, reused by merge conflicts step 3 and cancel.

## Owner decisions (answered 2026-10-20: 1–4 recorded as d-0177…d-0180; 5–8 orchestrator defaults)

1. Owner-set lane skips the size raises; Tier C still forces Full (amends d-0141 item 9). **Yes.**
2. Keep the secrets of every ended run until its ticket closes, not only successful runs (amends d-0100). **Yes.**
3. Director may cancel a ticket only when the owner asked in that chat turn, else it suggests; cancel deletes the
   branch and closes the PR but records the last commit id (amends d-0109). **Yes.**
4. Worktree setup trusts owner-listed environment folders (e.g. `.venv/bin`) on PATH for checks, and runs install
   scripts outside the Worker's policy with network. **Yes; the sandbox (d-0161) is the real isolation.**
5. New `director_spend` table (amends d-0159 "no new tables"). **Yes** (orchestrator default).
6. Test-only dev dependency `@axe-core/playwright` for the accessibility gate. **Yes** (orchestrator default).
7. Cheaper default model (sonnet) for `dispatch_prompt`, `approve_plan`, `verify`, `triage`, `steer_reply`.
   **Yes** (orchestrator default; owner can change in Director settings).
8. Director concurrency default 3 (range 1–8). **Yes** (orchestrator default).

## Done when

All steps built, `pnpm check` green after each, heavy tests green for worktree setup and merge conflicts, web built,
then a re-run of the eval tasks on a Node repo and a Python repo shows no manual installs, no claims-only G1
failures, conflicts resolved without re-planning, and Director spend on every cost screen.
