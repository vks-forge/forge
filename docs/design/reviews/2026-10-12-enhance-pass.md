# Enhance pass — grill session of 2026-10-12 (d-0020..d-0030, x-0006, x-0007, x-0009)

> **Status (2026-10-15).** Historical review of the 2026-10-12 grill; paths and
> choices it cites (`.forge/` files, `profile: ts | generic`, pinned CLI,
> restart kills runs) are superseded by d-0085, d-0095, d-0088 and d-0092. See
> `docs/design/build-plan.md`.

Skill: `.forge/skills/enhance-decisions/SKILL.md`. Reviewer: director (Claude), read-only.
Inputs read: `MEMORY.md`, every active `decisions/*.md`, every `rejected/*.md`, all nine
`docs/design/*.md`, `research/notes/{self-improvement,tool-system}/*.md` (steal lists and
weaknesses), final report §7–§8, Paperclip clone (`claude-local/src/server/{acp,execute}.ts`,
`adapter-utils/src/acpx-engine/{execute,constants}.ts`, `doc/acp-run-lifecycle.md`), upstream
`agentclientprotocol/claude-agent-acp` sources (`acp-agent.ts`, `settings.ts`,
`managed-policy.ts`, `hide-claude-auth.ts`, `auth-status.ts`, `resumed-session.ts`), Claude
Agent SDK `sdk.d.ts` 0.3.293, Claude Code `hooks.md` reference, and the local toolchain.
Third-party content was treated as data. The repo has no source code yet (`graft map`: 0
files), so "the code as it exists" means the design docs and memory records.

Toolchain measured on this host: Node v24.20.0, pnpm 12.6.0, Claude Code 2.1.296, git
2.55.0.windows.5, `D:` and `C:` NTFS, pnpm store `D:\.pnpm-store\v11`, registry
`LongPathsEnabled=0`, `git config --global core.longpaths` unset, `~/.claude/settings.json`
present with keys `env, attribution, permissions, model, hooks, enabledPlugins, ...`.
`codex`, `opencode`, `pi`, `gemini`, `claude-agent-acp`, `acpx` not on PATH. npm (read-only):
`@agentclientprotocol/claude-agent-acp` 0.89.1 (modified 2026-10-12, deps SDK 0.3.293, ACP SDK
1.8.0), `@zed-industries/claude-code-acp` 0.16.2 (modified 2026-03-26, SDK 0.2.44),
`@agentclientprotocol/sdk` 1.8.0.

## 1. Summary

The eleven decisions and three proposals hold together; none should be dropped. The
chokepoint design (d-0026) survives the ACP lane (d-0029), but only if three things the
interview assumed are made explicit. First, Claude Code hooks are fail-open on timeout and
on a crashing script by default; `onFailure: "block"` (new in 2.1.295, we run 2.1.296) and an
explicit `timeout` are what make "fail closed" true, and print mode silently ignores an
invalid settings file, so hook liveness must be probed per run. Second, on subscription the
user's own `~/.claude/settings.json` hooks will run inside every Worker unless
`settingSources` excludes `user`; `--settings` adds, it does not replace. Third, the
`claude-agent-acp` adapter and Paperclip's acpx engine both default to permission bypass
(`approve-all`, `allowDangerouslySkipPermissions` unless the client says `false`), which
quietly reopens r-0005; the driver must opt out on every `session/new` and `session/load`.
Everything else is amendment, not reversal: name the TS-only gates, fix the M0 exit
criterion to the one harness installed, and move the approval surface into slice 2.

## 2. Table

