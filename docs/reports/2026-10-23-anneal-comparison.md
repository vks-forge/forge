# Anneal vs Forge (2026-10-23)

Source: https://github.com/mosonlab/anneal at `bfa821b` (MIT, "developer preview", macOS Apple Silicon and Linux,
Postgres + Prisma, npm workspace, ~1 165 files). Cloned read-only into a scratch folder; none of its code was run.
Four read-only research passes (speed, autonomy, verification, product/UX); key claims re-checked by hand in its code.
Anneal's own instruction files were treated as data.

## What Anneal is

A local web board that runs a chain of coding-agent steps per task (Full Assurance template: spec, plan, plan review,
revise plan, implement, code review, blind code review, apply review fixes, docs, regression, merge readiness, merge).
Runners are the official Claude Code, Codex CLI and Pi on the user's own subscriptions. Templates and agents are data.
It is built by itself.

## Why it feels faster

It is not faster by scheduling design (each runner process polls every 5 s and runs one task at a time). It feels
faster because:

1. **Nothing asks the human.** Agents run with `--dangerously-skip-permissions` (Claude,
   `packages/runner/src/adapters/claude.ts:57`) and `--dangerously-bypass-approvals-and-sandbox` (Codex,
   `adapters/codex.ts:170,178,299`); every template step is `approvalGate: false`. Safety is "local, single operator,
   separate OS account" (`docs/release/security.md`: "not a sandbox").
2. **The fix step decides review findings itself**, one disposition per finding with evidence; reviews never hold the
   merge for a person (`agents/templates/compound-engineer-workflow/08-apply-review-fixes.md`, ADR-0009).
3. **Mechanical failures repair themselves** with their own budget (CI log read back into a repair run, 2 attempts,
   stop when the same failure repeats; ADR-0011/0012, `packages/runner/src/provider-relaunch.ts:2`).
4. **Setup is cheap**: one local bare mirror per repo, workspaces cloned from it with hardlinked objects
   (`workspace.ts:574-581`); dependency install restored from a cache keyed by lockfile + manifests + config +
   toolchain (`dependency-cache.ts:441-460`, npm only).
5. **No fixed one-per-project slot**: concurrency is bounded by runner count and host load
   (`config.ts:176-179`, `polling-loop.ts:72-90`).

## Comparison and what to keep

