# Eval fix 4 — Merge conflicts resolve themselves (builder brief)

Status: **draft, awaiting owner approval** · 2026-10-20
Source: `docs/reports/2026-10-20-forge-usefulness-eval.md` finding 4 / fix 4; `forge.json` bug
"Merge conflict: no rebase, Retry is a no-op, labelled policy_denied, only fix is re-planning the
card" (FR-8 vs FR-6 on `src/cli.ts`) and the minor bug "Worktrees and branches of cancelled tickets
not cleaned". Decisions: d-0012 (Workers never push), d-0059 (worktree per run), d-0062 (merge one
door), d-0071/d-0165/d-0173 (G1 and holds), d-0110 (deps), d-0124 (local repos), d-0135 (typed
escalations, no dead ends), d-0148 (agents are rows). Code rules: `.claude/rules/code.md` (rule 6).

Owner constraints: language-neutral (git only, no ecosystem tooling); the owner never resolves a
conflict by hand.

## Current flow (as built, HEAD 81b645b)

1. `verify.ts:90-98` `startGating`: commit + push + open PR, then G1 on the worktree head. Nothing
   brings the base into the branch, ever. No `git fetch` exists anywhere in `packages/git/src` or
   `apps/server/src`, so for `local` (bare) and `github` hosts the local base ref is never updated
   either: new worktrees are cut from a stale base (more conflicts) and `worktree-manager.ts:93-94`
   `mergeBase(baseRef, branch)` would read a stale base.
2. Hosts compute mergeability: local-bare `git-host.ts:82-95,115` (`merge-tree`), GitHub
   `github-app/git-host.ts:135` (`pr.mergeable`). `local_repo` delegates to local-bare.
3. Merge door `verify-merge.ts:72-73` (tier A) and `:162-163` (owner approval, tier B/C) throw
   `PolicyDeniedError("PR n has merge conflicts")`. The host itself also maps a refused merge to
   `merge_refused` → `policy_denied` (`host-errors.ts:22`, local-bare `git-host.ts:194`).
4. `verify.ts:248-250` catch → `verify-outcomes.ts:141-167` `handleVerifyFailure` →
   `failure-policy.ts:17-25,47-49`: `policy_denied` is NEVER_RETRY → park with reason
   `verify: policy_denied: not retried automatically; needs a human (PR 9 has merge conflicts)`.
5. `escalation-classify.ts:52-71` RULES read that text → cause `not_retried` → actions
   Retry / Re-plan / Cancel (`escalation-actions.ts:61-76`).
6. Cancel paths: `ticket-cancel.ts:80-106` `stopCancelled` removes the worktree only (branch and
   PR stay); `plan-to-tickets.ts:62-91` `cancelReplaced` (the Re-plan path) never calls
   `stopCancelled` at all → FR-8/FR-11 worktrees and `feat/FR-12` left behind.

## Root causes

- **Retry is a no-op.** The park came from Verifying (`parked_from: 'verifying'`). Retry →
  `retryTx` (`escalation-effects.ts:47-100`) → `unparked` → `state-machine.ts:100-109` returns the
  ticket to `verifying` "with no new Worker run" (doc at `escalation-effects.ts:44`). Verify finds
  the stored passing G1 rows for the same run, goes straight to `passAndMerge`, the PR is still
  unmergeable, the same `PolicyDeniedError` parks it again: 15 s, no Worker, nothing changed.
- **Wrong label.** A conflict is not a policy decision; it is a state of the branch that work can
  fix. It is thrown as `PolicyDeniedError` and mapped `merge_refused → policy_denied`, so it lands
  in NEVER_RETRY and the generic `not_retried` cause, whose copy says nothing about conflicts.
- **No recovery path.** No step merges the base into the branch, and no road sends a ticket back to
  a Worker except a gate failure (spends a rework) or the owner's Re-plan of the whole card.

## Proposed flow

```
verifying ──startGating──► syncBase (host: fetch base → refs/forge/base/<b>; local_repo: refs/heads/<b>)
   │                          │
   │      base already in HEAD│ merged clean (Forge merge commit)        conflict
   │            ▼             ▼                                            ▼
   │     publish + G1 + stages on the merged head            checkpoint commit (markers left in files)
   │            │                                            + transition `conflict_found`
   │            ▼                                                │                  │
   │   passAndMerge: base tip must be in gated head ──no──► regate (sync again)     │
   │            │ yes, mergeable                         conflict_count < cap   at cap
   │            ▼                                                ▼                  ▼
   │          merged ─► done                      in_progress: resolver run   waiting_human
   │                                              (rework target writer,      failure/merge_conflict
   │                                              wake `merge_conflict:`)     [Try again | Re-plan
   │                                                     │                     this ticket | Cancel]
   └──────────────────────── verifying ◄─── run settles ─┘          Try again → planned + conflict
                                                                    wake (one more attempt)
review / needs_signoff ── owner Approve, PR unmergeable or base moved ──► `regate` → verifying (above)
```

