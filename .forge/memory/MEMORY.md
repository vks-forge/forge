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
- d-0009 — Stack: TS pnpm monorepo, SQLite WAL, Bifrost gateway, Phoenix traces, assistant-ui threads
- d-0010 — Control room built in React, lifting from Paperclip (MIT); no embedded tracker
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
- d-0040 — One package skeleton (`src/{schemas,domain,ports|adapters,shared}`), single root `__tests__/` mirroring `src/`
- d-0041 — Every file opens with a header comment (what / why + doc ref / exports / depends on); lint-enforced
- d-0042 — Namespace imports: `#/` package root, `@forge/<name>` cross-package; `../` is a lint error
- d-0043 — Product name Forge; npm scope `@forge/*`, `ForgeError`
- d-0044 — Config/runtime dir is `.forge/` (renamed from `.factory/`); rest of d-0039 carries over (supersedes d-0039)
- d-0104 — No company Home: Home is project-scoped (first project), sidebar project switcher with unsaved-changes alert; Forge settings in a separate area; direction A Instrument, more distinct and calmer
- d-0103 — Web stack = Paperclip's (Vite, React 19, Router, TanStack Query, Tailwind 4, Radix, assistant-ui, motion), latest versions; fully spring-animated, 60 fps, no jank (major)
- d-0102 — UI: approved screen map → clickable prototype in real apps/web on mock data, swapped to real APIs; hallmark + Nielsen per screen
- d-0101 — Measured: ACP adapter runs installed `claude` via `CLAUDE_CODE_EXECUTABLE` env (not `_meta`); B6 keeps bundled adapter, sets the env (author=director, measured)
- d-0100 — Run HMAC secret stored encrypted for the run's life so G1 verifies across resume; build plan B0–B14 approved, autonomous
- d-0099 — Published npm package `vks-forge`; command `forge`; internal `@forge/*` stay private, bundled; amends d-0091
- d-0098 — Data folder `%LOCALAPPDATA%\Forge` (worktrees too), daily snapshots keep 7 + export/restore, notify-then-update, backup before migrate, rollback; amends d-0085, d-0059 (product grill)
- d-0097 — Layered Worker limits (global 2 / per-project 1 / per-harness), priority + round-robin queue, quota waits with reset time (product grill)
- d-0096 — Ticket sources = TriggerAdapter folders: chat first, GitHub Issues (label, polled) next, more later; all via Director triage, outsiders need approval; amends d-0002 (product grill)
- d-0095 — Onboarding: detect (ecosystem detectors + CI + Director) → run each command once → Director onboarding chat seeds memory; any language, role-tagged command lists (supersedes d-0034)
- d-0094 — One company per install (company → projects → tickets); multiple GitHub connections (one App per org/account); multi-company deferred (product grill)
- d-0093 — No auth ⇒ 127.0.0.1 only, no network bind setting; per-install API token for UI/CLI; server mode starts with an install-wide key; amends d-0061, d-0082 (product grill)
- d-0092 — Background daemon (`forge start/status/stop`, tray, start on login); resume interrupted runs with fresh run secret, else retry keeping worktree (supersedes d-0054)
- d-0091 — Distribute via npm first (Node 24), standalone exe later; `forge start` opens the UI; package name open (`forge`/`@forge` taken) (product grill)
- d-0090 — UI is the only control surface (no hand-edited code/config); open source later; CLI = install/start/stop/script (product grill)
- d-0089 — Windows first release; CI matrix Win/macOS/Linux from now; macOS + Linux next release (Keychain / Secret Service, notifiers, live probes) (product grill)
- d-0088 — No harness pin: per-install compatibility check on each new version, changed tools denied until approved in Settings, known-good list per release (supersedes d-0053)
- d-0087 — Paperclip model: run user-installed harnesses with their own login (or API key / setup-token OAuth), Test-environment probe, no bundling; amends d-0031, d-0032, d-0053 (product grill)
- d-0086 — Project memory in Forge data folder (private git repo per project), optional one-way mirror PR to the repo, default off; amends d-0007, d-0044 (product grill)
- d-0085 — Settings, agents, pipelines, skills in Forge data folder DB, UI-only; company defaults + per-project overrides; versioned; export/import later (supersedes d-0008, d-0065, d-0068)
- d-0084 — Each install creates its own GitHub App via the manifest flow (manual fallback); Settings page manages it; PR status polled (product grill)
- d-0083 — Git via a GitHub App installed on the repo; new project = from scratch or pick a GitHub repo, always into a chosen local folder (product grill)
- d-0082 — Installed product (exe/CLI), one binary: local mode first, server mode later; one company, many repos; no team features/auth now (product grill)
- d-0081 — Scorecards per agent and pipeline shape from outcomes; Director reads them, no auto-tuning (x-0011 Q16)
- d-0080 — Agent unavailable: retry with backoff → fallback list → Director substitute → pause; UI-refinable (x-0011 Q15)
- d-0079 — Notify via control room inbox + Windows desktop notification; notifier port for more channels later (x-0011 Q14)
- d-0078 — Each agent declares its skills and memory slice (tags, rejected); Director sees all memory (x-0011 Q13)
- d-0077 — Director builds each ticket's pipeline freely (no safety floor), default pipeline exists, built pipeline + reasons recorded; amends d-0001, d-0006, d-0069 (x-0011 Q12)
- d-0076 — Parallel reviewers and parallel writers both allowed; Director decides the flow within pipeline limits (x-0011 Q11)
- d-0075 — Pipeline/agent changes: validate → dry run → replay past tickets → canary with auto rollback (x-0011 Q10)
- d-0074 — Script gates: user commands as pipeline nodes (exit 0 = pass), G1-style safe env; scripts not plugins (x-0011 Q9)
- d-0073 — Critic must be a different model family than the Worker (warning until a 2nd harness exists, then refused) (x-0011 Q8)
- d-0072 — Budgets per agent only (usd, minutes, turns); cap hit pauses ticket; loops still max-bounded (x-0011 Q7)
- d-0071 — Reviewers advisory (findings as notes); critical/high holds auto-merge for the user; deterministic gates still block (x-0011 Q6)
- d-0070 — Nodes hand off typed artifacts; each agent declares inputs/output/write_scope; reviewers never see the Worker narrative (x-0011 Q5)
- d-0069 — Pipeline choice = lane default + routing rules (paths, type, labels), project override, only ever stricter (x-0011 Q4)
- d-0067 — Measured: Claude Code defers MCP schemas behind ToolSearch; Workers run with `ENABLE_TOOL_SEARCH=false`; finish may be re-called (author=director, measured)
- d-0066 — Pipelines are graphs (nodes + outcome edges, branches, loops); validated at load (x-0011 Q2)
- d-0064 — Measured: ACP announces a tool call before its input streams; receipt cross-check waits for the tool result for empty-input announces (author=director, measured)
- d-0063 — Readable layout: Prettier + ESLint auto-fix `curly: all` and blank-line padding (`@stylistic`); repo reformatted once, lint keeps it
- d-0062 — GitHost port: local bare host + GitHub App host (DPAPI SecretStore for the App key); merge one door
- d-0061 — apps/server HTTP on node:http (no framework), SSE hand-written, 127.0.0.1 only
- d-0060 — M0 models: Director steps opus, Workers sonnet (all lanes); matrix in `.forge/config` yaml
- d-0059 — Always a worktree per Worker run (`.worktrees/<id>`), main checkout never a Worker cwd (supersedes d-0011)
- d-0058 — `@forge/engine`: tick/dispatch/settle/DirectorLLM steps over ports, inner ring beside tools (imports core+tools only); apps/server composes (amends rule 1)
- d-0057 — Measured: hook tool_use_id == ACP toolCallId; budget exit 0 or 1 (classify by subtype); project-source defaultMode filtered, set_mode still required (author=director, measured)
- d-0056 — Claude hook client + settings renderers move to `drivers/claude/hooks`; `@forge/hooks` keeps neutral receipt ingress
- d-0055 — One ticket id `<PROJECT>-<n>` is the primary key, no UUID; rest of d-0021 carries over (supersedes d-0021)
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

