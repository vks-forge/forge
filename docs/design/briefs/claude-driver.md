# Brief — Claude WorkerDriver (m0-brief slice 2, item 3)

Status: approved to start 2026-10-13; revised after the 2026-10-13 review.
Builds on d-0033, d-0035, d-0049, d-0052, d-0053, d-0054, d-0056. Probe facts:
`packages/drivers/__tests__/probes/RESULTS.md`. Starts after review batches
A, B, D and C (ports) are committed.

## Scope

`packages/drivers/src/adapters/claude/`: one `WorkerDriver` (`id: 'claude-code'`)
with two engines picked by config, never by `if` on harness name elsewhere.

- **ACP engine (default).** Spawns pinned `@agentclientprotocol/claude-agent-acp`
  (resolved entry, `node <abs>`, no shell), drives it with `@agentclientprotocol/sdk`.
  It runs the SDK-bundled Claude Code CLI (2.1.293 at adapter 0.89.1), pinned;
  do **not** set `CLAUDE_CODE_EXECUTABLE` (d-0053). `preflight()` reports both
  the adapter version and the bundled CLI version.
- **CLI engine (fallback).** Host `claude -p --output-format stream-json --verbose`
  with `--setting-sources ""`, `--settings <file>`, `--mcp-config <file>`,
  `--strict-mcp-config`, `--max-budget-usd`, `--max-turns`, `--model`,
  `--permission-mode default`, `--resume <session>` on resume.
- **Claude hook client moves here** (d-0056): `packages/hooks` `bin/hook.js`,
  `client/`, Claude payload schemas and the `--settings` / `_meta` renderers move
  to `src/adapters/claude/hooks/`; `@forge/hooks` keeps only the neutral receipt
  ingress (token check, `admit()`, receipt append, wire schemas).

Out of scope: DirectorLLM, engine tick, HTTP, gates, other harnesses.

## Layering (d-0052)

Drivers import `@forge/core` and `@forge/tools` only, never `@forge/hooks`,
`@forge/mcp` or `@forge/db`. Run-specific inputs arrive through ports in
`createClaudeDriver(deps)`:

- `prepareRun(req) → { mcpServers, env, hookServerUrl, hookToken }`: the app
  creates `.forge/data/runs/<id>/`, issues the run token, starts nothing.
  The driver renders its own hook settings (it now owns the Claude renderers).
- `receipts: { decisionFor(runId, toolUseId) → Decision | null }`: read access
  to the server-side receipt chain (see "One door").
- `clock`, `spawn` (injectable), `stallMs` from `RunBudget`.

## One door (review F25)

The PreToolUse hook → server `admit()` is the only policy decision and the only
receipt. The ACP `session/request_permission` handler does **not** call
`admit()` again: it looks up the decision for that `toolCallId` via
`receipts.decisionFor` and answers `allow_once` only for an `allow`; no decision
→ `reject_once` and a `policy_denied` error event. Probe first that the hook's
`tool_use_id` equals ACP's `toolCallId` and that PreToolUse fires for
`mcp__forge__*` under ACP (extend probe 5); if ids differ, join on
(tool name, args hash) and record the result.

## Receipt cross-check (Windows attribution-only)

On this host the Worker's OS user can rewrite `hook.json` / `hook.js`, so the hook
is attribution, not enforcement. The driver sees every tool call in the ACP / CLI
stream: on the first `tool_call` whose id has no server-side decision receipt
within a short grace window, it cancels the run with `errorFamily:
policy_denied` and an error event naming the id.

## Settings sources (review)

The adapter reads `~/.claude/settings.json`, `<cwd>/.claude/settings.json`,
`<cwd>/.claude/settings.local.json` and managed settings regardless of
`settingSources: []`. The worktree cwd carries the repo's own
`.claude/settings.json`. Rules: `session/set_mode default` after every
new/load (d-0049); the driver logs which of the four files exist at start;
probe whether project `permissions.allow` is applied adapter-side before
`request_permission` and record it.

## ACP engine rules (measured, must hold)

1. Child env: copy of `req.env` + `prepareRun().env`; strip `CLAUDECODE`,
   `CLAUDE_CODE_ENTRYPOINT`, `FORGE_HOOK_CONFIG`.
2. `initialize`, then wait for `_auth/status_update` with `kind: account`
   (timeout → `auth`). Read `_meta.steering.supported` from the response.
3. `session/new` (or `session/load` on resume) with
   `_meta.claudeCode.options = { settingSources: [], strictMcpConfig: true,
   allowDangerouslySkipPermissions: false, maxTurns, maxBudgetUsd, model,
   settings: <rendered settings path> }` and `mcpServers` from `prepareRun`.
4. **Immediately** `session/set_mode default` after every new/load; failure →
   abort, `policy_denied`.
5. `session/update` → normalised `RunEvent`s (`text`, `tool_call`,
   `tool_result`, `usage`, `session`, `permission`); unknown kinds dropped with a
   debug log, never crash.
6. Steer: `steer` → `_session/steering` when `_meta.steering.supported`, else not
   declared; `follow_up` = queued prompt; `interrupt` = `session/cancel` then
   prompt. Echo each delivery as an `inbox_delivered` event.
7. `cancel`: `session/cancel`, grace period, then kill the process tree
   (`taskkill /T /F /PID` on win32, process group elsewhere).

## Result + error families

| Signal | ACP | CLI | Family / status |
|---|---|---|---|
| Budget | `session/prompt` rejects, `errorKindData` budget | `subtype: error_max_budget_usd`, exit 0, no `result` | `budget` |
| Max turns | `stopReason: max_turn_requests` (or prompt rejection with turns kind) | `subtype: error_max_turns` | `max_turns` |
| Refusal | `stopReason: refusal` | refusal text in result | `refused` |
| Rate limit | `_meta["_claude/rateLimit"]`, 429/overloaded | 429/overloaded in stream | `rate_limit` + `retryNotBefore` |
| Auth | no `_auth/status_update` account | auth error text | `auth` |
| Stall | no event for `stallMs` | same | `stall` + cancel |
| Paused | last event is a pending `ask` from `ask_director` | same | `paused` (reason interaction) |
| Unexpected exit | child exit without result | non-zero exit | `crash` |

`filesTouched` comes from `git diff --name-only` against the run's base in the
worktree, never from tool inputs (they are the Worker's claim).

## Tests

- Contract: `__tests__/contract/worker-driver.contract.ts`
  (`describeWorkerDriverContract`) — start → events → result, cancel, resume,
  preflight shape, capabilities stable. Runs against a fake driver and both
  Claude engines on fakes.
- ACP engine against an in-process fake ACP agent (sdk agent side over
  in-memory streams): set_mode after new and load; permission handler answers
  from receipt lookup (allow / no decision → reject); receipt cross-check kills
  on an unreceipted tool id; auth timeout; stall; every row of the result table;
  env stripped; steering path chosen from `_meta`.
- CLI engine against a fake `claude` script replaying stream-json fixtures.
- Live tests gated `FORGE_PROBES=1` (haiku, $0.05): real ACP run, denied write
  gets no file, receipt hook fires, hook id == ACP toolCallId; re-run probe 4
  with the forge MCP server as control.

## Exit

Gates green; contract passes; coverage floor for `packages/drivers/src`;
README (rule 10) documents engines, ports, requirements (`pnpm build`,
logged-in `claude`, bundled CLI version), limits (attribution-only on Windows).
