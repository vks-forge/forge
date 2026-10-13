# @forge/drivers

`WorkerDriver` implementations: one folder per harness under `src/adapters/`. Today: the Claude Code driver (`id: 'claude-code'`) with an ACP engine (default) and a `claude -p` CLI engine (fallback), plus the live preflight probes.

## Why it exists

Workers run inside third-party harnesses (Claude Code first; Codex, OpenCode, Pi and generic ACP later) that each speak their own protocol. The Director must start, steer, resume and kill a run the same way whatever the harness, and must never trust a harness's own permission bypass. This package is that boundary: one driver per harness, harness output normalised to core `RunEvent` / `RunResult`, every quirk contained in the harness folder. Without it harness details leak into the engine and each new harness means a core edit. Design: `docs/design/execution-plane.md`; the Claude brief is `docs/design/briefs/claude-driver.md`.

## What it does

- `createClaudeDriver(deps)` returns a core `WorkerDriver`. `deps`: `prepareRun(req) -> { runDir, mcpServers, env, hookServerUrl, hookToken }` (the app creates `.forge/data/runs/<id>/`, issues the token, starts nothing), `receipts.decisionFor(runId, toolUseId, { name, argsHash }?)` (read access to the server-side receipt chain), `clock` (`now`, cancellable `after`), `spawn`, optional `git`, `log`, `baseEnv`, `config`. `systemClock` and `nodeSpawn` are the real ones. Config (zod, defaults filled): `engine: 'acp' | 'cli'`, `receiptGraceMs` (3000), `receiptCrossCheck`, `authTimeoutMs`, `cancelGraceMs`, `rateLimitBackoffMs`, `claudeBinary`, `acpSteering`, pinned versions.
- Layers: `adapters/claude/claude-driver.ts` composes; `run-supervisor.ts` owns the event log (numbered, validated, replayable), the stall and turn timers, the receipt cross-check, pause detection and the result; `acp/` and `cli/` are the engines behind one seam (`types/claude/engine.types.ts`); `domain/` is the pure rules (env, failure classification, the result table, event normalisation); `hooks/` is the Claude hook client and the `--settings` renderer (moved from `@forge/hooks`, d-0056). `bin/hook.js` is the process the harness runs; it loads `#/adapters/claude/hooks/hook-main.js` (resolved to `dist/` under plain node).
- ACP engine: spawns the pinned `claude-agent-acp` entry with `node <abs>` (no shell, run dir as cwd) and drives it with the SDK. Child env = host + request + prepared env minus `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `FORGE_HOOK_CONFIG`. `initialize`, wait for `_auth/status_update` account (`none` or a timeout is `auth`), `session/new` or `session/load` with `_meta.claudeCode.options` (`settingSources: []`, `strictMcpConfig`, `allowDangerouslySkipPermissions: false`, caps, model, settings path), then `session/set_mode default` at once (failure is `policy_denied`). `session/request_permission` is answered from the hook's recorded decision (`allow_once` only for `allow`; no decision is `reject_once` plus a `policy_denied` event); it never calls `admit()`. Steering: `steer` uses `_session/steering` when the adapter advertises it, `follow_up` queues a prompt, `interrupt` is `session/cancel` then prompt; each is echoed as `inbox_delivered`. Cancel: `session/cancel`, grace, then `taskkill /T /F /PID` (win32) or a process-group kill.
- CLI engine: `claude -p --output-format stream-json --verbose --setting-sources "" --settings --mcp-config --strict-mcp-config --max-budget-usd --max-turns --model --permission-mode default [--resume]` plus `--allowedTools/--disallowedTools` from the request; the prompt goes on stdin. It declares no steering and no permission bridge.
- Receipt cross-check: the first `tool_call` whose id has no decision receipt within `receiptGraceMs` cancels the run as `policy_denied`. The join is by the harness tool id; `decisionFor` also receives `{ name, argsHash }` (SHA-256 of the canonical tool input, the digest the receipt stores) so the app can join on those if the ids differ.
- Result table (both engines): budget -> `error/budget`; max turns -> `max_turns` (session dropped); refusal -> `refused/refusal`; rate limit -> `error/rate_limit` + `retryNotBefore` (reset time, else now + `rateLimitBackoffMs`); no login -> `error/auth`; no event for `stallMs` or a turn over `turnMs` -> `timeout/stall`; last act `ask_director` / `report_blocked` -> `paused` with the interaction id; child exit without a result -> `error/crash`; anything unrecognised -> `error/unknown`. `filesTouched` is `git diff --name-only <base>` plus untracked files from the worktree, never the Worker's claim.
- `preflight()` reports the adapter version and the bundled Claude Code version (`acp 0.89.1; claude-code 2.1.293`) and flags drift from the pins (d-0053); the CLI engine reports the host `claude` version.
- Probes (`__tests__/probes/`): live checks against the real `claude` CLI and ACP adapter on the user's subscription. Results: `__tests__/probes/RESULTS.md`. Probe 6 (the driver on the real adapter) is written but not yet run.

## Why this approach

- ACP-first (d-0035, d-0049): live steering and resume; the CLI is the explicit fallback. The adapter still reads the user's settings, so the mode is forced to `default` after every new/load and every tool call is decided by the hook's receipt, never by harness-side settings. Bypass-permissions is rejected (r-0005).
- One door: the PreToolUse hook is the only place `admit()` runs; this package only reads the verdict. On Windows the Worker's OS user can rewrite `hook.json` and `hook.js`, so the hook is attribution, and the cross-check is the backstop.
- The ACP engine runs the Claude Code bundled with the pinned SDK, not the host's `claude`; `CLAUDE_CODE_EXECUTABLE` is never set (d-0053).
- Layering (d-0052): imports `@forge/core` and `@forge/tools` only. The hook wire schemas live in `@forge/tools` (`@forge/tools/hook-wire`, zod only) so the hook process starts fast and `@forge/hooks` shares them without depending on this package.
- Runtime dependencies: `@agentclientprotocol/claude-agent-acp@0.89.1`, `@agentclientprotocol/sdk@1.8.0`, `zod@4.6.7` (config, hook config and boundary parsing), `@forge/core`, `@forge/tools`.

## Requirements

- Node 24.20 and pnpm; `pnpm build` at the root before a live run (the hook runs from `dist/`); a logged-in Claude subscription on the host; the bundled Claude Code must match `pinnedCliVersion` (2.1.293 at adapter 0.89.1). On Windows the CLI engine needs `claudeBinary` to be a real executable (`claude.exe`), not a `.cmd` shim, because processes are not started through a shell.
- Probes run only with `FORGE_PROBES=1` (`pnpm probes`), spend subscription tokens (each capped, haiku) and write to `.forge/data/probes/`. Re-run them after every Claude Code or adapter/SDK bump (d-0053).
- Tests: `pnpm test` runs the contract (`__tests__/contract/worker-driver.contract.ts`, `describeWorkerDriverContract`) against a fake driver and both Claude engines; the ACP engine runs against an in-process fake adapter, the CLI engine against `__tests__/helpers/fake-claude.mjs`.

## Extending

Add `src/adapters/<harness>/`, implement the core `WorkerDriver` port, import only `@forge/core` and `@forge/tools`, export from `src/index.ts`, and pass `describeWorkerDriverContract` before writing any adapter-specific test. A new Claude engine is a factory passed as `deps.engineFactories`. `preflight()` must report `missing binary` when the harness is absent. Add a probe for any new harness assumption first. Harness names appear only inside `packages/drivers`.

## Limits

- Windows enforcement is attribution-only (see One door); the cross-check detects a bypassed hook after the fact, it does not prevent the call.
- The CLI engine has no permission-prompt bridge (tools run only if the request lists and the hook allow them) and cannot be steered; use it for Express-lane work (d-0035).
- Live state is in-process: after a Forge restart `events`, `result` and `resume(handle)` refuse the handle; start a new run with `req.resume` (d-0054). `resume(handle)` replaces the run's event log.
- Unverified until probe 6: hook `tool_use_id` equals ACP `toolCallId`; PreToolUse fires for `mcp__forge__*` under ACP (set `receiptCrossCheck: false` if it does not); the adapter's budget and turn-cap error wording; MCP tool names in ACP updates.
- `hook_liveness` events are written by the server's SessionStart handler, not by this driver. A `max_tokens` stop is reported as `unknown`. User-level hooks and CLAUDE.md may still reach a Worker under ACP (d-0049).
- Other harnesses (Codex, OpenCode, Pi, generic ACP) are not started (d-0037).