- d-0034 — `profile: ts | generic` → superseded by d-0095 (role-tagged commands, any language, 2026-10-14)
- d-0054 — restart kills in-flight runs → superseded by d-0092 (daemon + resume, 2026-10-14)
- d-0053 — ACP on SDK-bundled pinned CLI 2.1.293 → superseded by d-0088 (installed harness, per-version compat check, 2026-10-14)
- d-0008, d-0065, d-0068 — skills/agents/pipelines as repo files (signed) → superseded by d-0085 (DB + UI-only in Forge data folder, 2026-10-14)
- d-0011 — worktree only for big/parallel tickets → superseded by d-0059 (always worktree, 2026-10-13)
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

- x-0011 — Agents (`.forge/agents/*.yaml`) and per-lane pipelines (`.forge/pipelines/*.yaml`) as config; engine = generic stage runner; fixed invariants (grill paused 2026-10-14 after Q16; decisions d-0065..d-0081; more discussion before the brief)

## Outcomes

- 2026-10-12 — hyperresearch run + design docs session: `outcomes/2026-10/2026-10-12-design-session.md`
- 2026-10-12 — scope review + self-improvement research + tool-system reverse engineering: `outcomes/2026-10/2026-10-12-review-and-research-session.md`
- 2026-10-14 — E2 done + pushed; pipelines-as-config grill (x-0011, d-0065..d-0081) paused: `outcomes/2026-10/2026-10-14-e2-done-and-pipelines-grill.md`
- 2026-10-14 — Product shape grill (installed product, company, many repos; d-0082..d-0098): `outcomes/2026-10/2026-10-14-product-shape-grill.md`