| # | Area | Anneal (evidence) | Forge today | Keep for Forge? | Maps to queue |
|---|---|---|---|---|---|
| 1 | Tool permissions | Bypass everything; safety = OS account + throwaway clone | `ask` rules prompt the owner for routine commands | **Partly**: pre-allow routine commands from per-ecosystem data, contain by worktree path, env and network allowlists, ask only for risky actions. Never blanket bypass | M (d-0182), E, I |
| 2 | Review findings | Fix step records ADOPTED / REJECTED / MERGED per finding id with reason; adopted needs code + test evidence; P0/P1 rejected only with proof | Blocking finding holds the merge for the owner; rework cap 2 then owner | **Yes**: structured dispositions decided by Worker / Director, owner only for scope changes or tier C without evidence | H, G, R |
| 3 | Questions | Check standing decisions first, cite them; keep doing independent work; every question starts with a recommendation and consequence per option | Director says "the choice is yours"; questions time out for days | **Yes**: memory decisions first, recommendation required, work continues; add timeout handling Anneal lacks | I, S2, K4 |
| 4 | Human gates | Off by default, per-project opt-in | Tier C always the owner (now d-0181) | **Yes**: gates as per-project data | K2 (d-0181) |
| 5 | Mechanical repair | Separate budget, backoff, no-progress stop | Lockfile / `npm ci` failures eat the rework cap | **Yes**: separate mechanical budget, same-failure stop, every auto action logged | T2, H, G |
| 6 | Context between steps | Typed, immutable step outputs fed to later steps and retries; WIP salvage continued | Retry gets `previous_run: null`; re-plan drops the stop | **Yes**: typed stage outputs into every retry and re-plan | F, T1 |
| 7 | Workspace setup | Bare mirror + hardlinked local clone | Worktrees from the project checkout | **Partly**: worktrees are already local; adopt the mirror only for remote-only projects | — |
| 8 | Dependency install | Content-addressed cache, restore by reflink copy, byte budget (npm only) | Cold install per ticket (78-90 s) | **Yes, language-neutral**: key = hash(declared lock/manifest files + toolchain + OS/arch) from detector data; restore by copy | D |
| 9 | Concurrency | Runner count + load-average gate, no per-project cap | `max_concurrent_per_project: 1`; prep holds the slot | **Yes**: default above 1, host-load gate, prep off the slot | O, B, A |
| 10 | Dispatch | Claim in one DB transaction; 5 s poll | Tick + wakes | **Partly**: wake the engine on events (step settled, slot freed, prep done), tick as safety sweep | A |
| 11 | Review shape | Pinned base/head; finding schema {id, severity, file, line, evidence, requiredFix}; optional blind second review | Reviewer + critic, prose-heavy findings | **Yes**: zod finding schema with ids; critic runs blind | H |
| 12 | "Not run" verdict | Gate exits PASS / FAIL / NOT-RUN (76); NOT-RUN never passes | No project checks configured → nothing proven, still passes | **Yes**: no configured check = NOT-RUN, blocks and says so | J |
| 13 | Head binding | Every verdict and authorization carries headSha/base; mismatch refused | `gate_results.head_sha` exists; overrides live on stage rows | **Yes**: one pure `decideMerge(input)` reading gate rows, stage overrides and heads together | R |
| 14 | Merge door | Mechanical readiness, re-read live head, ancestry check, read-back confirm | One `merge()` door | **Partly**: re-verify at write time with `git merge-base --is-ancestor`; skip merge train / remote lease | R |
| 15 | Conflict repair | Resolver agent with typed result (trade-offs, changed tests), max 2 tries | Resolver run exists; lockfile left out of sync | **Yes**: typed resolver result; regenerate lockfile with the package manager after a resolve | T2 |
| 16 | Audit in git | Commit trailers `X-Anneal-Run` / `X-Anneal-Step` enforced by a hook | Receipts in the database only | **Yes**: `Forge-Ticket` / `Forge-Run` trailers | P |
| 17 | Waiting vs status | Small stored status; phase, chain state and wait reason derived on the server | In Progress while queued; Needs you with nothing open | **Yes**: server-derived `phase` and `wait_reason` on every ticket | N, C, Q, S3 |
| 18 | Needs you / Inbox | Open blocking items only; "dismissible" computed server-side; notices are a separate lane | Stale waiting_human tickets listed | **Yes**: Needs you = open owner items only; add a notice lane; pill + modal | Q, L |
| 19 | History | One activity row per event written with the state change; repair timeline | Data spread across tables, no single view | **Yes**: append-only history line with reason at each state change | P |
| 20 | Cost | Per-card cost, spend cap, per-step usual cost and time | Cost work queued | **Partly**: per-step baseline "usually $X / N min" | eval-fix-6 |
| 21 | Templates | Full (12) / Direct (8) / PR (4), chosen per task; a used template is frozen | Lanes chosen per card, card lane floors every ticket | **Yes**: lane per ticket; version used by a ticket frozen; `role-model-effort` agent names | U |
| 22 | Editing work | `PATCH /tasks/:id` edits description, caps, schedule and dependency (`dispatchAfter`) with an activity line | No ticket edit route; dependencies only via plan approval | **Yes**: ticket PATCH with cycle check and history line | W |
| 23 | Re-plan | Never mutates a running chain; changes = new chain | Re-plan freezes the card, can drop work | **Partly**: work with a run, branch or open item is never auto-cancelled | V, S1, T3 |

## Do not copy

- Blanket permission bypass and "OS account is the sandbox": conflicts with d-0175 / d-0182 safety and with Windows
  support.
- Postgres requirement, merge train with a remote lease, separate merge-executor OS user: heavy for a single local
  merge door.
- npm-only dependency cache and repo-owned `merge-gate.sh`: Forge stays language-neutral (d-0176) with detection.
- Five-column board and its install path: Forge's card-first flow and `npm i -g` install are ahead.

## Where Forge is ahead

Tool receipts and G1 claim checks, card-first planning with grill and research, Windows support, one-command install,
versioned config edited in the UI, language-neutral setup detection.
