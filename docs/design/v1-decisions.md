# Software Factory — v1 scoping decisions

Date: 2026-10-12
Source: user decisions after the hyperresearch report
(`research/notes/final_report_ai-software-factory-architecture-58e4cc.md`).

These override the report's blueprint where they conflict. The five-plane
architecture (Trigger, Control, Execution, Verification, Oversight) and the
governing rule stay as written in the report.

## Governing rule (unchanged)

An agent's self-report may trigger action, but only a process the agent cannot
control may gate the consequence.

## Decisions

| # | Area | v1 decision | Deferred |
|---|------|-------------|----------|
| 1 | Trigger Plane | User-typed prompt only, via a `TriggerAdapter` interface. `chat` adapter ships. | `webhook`, `cron`, `telemetry`, `bug-report` adapters once the core loop is proven. |
| 2 | Control Plane | Director is conversational. User chats with it live; it chats with every Worker on a per-ticket thread and can pause, redirect, reassign, or order rework mid-run. | — |
| 3 | Execution Plane | Workers run directly on installed coding harnesses (Claude Code, Codex, OpenCode, Pi; others via ACP) through one `WorkerDriver` contract. Containers / WSL2 / harness sandboxes are an isolation option chosen per lane, not the default. Full spec: [`execution-plane.md`](execution-plane.md). | microVM / snapshot fan-out. |
| 3b | Process lanes | Director triage assigns Express / Standard / Full per ticket from blast radius; user can override. Escalation one-way. Express skips ceremony (interview, plan approval, worktree, G2/G4–G6) but never the independent gate or the ledger. | — |
| 4 | Operations UI | Paperclip-style control room: projects, agent org, kanban board, ticket threads, ledger, cost. Every unit of work is a ticket with typed relationships (`parent/child`, `blocks`, `depends-on`, `related`, `supersedes`, `spawned-from`). | — |
| 5 | Branching | Per ticket: git worktree when 4+ files, parallel with a sibling, schema/auth, or long-running; plain feature branch otherwise. | — |
| 6 | Memory | Per-project, git-backed markdown memory owned by the Director; Workers read a ticket-scoped slice and never write. Event-triggered, propose-only janitor. Full spec: [`memory-system.md`](memory-system.md). | Vector / graph backends. |

## Kanban columns

`Inbox → Planned → In Progress → Blocked → Verifying → Review → Done`

Transitions are driven by system events (dispatch, PR opened, gate result,
merge), not by agents moving cards.

## Ledger tiers (from the report)

- **Tier A** — auto-merge behind machine gates (tests, docs, isolated UI,
  reachability-confirmed dependency bumps with no API change).
- **Tier B** — PR + human review.
- **Tier C** — named human sign-off (authZ, business logic, schema, payments,
  irreversible data ops, accepting an ADR, wiring a trigger to a mutating
  workflow).

Promotion up a tier is an approval by the class owner, recorded with author and reason (no file signing, d-0085). Demotion on any
incident is automatic.