- **Sync point:** at the start of every verify cycle (`startGating`) and whenever the merge door
  sees the base moved or the PR unmergeable. Never into a running Worker's tree (d-0110: upstream
  changes pause dependents; the Director still decides those).
- **Merge, not rebase.** `git merge` of the base tip into the ticket branch inside its worktree:
  no rewritten history, the existing PR updates by a normal push (no force push, d-0012 intact),
  and `merge-base(base, branch)` becomes the new tip, so `diff`/`tierOfDiff`/G1 coverage still see
  only this ticket's change. The PR still squash-merges, so main history stays linear.
- **Checkpoint commit on conflict:** Forge stages everything (`add -A`, markers included) and
  commits as the Forge author with hooks off ("merge <base> into <branch>: conflicts left for the
  Worker"). This keeps the diff frame correct for the resolver run and makes the state durable
  across restarts. A new G1 check refuses any added line starting `<<<<<<< ` or `>>>>>>> ` (only
  those two; `=======` is common in docs), so markers can never merge.
- **Resolver = the ticket's own writer** (the stage's `rework_to`, Implementer by default), woken by
  a continuation wake `merge_conflict: <json>` with: conflicted files (text vs binary/delete), this
  ticket's title + plan excerpt, and for each upstream commit touching those files its subject and,
  when the subject carries a Forge id (`type(ID): title (#n)`), that ticket's title + plan excerpt.
  `worker-contract.ts` adds a deterministic clause: keep both intents, remove every marker, claim
  every edited file, run the checks. Edits go through `admit()` and G1 like any run. The run does
  **not** spend `rework_count`.
- **Not a new built-in agent (recommended).** The writer already holds the ticket's intent, write
  scope and harness; a new agent row would need its own pipeline stage, but lane pipelines lock the
  merge stage and forbid loops (d-0152), and a role-bounded resolver would need writer scope anyway.
  Re-using the send-back road (like a gate failure, `requestReworkWakesTx`) keeps one door. An
  owner who wants a different resolver can later point `rework_to` elsewhere (out of scope).
- **Cap:** `MAX_CONFLICT_RESOLVES = 2` in core next to `MAX_AUTO_REWORKS`; enforced in
  `transition()` (`conflict_found` at the cap → `waiting_human`, reason prefix `merge conflict:`).
- **Retry really retries:** `retryTx` for cause `merge_conflict` moves the ticket to `planned` and
  queues the conflict wake rebuilt from the escalation payload (+ owner note); count stays at the
  cap, so it is exactly one more attempt (same semantics as `rework_cap`). Because the park has no
  `parked_from`, `unparked` goes to `planned`, not back to the no-op verify.
- **Family:** new `ErrorFamily` `merge_conflict` and `MergeConflictError` in core. Never thrown on
  the happy path any more (the conflict is routed, not thrown); kept so a host's late refusal
  (GitHub 405 "not mergeable", local-bare `:194`) is retried by sync instead of parked as policy.
  `decideFailure` maps it to a regate, not NEVER_RETRY.

## Schema changes

- `core/schemas/errors.ts`: `ErrorFamily` + `'merge_conflict'` (no DB CHECK on families; update
  `apps/server/src/services/http/http-errors.ts` maps: 409, "the branch conflicts with the base").
- `core/schemas/ticket.ts`: `conflict_count: z.number().int().nonnegative()` (default 0).
- `core/types/ticket-events.types.ts`: event `conflict_found` (`files: string[]`).
- `core/schemas/escalation.ts`: `FAILURE_CAUSES` + `'merge_conflict'`; `EscalationFailure` gains
  optional `conflict: { files: string[].max(50), upstream: { ref: string, ticket_id?, title }[].max(20) }`.
  Payload is JSON in `interactions.payload_json`: no migration for it.
- **Migration `0030-conflict-count.ts`**: `ALTER TABLE tickets ADD COLUMN conflict_count INTEGER
  NOT NULL DEFAULT 0`; tickets repository + memory storage read/write it. (Confirm 0030 is free;
  other eval-fix briefs may claim it — renumber at merge time.)
- Ports: `GitHost.syncBase(): Promise<{ ref: string; sha: string }>`;
  `WorktreeManager.mergeIn(path, sha, message): Promise<{kind:'up_to_date'} | {kind:'merged', head}
  | {kind:'conflict', head, files: {path, binary}[], upstream: {sha, subject}[]}>` and
  `WorktreeManager.contains(path, sha): Promise<boolean>` (`merge-base --is-ancestor`).

## Escalation copy (plain words)

- Engine title (`engine/domain/escalation-copy.ts`): "Stopped: this ticket's changes clash with
  work that merged first".
