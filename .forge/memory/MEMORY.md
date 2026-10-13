# Project memory index — software-factory

Always loaded. Keep under 200 lines. Full records live in the folders below;
this file is a pointer list, not a place for content.

Schema and rules: `docs/design/memory-system.md`. Operating rules for Claude:
`CLAUDE.md` → "Project memory".

## Active decisions (author=user unless noted)

- d-0001 — Five-plane architecture + governing rule (self-report triggers, independent process gates)
- d-0002 — Trigger plane v1 = chat only, via `TriggerAdapter`; other sources later
- d-0003 — Director = deterministic engine + finite LLM steps; live chat with user and Workers
- d-0005 — Workers run on installed harnesses via `WorkerDriver`; containers/WSL2 optional per lane (supersedes d-0004)
- d-0006 — Process lanes Express / Standard / Full; start light, escalate on signal, never down
- d-0007 — Memory: git-backed markdown per project, Director-only writer, propose-only janitor
- d-0008 — Skills (`SKILL.md`) and agent specs (YAML) are files in git; DB is registry only
- d-0009 — Stack: TS pnpm monorepo, SQLite WAL, Bifrost gateway, Phoenix traces, assistant-ui threads
- d-0010 — Control room built in React, lifting from Paperclip (MIT); no embedded tracker
- d-0011 — Branching: worktree when 4+ files / parallel / schema-auth / long-running; else feature branch
- d-0012 — Workers never push or hold git creds; dispatcher pushes; factory bot merges by policy
- d-0013 — This repo uses `.forge/memory/` for project memory, not Claude's auto-memory
- d-0015 — Major work (Director decides major vs simple) goes through red-green TDD; G1 verifies red→green from receipts
- d-0016 — Multi-harness drivers (Claude Code, Codex, OpenCode, Pi, ACP) are a v1 requirement
- d-0017 — Every task validated plan-mode style (grill → enhance → finalize), depth scales with lane (supersedes d-0014)
- d-0018 — Enhancement skill is written by us (`.forge/skills/enhance-decisions/`)
- d-0019 — Skills and agents self-improve: propose-then-gate via outcomes, ledger tier, replay eval
- d-0037 — M0 exit = one dogfood ticket on the Claude driver; other drivers M0.5 wave
- d-0038 — Tool system M0: tokenizer shell parsing, signatures verified from main checkout HEAD
- d-0020 — Dogfood target = the factory repo itself
- d-0031 — Harness auth is the harness's own; per-agent credential mode in Settings; Workers exclude `user`/`project` setting sources (supersedes d-0022)
- d-0032 — `DirectorLLM` adapter, default logged-in harness with hygiene flags; subscription-turn counter (supersedes d-0024)
- d-0025 — Always LLM triage before validation; process correctness over call count
- d-0033 — Receipt hooks `onFailure: block` + timeout, SessionStart liveness registration, PreToolUse chokepoint (supersedes d-0026)
- d-0034 — Any-language targets; `profile: ts | generic`, TS-only checks `skipped` with reason under generic (supersedes d-0027)
- d-0040 — One package skeleton (`src/{schemas,domain,ports|adapters,shared}`), single root `__tests__/` mirroring `src/`
- d-0041 — Every file opens with a header comment (what / why + doc ref / exports / depends on); lint-enforced
- d-0042 — Namespace imports: `#/` package root, `@forge/<name>` cross-package; `../` is a lint error
- d-0043 — Product name Forge; npm scope `@forge/*`, `ForgeError`
- d-0044 — Config/runtime dir is `.forge/` (renamed from `.factory/`); rest of d-0039 carries over (supersedes d-0039)
- d-0057 — Measured: hook tool_use_id == ACP toolCallId; budget exit 0 or 1 (classify by subtype); project-source defaultMode filtered, set_mode still required (author=director, measured)
- d-0056 — Claude hook client + settings renderers move to `drivers/claude/hooks`; `@forge/hooks` keeps neutral receipt ingress
- d-0055 — One ticket id `<PROJECT>-<n>` is the primary key, no UUID; rest of d-0021 carries over (supersedes d-0021)
- d-0054 — M0: server restart kills in-flight runs (run secret memory-only); reconcile marks unowned `running` as crash
- d-0053 — ACP runs the SDK-bundled CLI (2.1.293), pinned; probes re-run on adapter/SDK bumps; carries d-0048 facts (supersedes d-0048)
- d-0052 — Layering: core + tools are inner rings; adapters import core+tools only, never each other; standalone processes compose in `apps/<name>/src/main.ts` (amends rule 1)
- d-0051 — READMEs are living docs: every reader-visible change updates the README in the same commit; stale README = review block (amends d-0050)
- d-0050 — Package/app README contract: 7 sections (what, why exists, what it does, why this approach, requirements, extending, limits), ≤150 lines, updated with the change
- d-0049 — ACP-first stays: `session/set_mode default` after every new/load, our `request_permission` handler decides every tool call; follow-up probes for strictMcpConfig + user hooks (amends d-0035)
- d-0047 — Storage: raw portable SQL on a `SqlDriver` seam, no ORM; more adapters via `adapters/<name>/` + contract test (supersedes d-0023)
- d-0046 — Bootstrap commits go straight to `main`, no PR, until the bot dispatches its first ticket; per-commit go still required
- d-0045 — All hand-written types/interfaces in `src/types/` as `<name>.types.ts` (ports in `types/ports/`); only `z.infer` aliases may sit in `schemas/`; lint-enforced
- d-0035 — ACP-first driver contract: pinned `@agentclientprotocol/claude-agent-acp`, per-run options via `_meta`, bypass opt-out on every session, resumable not warm (supersedes d-0029)
- d-0036 — M0 four slices amended: preflight probes + answer endpoint in slice 2, URL precondition (supersedes d-0030)

