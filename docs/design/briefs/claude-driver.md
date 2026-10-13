# Brief — Claude WorkerDriver (m0-brief slice 2, item 3)

Status: approved to start 2026-10-13 ("fix the 1-4 now then start the new work").
Builds on d-0035, d-0048, d-0049, d-0052, d-0033. Probe facts: `packages/drivers/__tests__/probes/RESULTS.md`.

## Scope

`packages/drivers/src/adapters/claude/`: one `WorkerDriver` (`id: 'claude-code'`)
with two engines picked by config, never by `if` on harness name elsewhere.

- **ACP engine (default).** Spawns pinned `@agentclientprotocol/claude-agent-acp`
  (resolved entry, `node <abs>`, no shell), drives it with `@agentclientprotocol/sdk`.
- **CLI engine (fallback).** `claude -p --output-format stream-json --verbose`
  with `--setting-sources ""`, `--settings <file>`, `--mcp-config <file>`,
  `--strict-mcp-config`, `--max-budget-usd`, `--max-turns`, `--model`,
  `--permission-mode default`, `--resume <session>` on resume.

Out of scope: DirectorLLM, engine tick, HTTP, gates, other harnesses.

## Layering (d-0052)

Drivers import `@forge/core` (+ `@forge/tools` types if needed), never
`@forge/hooks`/`@forge/mcp`/`@forge/db`. Everything run-specific arrives
through injected ports in `createClaudeDriver(deps)`:

- `prepareRun(req) → { settingsPath, mcpServers, env }`: the app renders the
  hook settings (`@forge/hooks`) and the forge MCP server entry (`apps/mcp`)
  and writes them under `.forge/data/runs/<id>/`.
- `decidePermission(runId, call) → 'allow' | 'deny'`: the app wraps `admit()`;
  ACP `session/request_permission` answers from it, `ask` is already `deny`
  on Express (unattended).
- `clock`, `spawn` (injectable for tests), `stallMs` from `RunBudget`.

## Core changes allowed

- `RunRequest.runId` (the Director creates the run row first; handle echoes it).
- Anything else the port needs: change the port, not the caller (rule 2).

## ACP engine rules (measured, must hold)

1. Child env: copy of `req.env` + `prepareRun().env`, strip `CLAUDECODE`,
   `CLAUDE_CODE_ENTRYPOINT`.
2. `initialize`, then wait for `_auth/status_update` with `kind: account`
   (timeout → `errorFamily: auth`).
3. `session/new` (or `session/load` on resume) with
   `_meta.claudeCode.options = { settingSources: [], strictMcpConfig: true,
   allowDangerouslySkipPermissions: false, maxTurns, maxBudgetUsd, model,
   settings: settingsPath }` and `mcpServers` from `prepareRun`.
4. **Immediately** `session/set_mode default` after every new/load (d-0049);
   failure → abort run, `policy_denied`.
5. Every `session/request_permission` → `decidePermission`; any throw → reject.
6. `session/update` notifications → normalised `RunEvent`s (`text`,
   `tool_call`, `tool_result`, `usage`); unknown kinds dropped with a debug log,
   never crash.
7. `steer`: `follow_up` = queued prompt; `interrupt` = `session/cancel` then
   prompt; `steer` only if capability measured, else not declared.
8. `cancel`: `session/cancel`, grace period, then kill process tree
   (`taskkill /T /F /PID` on win32, process group elsewhere).

## Result + error families

- Budget: `subtype: error_max_budget_usd` (exit 0, no result) → `budget`.
- Max turns → `max_turns`; auth missing → `auth`; 429/overloaded → `rate_limit`
  with `retryNotBefore` when given; no event for `stallMs` → `stall` + cancel;
  unexpected exit → `crash`; refusal phrases in final text → `refused`.
- `filesTouched` from tool_call inputs (edit/write paths).

## Tests

- Contract: `__tests__/contract/worker-driver.contract.ts`
  (`describeWorkerDriverContract`) — start → events → result, cancel, resume,
  preflight shape, capabilities stable. Runs against a fake driver and both
  Claude engines on fakes.
- ACP engine against an in-process fake ACP agent (sdk agent side over
  in-memory streams): set_mode sent after new and load; permission deny stops
  tool; auth timeout; stall; budget subtype mapping; env stripped.
- CLI engine against a fake `claude` script replaying stream-json fixtures.
- One live test gated `FORGE_PROBES=1` (haiku, $0.05): real ACP run, denied
  write gets no file, receipt hook fires. Re-run probe 4 with forge MCP as control.

## Exit

Gates green; contract passes; README (rule 10) documents engines, ports,
requirements (`pnpm build`, logged-in `claude`), limits.
