# Forge — product description and progress

The single place to learn what Forge is, who it is for, how it works and how
far it has got. Keep it current: every change that alters what a reader would
believe about the product (scope, flow, status, roadmap) updates this file in
the same commit. Detailed rules live in `.forge/memory/decisions/` (cited as
d-NNNN); design docs live in `docs/design/`.

## What Forge is

Forge is an autonomous software-development organisation that a company
installs and runs on its own machine. A **Director** (deterministic engine +
short LLM steps) turns requests into tickets, plans them, dispatches
**Workers** (AI coding agents running in harnesses such as Claude Code) into
isolated git worktrees, verifies their work with independent gates, opens
pull requests and merges by policy. The user steers everything from a web UI.

Governing rule (d-0001): an agent's own report only triggers checks; it never
proves anything. Proof comes from independent processes — receipts of every
tool call, re-run tests, diff checks — before code is merged.

## Who it is for

A company (or a solo developer) that wants AI agents to do real work across
**many repositories**, under rules it controls, without editing config files
or code. One install = one company (d-0094); team features (accounts, roles)
come later (d-0082).

## How a user experiences it

1. `npm i -g vks-forge`, then `forge start` (d-0091, d-0099). Forge runs in the
   background and opens the web UI on `127.0.0.1` (d-0092, d-0093).
2. First run: pick the data folder (`%LOCALAPPDATA%\Forge`, d-0098), check
   installed harnesses and their logins (d-0087), connect GitHub — Forge
   creates a GitHub App in your org with one click (d-0084).
3. Create a project: pick a repo from GitHub or start from scratch, choose a
   local folder (d-0083). Forge detects the languages and commands, runs them
   once, then the Director asks a few onboarding questions (d-0095).
4. Ask for work in the project chat (later: GitHub Issues, d-0096). The
   Director triages it into a ticket with a lane (Express / Standard / Full).
5. Workers run; you watch live, answer their questions, approve what needs you.
   Gates verify; Forge opens the PR and merges when policy allows.
6. Everything — agents, pipelines, models, budgets, limits, credentials — is
   changed in Settings, for the whole company or per project (d-0085, d-0090).

## Key concepts

| Term     | Meaning                                                                    |
| -------- | -------------------------------------------------------------------------- |
| Company  | one install; owns default settings, GitHub connections, harnesses          |
| Project  | one repo + local folder + settings overrides + its own memory              |
| Ticket   | a unit of work, id `<PREFIX>-<n>`, moves through one state machine         |
| Lane     | process weight: Express, Standard, Full; only escalates (d-0006)           |
| Director | the engine + LLM steps that triage, plan, dispatch, steer                  |
| Worker   | an AI agent run in a harness, inside its own worktree                      |
| Harness  | the user-installed agent CLI (Claude Code now; Codex, OpenCode … later)    |
| Receipts | HMAC-chained record of every tool call, written by our hooks               |
| Gates    | independent checks (G1 now: claims vs receipts, tests, diff, config guard) |
| Memory   | per-project decisions, rejected approaches, outcomes, read by the Director |

## Architecture in brief

TypeScript pnpm monorepo, Node 24, SQLite. Inner rings: `packages/core`
(types, schemas, ports, state machine), `packages/tools` (policy: `admit()`,
floors, grants, receipts), `packages/engine` (tick, dispatch, settle, verify).
Adapters: `db`, `drivers` (harnesses), `hooks`, `mcp`, `gates`, `git`,
`memory`, `secrets`. Apps compose: `apps/server` (HTTP + SSE), `apps/cli`,
`apps/mcp`, `apps/web` (UI, not built yet). Rules: `.claude/rules/code.md`.

## Status — 2026-10-14

**Built and verified (M0 slices 1–2, E2):** core schemas and state machine;
SQLite storage; Claude Code driver over ACP with a CLI fallback; receipt
hooks; tool policy; Director engine (triage, dispatch, settle, verify);
G1 gate; git worktrees; GitHub App git host; DPAPI secrets; HTTP server with
SSE. 3621 tests; live probes 1–9 pass, including a real Express ticket from
intake to merge and a real GitHub PR round trip.

**Not yet aligned with the product shape:** the code still assumes one repo
per server, config in `<repo>/.forge/*.yaml`, a pinned bundled harness,
restart kills runs, no UI, no CI, not publishable. See
`docs/design/product-shape-change-map.md`.

**Known limits:** project checks run Worker-written code as the user's own
account (container isolation later, d-0005); the rework path has not run live.

## Roadmap

| Step | What                                                                | Plan                        |
| ---- | ------------------------------------------------------------------- | --------------------------- |
| Now  | Realign the existing code (batches B0–B14)                          | `docs/design/build-plan.md` |
| P2   | Onboarding: GitHub manifest flow, language detection, Director chat | change map W4, W5, W9       |
| P3   | Control room UI: every setting and flow on screen                   | change map W12, W14, W15    |
| P4   | First release on Windows as `vks-forge`                             | change map W16, W17, W20    |
| P5   | GitHub Issues intake, agents and pipelines engine, macOS/Linux, exe | change map W13, W19         |

## Progress log

Newest first. One line per milestone.

- 2026-10-14 — B0: CI on Windows, macOS, Linux.
- 2026-10-14 — Build plan for realignment written (`docs/design/build-plan.md`).
- 2026-10-14 — Product shape decided (d-0082 … d-0099); change map written.
- 2026-10-14 — Agents and pipelines as config grilled (d-0065 … d-0081, x-0011 pending).
- 2026-10-14 — E2 done: server, G1 gate, GitHub App host; probes 1–9 green.
- 2026-10-13 — Slice 1 (core, db), tools policy, Claude driver, engine E1 done; probes 1–7 green.
- 2026-10-12 — Research and design docs; five-plane architecture decided.
