# v1 scope review — keep / enhance / cut

> **Status (2026-10-15).** Historical scope review for the walking skeleton
> (approved as x-0006). The keep / enhance / cut reasoning stands for the
> engine, gates and tools; these amendments are superseded:
>
> - Skills, agents and config as files under `.forge/` (d-0018's path,
>   the `.forge/data/` run files of the section 4.6 amendment): database rows
>   and the data home (d-0085, d-0098).
> - "Gates by profile" (`profile: ts | generic`, d-0034): role-tagged checks
>   and ecosystem gate rules (d-0095, B5).
> - Scope assumptions "one user, one box, no team" and "one repo": the
>   installed product serves one company with many projects and GitHub
>   connections (d-0082, d-0094).
> - Ledger-as-signed-commits: ledger changes are attributed settings versions.

Status: proposed, 2026-10-12
Reviewed: all six design docs, `.forge/memory/` records d-0001..d-0013, r-0001..r-0006, x-0001..x-0004.
Lens: one user, one Windows 11 box, installed harnesses, no team. Goal is merged code with less human time than doing it by hand. Every component is judged by "what breaks if v1 ships without it" and "what evidence says it pays".

## 1. Verdict

The design is sound and the differentiators are real (independent gates, memory with provenance, lanes, non-bypass permissions). The problem is scale: the six docs describe a product company's 12–18 month roadmap and present it as v1. Built as written, the first merged ticket is months away and the triage / blast-radius / memory metrics never get enough reps to calibrate.

Two risks dominate:

1. **Never reaching the loop.** Five drivers, six gates, eight screens, a gateway, a trace viewer, a merge bot, an egress model. Any one of these can eat weeks.
2. **Express slower than raw Claude Code.** If "fix typo" through the factory costs triage + spawn + claim-match + test run + PR, the user bypasses the factory for 80% of work. The factory then only sees big tickets, and the calibration loops (escalation rate, `tier_predicted` vs `tier_actual`, re-proposal rate) starve.

Recommendation: define a **walking skeleton** that crosses all five planes in the thinnest possible way, ship it, use it on this repo for two weeks, then grow from observed pain. The tables below are that cut.

## 2. Walking skeleton (M0, all planes)

One prompt → one ticket → one Claude Code run on a feature branch → G1 → PR or local merge → Done on the board. Everything observable in the UI.

| Plane | M0 content | Deferred from the docs |
|---|---|---|
| Trigger | `chat` intake only, `IntakeEvent` envelope as specced | nothing (already minimal) |
| Control | engine tick, `tickets` / `runs` / `run_events` / `run_inbox` / `interactions` tables, ticket state machine, `triage` + `dispatch_prompt` + `steer_reply` steps | `plan`, `clarify`, `epic_summary`, `rework_brief` steps; per-state concurrency caps; wake coalescing beyond idempotency key |
| Execution | `WorkerDriver` interface + **Claude Code driver only**; per-run `HOME` with copied skills; `--bare`, `--allowedTools`, `--max-turns`, `--max-budget-usd`; feature branch, worktree when parallel | Codex / OpenCode / Pi / ACP drivers; skills registry, signatures, render cache, FSM predictor; session handoff summary; WSL2 / sandbox / container isolation |
| Verification | G1 (receipts via hooks, claim matcher, test-diff gate, lint, types) + G3 as **existing test suite**; blast radius as **path rules only** | G2 SAST/SCA, ADR compile pipeline; hidden intent tests; G4 mutation; G5; G6; canaries; dependency-cruiser reach bucket |
| Oversight | Board, Ticket thread, Needs-you pane; Tier A auto-merge, Tier B/C = user approves in Needs-you | Projects health, Agents, Ledger, Cost, Memory screens; ledger-as-signed-commits; factory bot identity; Gitea |
| Memory | memory M0 + M1 as already phased (`decisions/`, `rejected/`, `outcomes/`, ticket-scoped slice) | M2–M4 unchanged |
| Platform | one Node process, SQLite WAL, React + assistant-ui, API key in env, usage from Claude `result` message | Bifrost, Phoenix / OTLP, mitmproxy, low-priv account, firewall rules, DPAPI vault |

## 3. Keep as designed

