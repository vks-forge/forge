# Software Factory — design docs

Read in this order.

| Doc | What it decides |
|---|---|
| [`v1-decisions.md`](v1-decisions.md) | Scoping table: what v1 builds, what is deferred, governing rule, tiers, kanban columns |
| [`director-core.md`](director-core.md) | Engine tick, state store, ticket state machine, LLM steps, lane triage rule, intake envelope, live steering, blocking questions |
| [`execution-plane.md`](execution-plane.md) | Process lanes, `WorkerDriver` contract, per-harness drivers, skills/agents as files, context injection, permissions and isolation on Windows, resume matrix, run lifecycle, concurrency |
| [`verification-plane.md`](verification-plane.md) | Gates G1–G6 with chosen tools, blast-radius formula, ledger routing, canaries |
| [`memory-system.md`](memory-system.md) | Per-project git memory: layout, record schema, write/read paths, janitor, safety, evaluation |
| [`control-room-and-platform.md`](control-room-and-platform.md) | Monorepo layout, UI screens, live thread stack, observability, LLM gateway and per-run keys, git merge policy, worktree manager, secrets and egress |
| [`v1-scope-review.md`](v1-scope-review.md) | Decision review of the above: walking-skeleton M0, keep / enhance / cut tables, amendments after user review (approved as x-0006) |
| [`tool-system.md`](tool-system.md) | Tool catalogue, per-harness support matrix, factory-served capability tools (web search etc.), intersection grants per run, receipts, taint, who may change grants |
| [`m0-brief.md`](m0-brief.md) | **Finalized build plan**: preconditions, repo layout, four slices with exits, preflight probes, M0.5 driver wave, day-one metrics |
| [`reviews/2026-10-12-enhance-pass.md`](reviews/2026-10-12-enhance-pass.md) | Enhance-decisions pass over the grill session; keep / change / drop table, missed points, contradictions |
| [`self-improvement.md`](self-improvement.md) | Skills, agents and Director prompts improve from outcomes: signals, `improve_skill` step, replay eval with Pareto acceptance, tiered promotion, monitor and rollback (d-0019) |

Research base: `research/notes/final_report_ai-software-factory-architecture-58e4cc.md`
(hyperresearch run, 16 steps, 258 citations) plus source reads of OpenClaw and
Paperclip on 2026-10-12.

Relationship to Paperclip: Paperclip supplies the org + dispatch layer
(tickets, heartbeats, adapters, approvals, budgets). This factory keeps that
layer's contracts and adds what Paperclip lacks: a verification plane the
agent cannot touch, per-project memory with provenance, process lanes,
non-bypass permissions, ADR-compiled rules, and outcome evals.
