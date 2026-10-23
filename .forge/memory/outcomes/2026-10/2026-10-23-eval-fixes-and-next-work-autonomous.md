---
type: outcome
date: 2026-10-23
author: director
---

# Eval fixes finished, CHE-C1 findings, Anneal comparison, next-work plan built overnight (autonomous)

## Done
- Eval fixes plan (`docs/briefs/eval-fixes-plan.md`): approvals, worktree setup, G1, merge conflicts, Director concurrency
  1-3, cost / cancel / status 1-3, chat and language. All uncommitted on main.
- Live card CHE-C1 on 4310 analysed read-only; findings became `docs/briefs/next-work-queue.md` items A-Z and AA.
- `docs/reports/2026-10-23-anneal-comparison.md`: mosonlab/anneal studied read-only; ideas kept as X1-X10, Y.
- `docs/briefs/next-work-plan.md`: phases 0-7; built overnight: R/X3 (one merge decision honouring owner overrides),
  V (a new plan never cancels started work; coverage check), W (ticket edit door and Director dependency actions),
  F (retries carry context), A (prepared ticket starts first), 2.1/2.2 (ticket phase and wait reason, Needs you =
  open owner items), L (needs-you pill and modal), T4/K4 (consequence popups, sign-off recommendation), Z (Close all
  notifications), AA (harness bypass default on, hard floor, migration 0031), T1 (re-plan carries the stop), K2
  (Director signs clean tier C), X8 (event-driven engine wake), D/X5 (dependency cache, any ecosystem), P/X4 (history
  tab, commit trailers), Y (live tile progress), eval-fix-6 (director spend ledger migration 0032, cancel door), eval-fix-9,
  Director quality step 3, README trims. Bug found and fixed: re-gating after main moved used the old base.

## Decided (owner)
- d-0181 Director signs tier C when the floor is clean.
- d-0182 routine worktree commands never ask the owner.
- d-0183 per-harness bypass setting, default on, hard floor kept (supersedes r-0005).

## Proposed (pending owner)
- x-0016 merge the base into the ticket branch when main moves.
- x-0017 director spend ledger table (amends d-0159).

## Pending
- Owner answers Q-1..Q-11 in `next-work-plan.md` (3.2, 3.3 T2, 3.4, 4.1, 4.4, lane lowering, version freeze).
- Commit and push (none made); CI was red on 81b645b before this work.
- Live end-to-end check on a Node and a Python repo on a separate instance.
- Rebuild web and restart 4310 only when the owner asks.