| id | verdict | finding | evidence | recommended change | reversibility |
|---|---|---|---|---|---|
| d-0020 | keep | Dogfood on the factory repo means `.forge/skills`, `.forge/tools` and `docs/` are tracked, so they sit inside every Worker worktree. Protected-path ask (tool-system §13) covers it; signature check must read the main checkout, not the worktree. | `tool-system.md` §13; `execution-plane.md` §5a "signature is checked at dispatch against the git commit" | Add one line: catalogue, grants and skill signatures are verified from the main checkout's HEAD, never from files inside the Worker's cwd. | high |
| d-0021 | keep | "Required checks green" (merge policy A) presumes GitHub check runs; gates run on the dispatcher, so the bot must post check runs or merge on local gate results. Slice 1 cannot commit until the URL exists. | `control-room-and-platform.md` §6 merge_policy; d-0021 note "No git init ... until the user provides the URL" | State which: dispatcher posts a `factory/gates` check run via the bot token, or rulesets require only that check. Make "URL supplied" the precondition of slice 1's commit step (d-0030). | high |
| d-0022 | change | Without `--bare`, `--settings` is "additional settings"; user hooks in `~/.claude/settings.json` (present on this host) load into Worker sessions. `--setting-sources` / SDK `settingSources` is the control; `--strict-mcp-config` is honoured on ACP via the `_meta` option allowlist. | `claude --help` (`--settings ... additional settings`, `--setting-sources user,project,local`, `--restricted ... managed settings and --settings still apply`); `sdk.d.ts:2197-2213, 2244-2253`; `acp-agent.ts:1468,1470` | Amend: per-run `settingSources: []` (SDK) or `--setting-sources` without `user`/`project` on CLI, plus the sanitized `--settings`. Note that excluding `project` also drops CLAUDE.md discovery (wanted). Verify OAuth survives the exclusion in slice 2 preflight. | high |
| d-0023 | keep | Portable SQL in core; FTS stays in `packages/memory`. Two SQLite files (state DB, `.forge/memory/<slug>/.index/`) under one writer. | `memory-system.md` §4 `.index/memory.sqlite`; d-0023 note | None. Record that `VACUUM INTO` nightly backup (v1-scope-review §4.8) applies to the state DB only. | high |
| d-0024 | change | Director steps on `claude -p` share the subscription 5-hour pool with Workers, spawn a process per step, load cwd settings/CLAUDE.md and tools unless told not to, and silently ignore invalid settings in print mode. | `claude --help` (`-p` "Settings files that fail validation are silently ignored"); `execution-plane.md` §9 Pro/Max limits; `--tools`, `--no-session-persistence`, `--permission-prompts none` present | Amend the default invocation: `claude -p --output-format json --json-schema <s> --tools "" --setting-sources <none> --no-session-persistence --permission-prompts none --max-budget-usd <n>`. Keep API-key mode as the documented steady state (execution-plane §9). | high |
| d-0025 | keep | Consistent with d-0017 lane-scaled validation; Express = deterministic pre-check, one triage call, one confirmation turn. | d-0017 note; `director-core.md` §6 | None. Add the metric "triage calls that changed the pre-check lane" so the extra call can be justified later. | high |
| d-0026 | change | Hook timeout or crash is non-blocking by default; `onFailure: "block"` (2.1.295+) is required for fail-closed. PostToolUse cannot block, so effect receipts need the pre-mutation checkpoint. Print mode drops invalid settings silently. | `hooks.md` "Block the action when a hook fails" (lines 878-914): "a timed-out command hook doesn't block the tool call"; `claude --help -p` note; `tool-system.md` §10 checkpoint | Amend statement: every receipt hook carries `onFailure: "block"` and `timeout`; a `SessionStart` hook must register with the Factory API before the first tool call or the run is killed; PostToolUse failure marks the effect `uncertain` and triggers checkpoint diff. | medium |
| d-0027 | change | TS-only today: G1 test-diff patterns (`.skip/.only`, `expect`, `toEqual`), G2 import/layer rules and BR `reach` (dependency-cruiser), G4 mutation (StrykerJS), migration check (ORM-specific). Language-neutral: lint/typecheck/test via `commands`, ast-grep, Semgrep, claim matcher, TDD-order check, path rules. | `verification-plane.md` §2 test-diff, §3, §5 StrykerJS, §7 reach; `v1-scope-review.md` §4.5 | Amend: `project.yaml` gets `profile: ts | generic`; `generic` reports G1 test-diff, G2 import rules, G4 mutation and BR reach as `skipped` with the reason shown on the Ticket screen, and `irreversibility`/`sensitivity` from path rules only. | high |
| d-0028 | change | `.worktrees/<id>` is nested under the repo, so Claude Code's ancestor CLAUDE.md/`.claude` discovery reaches the parent checkout; fixed by the same `settingSources` exclusion as d-0022. Host has `LongPathsEnabled=0` and no global `core.longpaths`; pnpm store is on the same NTFS volume (hardlinks work). `D:\wt` in control-room §7 is now stale. | `sdk.d.ts:2251` "Must include 'project' to load CLAUDE.md"; registry + git config measured; `control-room-and-platform.md` §7 | Keep paths. Add: Worker runs set `settingSources` without `project`; the worktree manager sets `core.longpaths=true` per repo and the setup check warns if `LongPathsEnabled=0`; path normaliser resolves junctions (tool-system §5.3). Mark §7 `D:\wt` superseded. | high |
| d-0029 | change | Upstream adapter supports host subscription login (`auth-status` kinds `account/api_key/gateway`; hidden only with `--hide-claude-auth`), `loadSession`, `resume`, fork, `steering: supported`, `session/cancel` → interrupt, and an allowlist that forwards `settings`, `settingSources`, `strictMcpConfig`, `mcpServers`, `extraArgs`, `env`, `allowedTools`, `disallowedTools`, `maxBudgetUsd`, `maxTurns` through `_meta.claudeCode.options`; SDK callback `hooks`/`canUseTool` cannot cross JSON-RPC, but settings-file hooks can. Bypass mode is allowed unless the client passes `allowDangerouslySkipPermissions: false`. Paperclip's acpx writes `.claude/settings.local.json` into the Worker cwd and defaults `permissionMode: approve-all`. The Zed package is stale. | `acp-agent.ts:1431-1495, 1568-1585, 2827, 2866, 2876, 2957-2975, 9905-9911`; `hide-claude-auth.ts:1-50`; `acpx-engine/execute.ts:1594-1607`; `acpx-engine/constants.ts:3-4`; `acp.ts:107-109, 483`; npm versions above | Amend: pin `@agentclientprotocol/claude-agent-acp` (not `@zed-industries/*`); inject per-run settings/hooks/MCP via `_meta.claudeCode.options` (file outside the worktree), never via a file in cwd; send `allowDangerouslySkipPermissions: false` on every `session/new` and `session/load`; answer `session/request_permission` from the admission function; "persistent" means resumable via `loadSession`, not a warm process (Paperclip disables host-lane reuse for credential reasons). | medium |
| d-0030 | change | Slice order is right for data and engine, wrong for approvals: slice 2 has `ask` decisions but no Needs-you until slice 3. Settings page is not needed before the first run because the default credential mode is subscription. Slice 1 commit depends on d-0021's URL. | `tool-system.md` §5.4 ask routes to Needs-you; d-0022 default; d-0021 note | Amend: slice 2 ships a minimal HTTP `interactions/:id/answer` endpoint plus Express `unattended: deny`; Standard/Full dispatch opens in slice 3. Slice 2 exit adds the hook-liveness preflight (d-0026). Make the remote URL a slice-1 precondition. | high |
| x-0006 | change | "All drivers before M0 closes" cannot be met: only Claude is installed, and d-0029 says the rest install after the Claude loop works. | `where codex/opencode/pi` empty; d-0029 note; d-0016 note | Restate M0 exit: one dogfood ticket Inbox→Done on the Claude driver (ACP + CLI fallback) with G1 green; other drivers appear as `preflight: missing binary` rows in Agents/Settings and land in an M0.5 driver wave, one per PR. d-0016 stays satisfied as a v1 requirement. | high |
| x-0007 | keep | 18-step loop is sound; per-run skill cap of 3 must count the `tdd` skill that d-0015 loads on Standard/Full. S0 (registry, versions, frozen snapshot) is the only M0 piece. | `self-improvement.md` §11–§13; d-0015 note; `similar-software.md` "Things nobody does" | None to the statement. Note in slice 2 that the per-run HOME build records versions (S0) from day one. | high |
| x-0009 | change | Admission function in slice 2 is correctly ordered. M0 requires tree-sitter bash parsing, unverified on Windows; Claude Code already enforces `Bash(prefix:*)` rules and the PreToolUse hook sees the full command. | `tool-system.md` §16, §18 "Windows behaviour of tree-sitter bash binding" unverified; `execution-plane.md` §6 deny rules are the hard floor | Amend M0 slice: longest-prefix on a simple tokenizer (split on `&&`, `;`, `\|`, `$(`) inside the hook, with `ask` on anything it cannot parse; tree-sitter moves to M1. Everything else in §16 stays. | high |

