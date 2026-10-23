---
id: x-0016
kind: decision
statement: When main moves under a ticket, Forge merges the base into the ticket's branch (a merge, never a rebase) at every verify cycle, and the ticket's own writer (the stage's `rework_to`, Implementer by default) resolves any clash. The clash is committed with git markers as a checkpoint, the writer is woken once per resolve with the files and the upstream tickets' titles, and G1 refuses any added marker line. The road has its own cap, `MAX_CONFLICT_RESOLVES = 2`, separate from the rework cap; at the cap the ticket waits for the owner with a `merge_conflict` failure (Try again, Re-plan, Cancel). Before a tier-A merge the base tip must be in the gated head, otherwise the ticket is gated again.
source: { type: brief, ref: "docs/briefs/eval-fix-4-merge-conflicts.md (eval finding 4 / fix 4; FR-8 vs FR-6 on src/cli.ts)" }
author: director
origin: brief
status: active
confidence: 0.7
approved_at: 2026-10-23
approved_source: { type: chat, ref: "2026-10-23: user \"approved\" after the autonomous-run report listing x-0016 and x-0017" }
valid_from: 2026-10-20
tags: [verification-plane, execution-plane, merge, conflicts, git, escalations]
---

**Why.**
- In the eval, a ticket whose branch clashed with a ticket that merged first parked as `policy_denied`;
  Retry returned it to Verifying with no Worker run and re-parked it in one tick; the only way out was
  re-planning the whole card. The owner never resolves a conflict by hand.
- A merge keeps history intact: no force push (d-0012), the PR updates by a normal push, and the squash
  keeps main linear. A rebase would rewrite the branch the gates already judged.
- The ticket's own writer already holds the ticket's intent, write scope and harness (d-0148); a new
  built-in resolver agent would need its own pipeline stage, and lane pipelines lock the merge stage.

**Relation to existing records.**
- d-0012: Workers never push; the merge happens in the worktree on Forge's side.
- d-0062: the merge door stays the only caller of `GitHost.merge`; it now also requires the base tip in
  the gated head.
- d-0110: upstream changes pause dependents; the sync never runs inside a live Worker's tree.
- d-0135: a failure that waits on the owner always has a way forward; Retry on `merge_conflict` starts a
  Worker run.
- d-0071, d-0165, d-0173: G1 and its holds; the marker check is one more G1 finding, language-neutral (d-0176).

**Open.**
- A ticket-scoped re-plan ("Re-plan this ticket only") is a separate decision; v1 reuses the card re-plan
  with a pre-filled comment.
- The cap could move into engine config rows if owners ask (code rule 9).
- Binary conflicts keep the ticket's side and cannot be merged by a Worker editing markers.