| Item | Why it earns its place |
|---|---|
| Governing rule; gates outside the Worker process | The whole reason this is not "just run Claude Code" |
| Deterministic engine + finite LLM steps (d-0003) | Every pure-LLM orchestrator surveyed was retired |
| Lanes with one-way escalation (d-0006) | Only thing that makes daily use tolerable |
| `WorkerDriver` contract and event normalisation | Cheap to keep the interface even with one implementation |
| G1 claim matcher + test-diff gate | Highest catch-rate per line of code; EvilGenie / OverclaimBench evidence |
| Memory records with immutable provenance, supersede-never-delete | Already dogfooded; costs almost nothing |
| Workers never push; dispatcher pushes (d-0012) | One line of policy, closes a whole class of accidents |
| Ticket relations schema (all six kinds) | Cheap in the DB; UI draws only `parent` and `blocks` in M0 |
| Resume matrix and poisoned-session heal | Paperclip paid for this lesson already |

## 4. Enhance (gaps the docs do not cover)

1. **Cross-plane milestone plan.** Each doc phases itself; nothing sequences the whole system. §2 above is the missing M0. M1+ should be driven by observed pain, not by the docs' completeness.
2. **Where Director LLM steps execute.** The docs say "finite schema-validated calls" but not through what. Decide: direct Anthropic SDK structured-output calls from the server process, not a harness session. Harnesses are for Workers only.
3. **Express must feel like chat.** Stream the Worker's run into the same thread the user typed in, start the run before triage finishes when the deterministic pre-check is clean, and let Express skip the PR when the repo has no remote (local merge by the engine). Measure prompt-to-first-token and prompt-to-merged; if Express is slower than raw Claude Code for a one-file change, the lane has failed.
4. **G3 hidden intent tests are Full-lane only, and later.** Writing tests before the code exists is a hard LLM task and the tests must compile against a future API. M0 G3 = the project's existing suite. Hidden tests arrive with the `plan` step, after the loop works.
5. **Blast radius is language-bound.** dependency-cruiser only reads JS/TS. Either declare v1 targets TypeScript repos, or make `reach` pluggable with a path-rules fallback. Say which.
6. **Isolation trust model, stated plainly.** Windows has no Claude Code sandbox; egress control is untested; WSL2 from a Windows Node process means `/mnt/d` worktrees and path translation. v1 statement: *all lanes run as host processes on repos the user trusts; the factory enforces policy at the harness boundary (allow/deny lists, per-run HOME, no creds) and nowhere else.* Revisit when a Worker touches untrusted code.
7. **Solo-user ledger.** Tier C "named signer" and a ledger of action-class owners is org machinery. With one user: Tier A auto, Tier B one-click approve, Tier C approve with a typed confirmation. Keep the tier concept, drop the ownership table until a second human exists.
8. **Failure budget for the Director itself.** Nothing says what happens when a Director step keeps returning invalid schema or the SQLite file corrupts. Add: step retry cap (2), then ticket → Blocked with reason; nightly `VACUUM INTO` backup of the state DB.
9. **Rework loop cost.** `Verifying → InProgress` on gate fail with `retry_of` has no cap in the state machine. Add: max 2 automatic reworks per ticket, then Needs-you.

## 5. Cut or defer

| Item | Decision | Reason |
|---|---|---|
| Codex, OpenCode, Pi drivers | Defer; **ACP generic becomes driver 2** | One driver covers Gemini, Cursor, Codex (`codex-acp`), Pi (`pi-acp`). Native drivers only when ACP's missing permission field actually hurts. |
| G5 Inspect AI pass^k | Defer | Adds a Python runtime to a TS monorepo for a Full-lane-only gate. |
| G6 promptfoo order-swapped judge | Defer | Two extra LLM calls per ticket; the "unknown → human" rule can be applied to G4's verdict instead. |
| G4 StrykerJS mutation | Defer | Slow on real suites; adopt after G4 critic has a measured false-negative rate. |
| Canaries | Defer | Need gates to exist first. |
| Bifrost + per-run virtual keys | Defer | `--max-budget-usd` + per-run env key + usage receipts cover one provider on one box. Add when a second provider or a hard spend cap is needed. |
| Phoenix / OTLP | Defer | `run_events` in SQLite plus the ticket thread is the trace for v1. |
| Gitea fallback | Cut | Never stand up a git server for a local repo; the engine merges locally. |
| Skills registry, signatures, render cache, FSM predictor | Defer | Copy skill dirs into run HOME. Nothing about Worker capability depends on the DB. |
| ADR → compiled rules pipeline, Tier C rule acceptance | Defer | Hand-written `.forge/rules/*.yaml` until there are ADRs to compile. |
| Session handoff summary on rotation | Defer | Fresh session + ticket thread is the handoff. |
| Per-state concurrency caps | Simplify | One global slot limit (3). |
| Low-priv account, firewall rules, mitmproxy, DPAPI | Cut from v1 | See §4.6. Untested on this host; pretending isolation is worse than stating trust. |
| Projects, Agents, Ledger, Cost, Memory screens | Defer | Board + Ticket + Needs-you is the control room. Cost is a column on the ticket. Memory is edited in git. |
| Paperclip fork (x-0002) | Build own, lift pieces | The clone lacked `server/`; forking code we could not read is riskier than the ~40% delta we add. Lift adapter `execute()` shape and assistant-ui wiring (x-0004 yes). |