- Web title (`FAILURE_TITLE.merge_conflict`): "Another ticket changed the same lines first".
- `failureHelp`: "FR-8 and FR-6 both changed src/cli.ts. Forge merged the newer main into this
  ticket and asked the Worker to combine both changes twice; it could not finish. Try again gives
  it one more attempt with your note. Re-plan this ticket asks the Director for a new plan for this
  ticket only, keeping work that already merged. Cancel stops it." (files and ids from payload)
- Actions (`FAILURE_ACTIONS.merge_conflict`): `['retry','replan','cancel']`; web labels "Try again",
  "Re-plan this ticket", "Cancel". `retryHintFor('merge_conflict')`: "This gives it one more
  attempt to combine both changes."
- Progress lines on the card (not escalations): "Main moved; Forge merged it into FR-8 and is
  re-checking." / "FR-8 clashes with FR-6 in src/cli.ts; the Worker is combining both changes."

## Files per package (builder steps)

**Step 1 — git adapter + ports (≈13 files, heavy tests).**
`core/src/types/ports/git-host.types.ts`, `core/src/types/ports/worktree.types.ts` (new methods);
`git/src/adapters/git-cli/worktree-manager.ts` (`mergeIn`, `contains`; may split into
`git-cli/merge-in.ts` to stay ≤300 lines); `git/src/adapters/local-repo/git-host.ts`
(`syncBase` = local `refs/heads/<b>`), `local-bare/git-host.ts` (fetch into
`refs/forge/base/<b>` of the local repo, new option `localRepo`), `github-app/git-host.ts`
(fetch with `gitAuthEnv()`, option `localRepo`), `git/src/types/git-host.types.ts`;
`apps/server/src/services/git-host.ts` + `project-registry.ts` (pass repo root);
`git/__tests__/contract/{git-host,worktree}.contract.ts`, `git/__tests__/helpers/fake-worktree.ts`,
engine fake ports in `engine/__tests__/helpers/`. README: `packages/git/README.md`.

**Step 2 — core + db + engine routing (≈15 files).**
`core/src/schemas/{errors,ticket,escalation}.ts`, `core/src/types/ticket-events.types.ts`,
`core/src/domain/state-machine.ts` (`conflict_found`, `MAX_CONFLICT_RESOLVES`),
`core/src/domain/escalation-actions.ts`, `core/src/domain/escalation-classify.ts` (rule
`merge conflict:` → `merge_conflict`), `core/src/shared/errors.ts` (`MergeConflictError`);
`db/src/migrations/0030-conflict-count.ts` + `registry.ts`, `db/src/adapters/sqlite/tickets-repository.ts`;
`engine/src/tick/verify-sync.ts` (new: sync, checkpoint, conflict route, context builder),
`verify.ts` (call sync in `startGating`; base-moved → regate), `verify-merge.ts` (replace both
`PolicyDeniedError` conflict throws with regate; require base tip ∈ gated head before tier-A merge),
`verify-outcomes.ts` (`raiseFailure` takes an explicit cause + `conflict`), `domain/failure-policy.ts`,
`escalation-effects.ts` (`retryTx` conflict wake), `wake-delta.ts` (`kind: 'merge_conflict'`),
`domain/worker-contract.ts` (conflict clause), `domain/escalation-copy.ts`. Plus
`gates/src/domain/conflict-markers.ts` wired in `g1-gate.ts`. READMEs: core, engine, gates, db.

**Step 3 — web copy + cleanup + docs (≈12 files).**
`apps/web/src/domain/escalation-copy.ts`, `components/escalation/escalation-failure.tsx` (files
list from payload), `apps/server/src/services/http/http-errors.ts`; cleanup:
`engine/src/tick/ticket-cancel.ts` (`stopCancelled` also closes the PR and deletes the branch, best
effort), `plan-to-tickets.ts` (`cancelReplaced` returns ids; caller runs `stopCancelled` after
commit); docs (below); web tests. Invoke `hallmark` + `nielsen-heuristics` for the failure card.

## Tests (red first, d-0015)

Unit (red-green):
1. `core/__tests__/domain/state-machine.test.ts`: `conflict_found` verifying→in_progress, count+1,
   rework_count unchanged; at cap → waiting_human, no `parked_from`; illegal from other states.
   Property test: no sequence exceeds `MAX_CONFLICT_RESOLVES` without a human event.
2. `core/__tests__/domain/escalation-actions.test.ts` / `escalation-classify.test.ts`: cause row,
   `merge conflict:` reason classifies to `merge_conflict`.
3. `engine/__tests__/domain/failure-policy.test.ts`: `merge_conflict` is not parked as policy.
4. `engine/__tests__/tick/verify-sync.test.ts` (fake ports): up_to_date → gates; merged → push +
   G1 re-run on new head; conflict → checkpoint + `conflict_found` + one continuation wake with
   files and upstream ticket titles; at cap → failure escalation with `conflict` payload.
