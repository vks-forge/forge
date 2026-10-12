# Slice 2 preflight probe results

Run with `pnpm probes` (sets `FORGE_PROBES=1`). Host: Windows 11, Node 24.20, Claude Code 2.1.296 on a
Max subscription, `@agentclientprotocol/claude-agent-acp@0.89.1`, `@agentclientprotocol/sdk@1.8.0`.
All 9 probe tests pass. Every child run strips `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` from its env.

## Cross-cutting surprise: the default model blows the probe budget

With no `--model`, `claude -p "reply with the single word pong" --max-budget-usd 0.05` returned
`is_error: true`, `subtype: "error_max_budget_usd"`, `terminal_reason: "budget_exhausted"` and **no `result`
field**: the flagship default model spends ~$0.08-0.16 on the ~23k-token system prompt alone. Every probe
therefore passes `--model haiku` (cost ~$0.0015). The driver must set a model explicitly, and must treat a
missing `result` plus `subtype: error_max_budget_usd` as a typed budget error, not as empty output.
Exit code is still 0 on that error, so the exit code alone cannot signal failure.

## Probe 1: subscription auth with settings isolation (d-0031) - PASS

Command (cwd = empty temp dir outside the repo):
`claude -p "reply with the single word pong" --model haiku --output-format json --setting-sources "" --no-session-persistence --max-turns 1 --max-budget-usd 0.05`

- Exit code 0; stdout is one JSON object; `result` contains "pong"; `is_error: false`; authenticated on the
  subscription with no API key set.
- Accepted `--setting-sources` syntax: `--help` says "Comma-separated list of setting sources to load (user,
  project, local)". An **empty string `""`** is accepted and loads none; `local` alone also works. Use `""`.
- Result JSON top-level fields: `type`, `subtype`, `is_error`, `result`, `stop_reason`, `terminal_reason`,
  `session_id`, `uuid`, `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `usage`,
  `modelUsage`, `permission_denials`, `errors` (on failure), `fast_mode_state`, `subagent_stats`,
  `safety_stops`, `queued_turn_count`, `result_index`.
- `usage`: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`,
  `cache_creation{ephemeral_1h/5m_input_tokens}`, `server_tool_use`, `service_tier`, `iterations[]`, `speed`.