## 6. Pending proposals, recommended answers

| Id | Recommendation |
|---|---|
| x-0001 Claude Code first driver | Approve. ACP generic second, Codex native third if ever. |
| x-0002 own vs extend Paperclip | Own dispatch layer; lift specific code. |
| x-0003 monorepo layout | Approve. `packages/gates` and `packages/memory` start as folders with one file each. |
| x-0004 lift Paperclip UI components | Approve for board / thread / approval card only. |

## 7. What would change this review

- A second human joins → restore ledger ownership and Tier C signers.
- A Worker must touch an untrusted repo → restore isolation work (WSL2 first).
- Express escalation rate > 30% after 50 tickets → triage is wrong, revisit lane thresholds before adding gates.
- G4 critic false-negative rate measured > 20% on canaries → bring back mutation (StrykerJS) and G5.

## 8. Amendments after user review (2026-10-12)

User decisions that override §2 and §5 above. The revised cut is proposal x-0006.

| Decision | Effect on this review |
|---|---|
| d-0016 multi-harness in v1 | Drivers Codex, OpenCode, Pi, ACP are **not deferred**. Claude Code still goes first to prove the loop; the rest land before M0 closes. Budget: ~300 lines driver + ~100 lines renderer each. |
| d-0017 validate every task, plan-mode style | Replaces §4.3's "start the run before triage finishes". Every lane gets a validation turn: Express = one confirmation (task restated, predicted files, lane, recommended answer); Standard = short grill; Full = grill + enhancement pass + explicit finalize. Nothing is dispatched before the user says go. |
| d-0015 red-green TDD on major work | Adds a **TDD-order check to G1**: receipts must show new test fails → non-test edits → test passes, on Standard/Full. Worker prompt on those lanes loads the `tdd` skill. |
| d-0018 own enhancement skill | New deliverable: `.forge/skills/enhance-decisions/SKILL.md`. Runs after grill, before finalize. |
| d-0019 self-improving skills and agents | Revives `skill_usage`, skill/agent versions and signatures from §5 (no longer deferred). Adds an `improve_skill` step on janitor triggers, propose-then-gate, replay eval before merge. Needs its own design doc. |

Still deferred: G2 SAST + ADR compile, hidden intent tests, G4 mutation, G5, G6, canaries, Bifrost, Phoenix, Gitea, egress isolation, four of eight screens (Settings joined M0 per d-0031).

## 9. Finalized after grill + enhance pass (2026-10-12)

Grill answers d-0020..d-0030, enhance pass `reviews/2026-10-12-enhance-pass.md`, finalized as d-0031..d-0039. Net effect on this review:

- **M0 exit** (d-0037): one dogfood ticket Inbox → Done on the Claude driver with G1 green. Codex, OpenCode, Pi, generic ACP = M0.5 wave, one PR each, `preflight: missing binary` until installed.
- **§4.3 amended** (d-0025): every lane gets an LLM triage step; no run starts before the validation turn.
- **§4.6 amended** (d-0031, d-0039): isolation on subscription = `settingSources` excluding `user`/`project`, per-run `--settings` under `.forge/data/`, `--strict-mcp-config`, `--add-dir` scoped; `--bare` only in `api_key` mode.
- **Gates by profile** (d-0034): `project.yaml` `profile: ts | generic`; TS-bound checks `skipped` with reason under `generic`.
- **Slices** (d-0036): see `m0-brief.md`.