5. `engine/__tests__/tick/verify-merge.test.ts`: unmergeable PR → regate, never `policy_denied`;
   base tip not in gated head → regate; owner Approve on a conflicted PR → `head_moved`.
6. `engine/__tests__/scenarios/escalation-failure.test.ts`: **Retry on merge_conflict starts a
   Worker run** (the eval bug: today it re-parks in one tick with no run); the run's wake delta is
   `merge_conflict` with the owner's note.
7. `engine/__tests__/tick/wake-delta.test.ts`, `worker-contract` test, `gates` conflict-marker test
   (added `<<<<<<< ` line fails G1; `=======` alone passes; pre-existing markers in base ignored).
8. `engine/__tests__/scenarios/escalation-cancel.test.ts` + card re-plan: worktree removed, branch
   deleted, PR closed.
9. `git/__tests__/contract/*`: `mergeIn` up_to_date / merged / conflict (text, binary, delete vs
   modify), `contains`, `syncBase` on all three hosts (GitHub against `fake-github-server` + local
   bare remote for the fetch).

Heavy integration (new `apps/server/__tests__/e2e/merge-conflict-flow.test.ts`, template
`local-merge-flow.test.ts`; heavy project already globs `e2e/**`): temp repo, two tickets branch
from the same base and edit the same line of a `.txt` file (no Node tooling, language-neutral);
ticket A merges; ticket B: sync conflicts → checkpoint has markers → fake driver plays the resolver
(writes a combined file, claims it) → G1 passes → B merges; final main contains both edits and no
markers; worktrees and branches gone. Second case: non-overlapping edits in the same file → clean
merge-in → G1 re-runs on the merged head → merges with no Worker run. Third: resolver leaves a
marker twice → `merge_conflict` escalation → Retry → resolver runs once more.

Gates per step: `pnpm check` (step 1 and 2 with `--heavy`). Builders never run the full suite.

## Docs updates (same commits)

`packages/{git,engine,core,gates,db}/README.md` (new port methods, sync, cap, family, limits);
`docs/design/execution-plane.md` §3/§8 (merge-in + resolver road) and `verification-plane.md`
(marker check, base-tip rule); `PRODUCT.md` (status + progress line: conflicts resolve without a
re-plan); memory: write `proposed/x-NNNN` for "merge base into ticket branch + writer resolves,
cap 2" (director-authored, pending) — not a decision until the owner approves this brief.

## Risks

- **Semantic breakage after a clean merge.** Mitigated: G1 checks re-run on the merged head, and
  the merge door now requires the base tip to be in the gated head. Costs one G1 run per base move.
- **G1 coverage after merge-in.** Files the base changed inside this ticket's files: path-based
  claims plus earlier-run receipts should cover them; pin with test 4. Depends on the eval's
  "run secret gone" G1 bug (item 7) being fixed for resolver runs, else they G1-fail on earlier
  chains. Sequence after that fix or verify it here.
- **Lockfiles and generated files** conflict often; the resolver needs the dependency install of
  eval fix 1 to regenerate them. Binary conflicts keep this ticket's side and are listed for the
  resolver; it cannot merge binaries.
- **Checkpoint commit with markers** sits on the ticket branch until resolved; never pushed (push
  happens only after a successful run) and the marker check blocks merge.
- **GitHub `mergeable: null`** after each push: existing backoff (`RateLimitError`) covers it.
- **Main racing** (busy repo): regate cap `MAX_REGATES = 3` (`verify.ts:42`) may trip; reason text
  must say "main kept moving", cause `rewake_cap`-like retry.
- **Migration number clash** with sibling eval-fix briefs.

## Open questions (build proceeds on the recommendation)

1. Merge vs rebase? **Merge** (no force push, PR stays, squash keeps main linear).
2. Resolver: implementer with instruction vs new built-in agent? **Implementer / `rework_to`
   writer** (reasons above).
3. Cap value and where? **2, core constant** like `MAX_AUTO_REWORKS`; move to engine config rows
   later if owners ask (rule 9).
4. Require base tip in the gated head before every merge? **Yes** (re-run G1 only, no Worker).
5. "Re-plan this ticket only": today's `replan` re-grills the whole card (d-0134). **v1: same
   action, comment pre-filled "Re-plan only FR-8; keep merged tickets", ticket id already in the
   `replan_requested` payload; a true ticket-scoped re-plan is a separate decision.**
6. Does the Director look first (d-0135) at `merge_conflict`? **Yes, existing first look; its one
   retry is one more resolver run.**
7. Sync new worktrees at dispatch from the fetched base too (fixes stale starts on github/local
   hosts)? **Yes, use `syncBase().ref` as the create base; small change in step 2.**