## Superseded

- d-0048 — Measured Claude harness facts → superseded by d-0053 (version attribution corrected, 2026-10-13)
- d-0021 — git/PR/branches/ids incl. internal UUID → superseded by d-0055 (no UUID, 2026-10-13)
- d-0023 — StorageAdapter with Drizzle → superseded by d-0047 (raw SQL, 2026-10-13)
- d-0039 — worktrees/data/memory paths → superseded by d-0044 (`.forge/` rename, 2026-10-13)
- d-0004 — Docker container per Worker by default → superseded by d-0005 (2026-10-12)
- d-0014 — Grill-me before any work → superseded by d-0017 (per-task, lane-scaled) (2026-10-12)
- x-0005 — First v1 cut (single driver) → superseded by x-0006 (2026-10-12)
- x-0008 — Tool system v1 → superseded by x-0009 after source reads (2026-10-12)
- x-0001 — Claude Code via Agent SDK first → superseded by d-0029 (ACP-first, CLI fallback) (2026-10-12)
- d-0022, d-0024, d-0026, d-0027, d-0028, d-0029, d-0030 — grill answers → superseded by d-0031..d-0039 after the enhance pass (2026-10-12)

## Rejected approaches

- r-0001 — Vector / graph memory frameworks (mem0, Zep, LangMem) for Director memory
- r-0002 — Always-on memory janitor agent
- r-0003 — Long-lived LLM session as the orchestrator
- r-0004 — Embedding a third-party tracker (Plane, Huly, OpenProject, Planka, Focalboard, Vibe Kanban)
- r-0005 — Bypass-permissions as default harness policy (Paperclip's default)
- r-0006 — Uniform full process for every task size

## Approved proposals (now in `decisions/`, author=director, approved 2026-10-12)

- x-0001 — Claude Code first `WorkerDriver`, then Codex, OpenCode, Pi, ACP
- x-0002 — Own dispatch layer; lift specific Paperclip code only
- x-0003 — Monorepo layout in `control-room-and-platform.md` §1
- x-0004 — Lift Paperclip board, ticket thread, approval card; rest clean
- x-0006 — v1 walking-skeleton cut, revised → exit criterion restated by d-0037 (M0 = Claude loop; other drivers M0.5)
- x-0007 — Self-improvement: 18-step research-backed loop, system not skill (`docs/design/self-improvement.md` §12–§13)
- x-0009 — Tool system v2 → M0 slice amended by d-0038 (tokenizer first, tree-sitter M1)
- x-0010 — Project slug `forge`, ticket prefix `FG`, memory dir `.forge/memory/forge/` (approved 2026-10-13 via d-0043)

## Pending proposals (need user approve / reject)

- none

## Outcomes

- 2026-10-12 — hyperresearch run + design docs session: `outcomes/2026-10/2026-10-12-design-session.md`
- 2026-10-12 — scope review + self-improvement research + tool-system reverse engineering: `outcomes/2026-10/2026-10-12-review-and-research-session.md`