- `modelUsage` is keyed by model id with `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
  `cacheCreationInputTokens`, `costUSD`, `contextWindow`, `maxOutputTokens`, `costBasis: "list"`.
  Note `costBasis: "list"`: cost is the list price, not what the subscription is charged.
- `--bare` exists. `--help`: skips hooks, LSP, plugin sync, attribution, auto-memory, keychain reads and
  CLAUDE.md discovery; "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and
  keychain are never read)". Confirms d-0031: `--bare` is API-key mode only. Not used. The test pins that
  help text.
- New flags seen in `--help` that bear on the design: `--safe-mode`, `--restricted`, `--permission-prompts
host|none`, `--include-hook-events`, `--system-prompt-snapshot`. Not evaluated.

## Probe 2: hooks fire and block inside -p (d-0033) - PASS

Settings file (per scenario, under `.forge/data/probes/2/<scenario>/`): `SessionStart` hook and
`PreToolUse` hook with `matcher: ".*"`, each `{"type":"command","command":"node <abs hook.cjs>","timeout":10,"onFailure":"block"}`.
Command: `claude -p "run the shell command: echo hi" --model haiku --settings <file> --setting-sources "" --allowedTools Bash,PowerShell --max-turns 2 --max-budget-usd 0.05 --output-format stream-json --verbose --include-hook-events`

- Exit 0. `SessionStart` and `PreToolUse` lines both appear in the hook log. `onFailure` and `timeout` are
  accepted (hooks ran; `-p` silently ignores invalid settings, so acceptance of `onFailure` is proven by
  the fail-closed scenarios below).
- Block via exit 2 (stderr "blocked by probe hook"): the `tool_result` has `is_error: true` and content
  `PreToolUse:<Tool> hook error: [node <script>]: blocked by probe hook`. No tool stdout `hi` anywhere.
  The model then reported the command did not run.
- **Fail-closed**: hook command pointing at a non-existent file with `onFailure: "block"`: tool blocked,
  `tool_result` is an error reading `failed; blocking because onFailure is "block"` plus node's stack trace.
- **Fail-open control** (same broken hook, no `onFailure`): the tool ran and returned `hi`
  (`is_error: false`). This confirms the d-0033 premise that the default is fail-open; the test is a canary
  that will fail if a future Claude Code changes that default.
- `--include-hook-events` with stream-json emits `system` events `hook_started` / `hook_response`
  (`hook_name`, `hook_event`, `exit_code`, `outcome`, `stdout`, `stderr`); usable for the liveness check.
- Windows: the shell tool the model picks is **PowerShell**, not Bash (tool name in the hook payload is
  `PowerShell`). A matcher of `Bash` alone would miss it; use `.*` or list both. `--allowedTools` must be
  comma-joined (it is variadic and swallows the following args otherwise).
- Isolation check: a project `.claude/settings.json` SessionStart hook did **not** run under
  `--setting-sources ""` and **did** run under `--setting-sources project`.
- The hook payload's `hook_event_name` and `tool_name` fields are present on stdin as JSON.

## Probe 3: ACP adapter (d-0035) - PASS (with two driver-shaping findings)

`pnpm view @agentclientprotocol/claude-agent-acp versions --json`: `0.89.1` exists and is `latest`
(`preview` tag is `0.89.2-preview.10`). Pinned `0.89.1`. SDK `@agentclientprotocol/sdk@1.8.0` is latest.
Server started with `node <pkg>/dist/index.js` over stdio, NDJSON via the SDK's `ndJsonStream`.

- `initialize` (protocolVersion 1): `agentInfo {name "@agentclientprotocol/claude-agent-acp", title "Claude
Agent", version "0.89.1"}`, `agentCapabilities.loadSession: true`, `agentCapabilities.auth: {logout: {}}`,
  `authMethods: []` (no terminal auth advertised for a client without that capability).
  **Auth info is not in the `initialize` response.** It arrives as a separate extension notification
  `_auth/status_update` with `{authStatus: {kind: "account", label: "Claude Max", account: {plan, email,
organization}}}`; received three times per run. `kind: "account"` confirms subscription auth. The test
  asserts `kind === "account"` only; email and organization are not recorded.
- `session/new` with `_meta.claudeCode.options = {settingSources: [], strictMcpConfig: true,
allowDangerouslySkipPermissions: false, maxTurns, maxBudgetUsd: 0.05, model: "haiku"}`: accepted.
  `allowDangerouslySkipPermissions: false` is honoured: the session's `availableModes` are
  `default`, `acceptEdits`, `plan`, `auto` and do **not** include `bypassPermissions`.
- `session/prompt` "reply with the single word pong": `stopReason: "end_turn"`, agent text contains "pong"
  (via `agent_message_chunk`), zero `session/request_permission` requests.
- **Finding A (isolation leak):** `settingSources: []` does not stop the adapter's own `SettingsManager`
  from reading the user's `settings.json`. The session started in `currentModeId: "acceptEdits"` because the
  user's `permissions.defaultMode` is `acceptEdits`, and in that mode a shell command writing a file in the
  cwd ran with **no** permission request. Fix in the driver: send `session/set_mode {modeId: "default"}`
  immediately after every `session/new` / `session/load` (the probe does this), and never rely on the
  initial mode. `permissionMode` is not accepted via `_meta.claudeCode.options` (it is not in the adapter's
  rebuild allow-list).
- **Permission request (after set_mode default), prompt "use the shell tool to run the command: echo hi >
  probe-output.txt"**: the server sends `session/request_permission` to our client:
  ```
  { sessionId,
    toolCall: { toolCallId, kind: "execute", status: "pending", name: "Bash",
                title: "<command>", content: [{type:"content", content:{type:"text", text:"<description>"}}],
                locations: [{path: "<cwd>/probe-output.txt"}],
                rawInput: { command: "<command>", description: "<description>" } },
    options: [ {optionId:"allow-once", name:"Yes", kind:"allow_once"},
               {optionId:"allow-with-updates", name:"Yes, and allow access to ...", kind:"allow_always"},
               {optionId:"reject", name:"No", kind:"reject_once"} ] }
  ```
  Our handler replied `{outcome: {outcome: "selected", optionId: "reject"}}`. The turn ended `end_turn`, a
  `tool_call` update was emitted, and the output file was **not** created. Note the tool name is `Bash` here
  (the adapter's SDK path), unlike the CLI's PowerShell on Windows.
- Not verified: that `strictMcpConfig` actually suppresses MCP servers, and that SDK-level `settingSources: []`
  hides user hooks/CLAUDE.md inside the adapter (Finding A shows adapter-level reads bypass it, so assume
  user settings leak until proven otherwise). `settings` via `_meta` was not exercised.

## Differences from the design docs

- `--setting-sources` takes `""` (empty) to load nothing; there is no `none` keyword.
- Auth/account reporting is the `_auth/status_update` notification, not part of `initialize`.
- `permissions.defaultMode` from the user's settings leaks through the ACP adapter despite
  `settingSources: []`; driver must `session/set_mode default` after every session creation.
- Default model exceeds a $0.05 budget; budget errors come back with exit 0 and no `result`.
- On Windows the CLI's shell tool is `PowerShell`; hook matchers must not assume `Bash`.