## 3. Missed points

1. **Are hooks actually live before the first tool call?** (d-0026) Print mode silently ignores a
   settings file that fails validation (`claude --help`, `-p`), and a missing hook script is a
   non-blocking error without `onFailure: "block"` (`hooks.md` "Block the action when a hook
   fails"). Recommended: a `SessionStart` hook with `onFailure: "block"` that POSTs
   `run_id + hook fingerprint` to the Factory API; the engine kills any run whose first
   `tool_receipts` row is not preceded by that registration. Add to slice 2 exit.

2. **Which settings sources does a Worker load on subscription?** (d-0022, d-0028) The user's
   `~/.claude/settings.json` has a `hooks` key. With no `--bare`, those hooks, plugins and the
   parent repo's CLAUDE.md run inside the Worker. Recommended: SDK `settingSources: []` on the
   ACP lane (via `_meta.claudeCode.options`), `--setting-sources` without `user`/`project` on
   the CLI lane, prompt bundle via `--add-dir` + `--append-system-prompt-file` as Paperclip does
   (`execute.ts:874-880`). Confirm in preflight that OAuth still authenticates with `user`
   excluded (credentials live in the config dir, not in settings; UNVERIFIED).

3. **Does the ACP driver opt out of bypass?** (d-0029, r-0005) `acp-agent.ts:9909-9911`
   allows `bypassPermissions` as a session mode unless the client passes
   `allowDangerouslySkipPermissions: false`, and it must be repeated on `session/load`
   (`acp-agent.ts:1583`). acpx's default is `permissionMode: approve-all`
   (`constants.ts:4`). Recommended: the driver sends `false` on every create/load and the
   renderer test asserts the mode catalogue contains no `bypassPermissions`.

4. **Where do per-run settings live on the ACP lane?** (d-0029, d-0026) Paperclip writes
   `<cwd>/.claude/settings.local.json` (`acpx-engine/execute.ts:1594-1607`), a path the Worker
   can edit. Recommended: never write policy into the worktree; pass `settings:
   "<data-dir>/runs/<id>/settings.json"` through `_meta.claudeCode.options` (allowlisted at
   `acp-agent.ts:1467`), which the SDK maps to the `--settings` layer (`sdk.d.ts:2197-2213`).

5. **What is the honest M0 exit with one harness installed?** (x-0006, d-0016) See table row.
   Recommended wording: "M0 closes when the Claude driver completes a dogfood ticket end to end;
   Codex, OpenCode, Pi and generic ACP are M0.5, each a PR with a `preflight()` that reports a
   missing binary rather than failing the build."

6. **Which gates are TS-only?** (d-0027) Listed in the table row. Recommended: `profile` field
   in `project.yaml`; `generic` profile marks four checks `skipped` with reason. Blast radius
   under `generic` = path rules only, as `v1-scope-review.md` §4.5 already allows.

7. **What does "persistent session" mean for a Worker?** (d-0029) Paperclip keeps ACP processes
   warm only in the sandbox lane; the host lane relaunches every run because a run-scoped
   credential would survive (`doc/acp-run-lifecycle.md` "Known limitations"). We mint per-run
   Factory MCP tokens (`execution-plane.md` §6), so the same rule applies. Recommended: one ACP
   process per run, `loadSession` for continuity, warm handles only after a token-rebind design
   exists.

8. **How does a Worker in a nested worktree avoid the parent checkout?** (d-0028) Covered by
   point 2 (`settingSources`) plus `--add-dir` scoped to the worktree and the prompt bundle.
   Also: `.worktrees/` must be in the dogfood repo's `.gitignore` before the first dispatch, and
   the `.ignore`/graft indexer should skip it.

9. **Windows long paths.** (d-0028) `LongPathsEnabled=0` and no global `core.longpaths`.
   pnpm's `.pnpm/<name>@<ver>_<peers>/node_modules/...` nesting under
   `D:\VIKASH\software-factory\.worktrees\<id>\` can cross 260 characters for Win32 tools
   (esbuild, Semgrep CE). Recommended: setup check warns; worktree manager sets
   `core.longpaths=true` per repo (already in d-0028); keep ticket ids short (`SF-12`).

10. **Slice 2 has no human.** (d-0030) `ask` decisions in slice 2 can only time out. Recommended:
    the minimal answer endpoint in the table row, exercised by the slice-2 TDD suite, and the
    Express lane only until slice 3 lands.

11. **Director step hygiene.** (d-0024) Steps must not inherit the repo's hooks, MCP servers or
    tools. Recommended flags in the table row. Also set `CLAUDE_CONFIG_DIR` per d-0022 so a
    separate account can be configured later without code change.

12. **PostToolUse cannot block.** (d-0026) A failed effect-receipt write cannot undo a mutation.
    Recommended: effect state `uncertain` plus the pre-mutation checkpoint ref
    (`tool-system.md` §10) so G1 diffs per call; the next PreToolUse denies until the API is
    reachable again, which is the pause the decision already describes.

13. **Hook shell on Windows.** (d-0026) Command hooks run under Git Bash on Windows, PowerShell
    when Git Bash is absent (`hooks.md` common fields `shell`); exec form needs a real `.exe`,
    `.cmd` shims fail. Recommended: exec form `"command": "node", "args": [<hook.js>]`, which is
    platform-independent.

14. **Subscription terms.** (d-0022, d-0024) `execution-plane.md` §9 already records that a
    personal Director driving your own installed `claude` is allowed and that parallel Workers
    drain the 5-hour pool. Recommended: a cost pane counter for "subscription turns this
    window" and a Settings toggle to cap concurrent subscription Workers at 1–2.

15. **Receipts on the CLI fallback lane.** (d-0029, d-0026) Same `--settings` hooks apply; the
    CLI lane additionally needs `--permission-prompts host` with the SDK/`--permission-prompt-tool`
    bridge for `ask`. The CLI flag is referenced in `--help` text but not listed as an option;
    the SDK exposes `permissionPromptToolName` (`sdk.d.ts:2012`). Recommended: CLI fallback
    runs Express only (unattended deny) until the prompt-tool bridge is verified.

## 4. Contradictions found

| pair | disagreement | resolution |
|---|---|---|
| d-0022 vs host `~/.claude/settings.json` (`hooks` key) | Decision assumes a sanitized `--settings` isolates the Worker; `--settings` is additive. | Add `settingSources` exclusion to d-0022 (table row). |
| d-0026 vs `hooks.md` defaults | "Fail closed" vs Claude Code's non-blocking default on timeout/crash. | `onFailure: "block"` + `timeout` on every hook; liveness preflight. |
| d-0029 note "Paperclip pattern" vs r-0005 | acpx `approve-all` default and adapter bypass default re-enable what r-0005 rejected. | Explicit opt-out in the driver; r-0005 stays rejected. |
| d-0029 "persistent sessions" vs `execution-plane.md` §6 per-run token + Paperclip `acp-run-lifecycle.md` | Warm process would carry a revoked token. | Resumable, not warm. |
| d-0028 vs `control-room-and-platform.md` §7 `D:\wt\<ticket-id>` | Two worktree locations in the docs. | d-0028 wins; mark §7 superseded. |
| d-0022 "`--bare` only in api_key mode" vs `execution-plane.md` §5 "Use `--bare` on Claude Code for scripted runs" | Doc predates the subscription default. `--bare` never reads OAuth (`claude --help`). | Doc update: `--bare` is the api_key-mode variant. |
| d-0024 default subscription vs `control-room-and-platform.md` §5 "Workers use API keys" and `execution-plane.md` §9 | Docs say API keys are the steady state. | Keep both: subscription = personal-use default (d-0022), API key via Settings; docs get a one-line note. |
| d-0027 any-language vs `verification-plane.md` §2, §5, §7 | Four checks are JS/TS-bound. | `profile` field; `skipped` with reason. |
| x-0006 / d-0016 "before M0 closes" vs d-0029 note "install after Claude loop works" and empty `where` results | Cannot both hold on this host. | M0.5 driver wave (table row). |
| d-0030 slice 2 vs `tool-system.md` §5.4 | Asks need a human surface that arrives in slice 3. | Minimal answer endpoint in slice 2; Express only until slice 3. |
| d-0021 "no git init until URL" vs d-0030 "commit report before commit" per slice | Slice 1 can be built but not committed. | URL as slice-1 precondition. |
| `acp-agent.ts` `NewSessionMeta` comment (hooks "merged") vs `OPTION_REBUILDS_SESSION` (`hooks: false`, cannot cross JSON-RPC) | Upstream doc comment is stale. | Rely on settings-file hooks only; do not plan on SDK callback hooks over ACP. |

Rejected records quietly reopened: **r-0005** (above). r-0001, r-0002, r-0003, r-0004,
r-0006 are not touched by any of the fourteen records.

## 5. Order of work

1. User supplies the remote URL (d-0021) → `git init`, `.gitignore` with `.worktrees/`,
   `.forge/data/`, `.forge/memory/*/.index/`.
2. Slice 1 (d-0030): `packages/core` + `packages/db` behind `StorageAdapter` (d-0023),
   `project.yaml` schema with `profile` (d-0027), ticket ids and branch names (d-0021).
3. Slice 2 preflight probes, each a vitest that shells out: `claude -p` with
   `--setting-sources` excluding user still authenticates on subscription (d-0022); a
   `--settings` file with a `SessionStart` + `PreToolUse` hook (`onFailure: block`) fires and
   blocks (d-0026); `claude-agent-acp` starts, reports `account` auth, honours
   `allowDangerouslySkipPermissions: false` and `strictMcpConfig` (d-0029).
4. Slice 2 build: admission function + floors + lane grants (x-0009 M0, tokenizer not
   tree-sitter) → receipt hooks and Factory MCP (d-0026) → Claude ACP driver with CLI fallback
   (d-0029) → `DirectorLLM` adapter (d-0024) → triage step (d-0025) → S0 registry rows written
   from the per-run HOME build (x-0007) → minimal `interactions/:id/answer` endpoint.
5. Slice 3: HTTP API, Board, Ticket, Needs-you, Settings with credential mode and model
   matrix (d-0022, d-0030). Standard/Full lanes open here.
6. Slice 4: first dogfood ticket on the factory repo (d-0020) → M0 closes (x-0006 restated).
7. M0.5: Codex, OpenCode, Pi, generic ACP drivers, one PR each, installed by Claude with user
   confirmation (d-0016, d-0029 note).
8. S1+ of self-improvement after ~50 runs (x-0007).

## 6. Unverified

- `--setting-sources ""` (empty) semantics on the CLI; the SDK documents `settingSources: []`
  (`sdk.d.ts:2250`), the CLI help lists only `user, project, local`.
- Whether excluding the `user` settings source keeps the stored OAuth login usable. Expected
  yes (credentials are not settings); not run, because it costs a model call.
- That hooks declared in the `--settings` layer execute inside the SDK subprocess the ACP
  adapter spawns. `sdk.d.ts:2201` says the option is "equivalent to the `--settings` CLI flag";
  not exercised here.
- Ancestor CLAUDE.md discovery from a nested worktree: from the Claude Code memory docs, not
  re-read this pass; the `settingSources` fix covers it either way.
- tree-sitter bash binding on Windows (also listed in `tool-system.md` §18).
- `claude-agent-acp` login flow on Windows with the host subscription (`auth-status.ts`
  describes it; not run).
- `--permission-prompt-tool` as a CLI flag (referenced in `--help` text, not listed).
- `--json-schema` enforcement strictness in `-p` mode (d-0024 note says it exists; validated
  output shape not tested).
- Semgrep CE and StrykerJS behaviour under 260-char paths with `LongPathsEnabled=0`.
- `ALLOW_BYPASS` constant source in `acp-agent.ts` (the grep did not resolve it; the
  session-level gate at lines 9909-9911 is what the driver must satisfy).

## 7. Opinions

- Slice 2 will be the long slice; the three preflight probes in §5 step 3 are worth doing
  before any engine code, because each one can change the driver's shape.
- The Zed adapter name in `execution-plane.md` §11 and the grill notes should be replaced
  everywhere by `@agentclientprotocol/claude-agent-acp`; the two packages have diverged by
  seven months and three SDK minors.
- Express on the CLI fallback lane with `unattended: deny` is a fine first dogfood target; it
  needs no approval UI and exercises receipts, G1 and the merge path end to end.
