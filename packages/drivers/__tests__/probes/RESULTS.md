# Slice 2 preflight probe results

Run with `pnpm probes` (sets `FORGE_PROBES=1`). Host: Windows 11, Node 24.20, subscription auth,
`@agentclientprotocol/claude-agent-acp@0.89.1`, `@agentclientprotocol/sdk@1.8.0`.
All 16 probe tests passed in the 2026-10-13 runs (probes 1-7; probe 8 lives in `apps/server` and is recorded below; after the two assertion updates noted under probes 1 and 5). Every child run strips `CLAUDECODE` and
`CLAUDE_CODE_ENTRYPOINT` from its env.

**Which Claude Code binary each probe measured (d-0053).**

| Probes            | Engine                                                                                                               | Claude Code version |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1-2 (`claude -p`) | host `claude` on PATH                                                                                                | 2.1.296             |
| 3-5 (ACP)         | binary bundled with the SDK the adapter loads, `node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-win32-x64@0.3.293` | 2.1.293             |

The ACP adapter resolves its own bundled binary and Forge does not set `CLAUDE_CODE_EXECUTABLE`, so the
host version never affects probes 3-5.

**Since B6 (d-0087, d-0101):** the measurements below were taken on the bundled 2.1.293. The probe helper
(`helpers/acp-probe.ts`) and the driver now set `CLAUDE_CODE_EXECUTABLE` to the installed `claude`, so
probes 3-6 run on the user's build; probe 3 asserts on Windows that the adapter's child process is that
executable. Results recorded before B6 stay as measured; re-probe against the installed build per d-0088.

**Re-probe trigger (d-0053):** re-run `pnpm probes` and update this file on a host Claude Code upgrade
**or** an adapter / SDK version bump.

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
- Budget exhaustion (measured 2026-10-13, host 2.1.296): `--max-budget-usd 0.0001 --model haiku` gives
  `subtype: error_max_budget_usd`, `is_error: true`, `terminal_reason: budget_exhausted`, `errors: ["Reached maximum
budget ($0.0001)"]`, no `result`, and **exit 1** (an earlier run with a larger budget exited 0). The exit code is
  not a signal: the driver classifies from `subtype` and the probe accepts 0 or 1.
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
  `_auth/status_update` with `{authStatus: {kind: "account", label, account: {...}}}`; received three times
  per run. `kind: "account"` confirms subscription auth. The test asserts `kind === "account"` only; no
  account identifiers are recorded.
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

## Probe 4: `strictMcpConfig` on ACP (d-0049) - PASS (strict case); control INCONCLUSIVE

Prompt "list the names of every MCP tool available to you, one per line, or say NONE", cwd = empty temp dir
outside the repo, `session/set_mode default` after `session/new`, haiku, `maxTurns: 2`.
The host had several user-level MCP servers and one repo-level server configured (names omitted).

- Strict (`strictMcpConfig: true, mcpServers: {}, settingSources: []`): agent said `NONE`, added that every
  tool is a built-in harness tool; no `mcp__` string in agent text or any `session/update`. Asserted.
- Control (`strictMcpConfig: false`, other options unchanged): agent also said `NONE`; no `mcp__` name seen,
  no user server name matched. Recorded, not asserted.
- **Why the control proves nothing:** the strict run and the control are indistinguishable here, so this probe
  does not show that `strictMcpConfig` is what hides the servers. Likely causes: the listed user servers did
  not connect on this host at probe time (several are known to fail to start), and/or MCP tools are deferred
  behind tool search so the model does not see names. The repo-level server was not exercised (cwd is
  outside the repo by design). To make the check discriminating, add a positive control that starts a known-good
  stdio MCP server with `strictMcpConfig: false` and shows its tool name appears. Not done.
- Net: `strictMcpConfig: true` leaks no MCP tool in this setup (observed); that it is the cause is unproven.

## Probe 5: hooks and user settings under ACP (d-0049) - PASS (per-run hook); user hooks not observable

- (a) `_meta.claudeCode.options.settings = <path to per-run settings.json>` with a `PreToolUse` hook
  (`matcher ".*"`, `node <abs hook.cjs>`, exit 2, `onFailure: "block"`, `timeout: 5`): the hook log line
  `PreToolUse tool=Bash` exists, the `tool_call_update` ended `failed` with the hook's block message in its
  content, zero `session/request_permission` requests (the hook denied before the permission step), the
  agent reported the command did not run. **Per-run hooks via `_meta` settings work on ACP.** Tool name in the
  hook payload is `Bash` on ACP (not `PowerShell`, which is the CLI's).
- (b) User hook events defined in the host's user `settings.json` (names only): SessionStart, UserPromptSubmit,
  PreToolUse, PostToolUse, PostToolUseFailure, Stop, StopFailure, SubagentStart, SubagentStop, TeammateIdle,
  PermissionRequest, PreCompact, PostCompact, SessionEnd. Whether they fire under ACP is **not observable
  without modifying user settings**: their effects are side effects outside the protocol traffic. The
  orchestrator should treat all 14 events as potentially live for a Worker (SessionStart, UserPromptSubmit,
  PreToolUse, PermissionRequest are the ones that could alter or block Worker behaviour).
- `defaultMode` leak reproduced (d-0048 item 6): the host user's `permissions.defaultMode` was `acceptEdits` and
  the new session's `modes.currentModeId` before our `set_mode` was `acceptEdits` even with
  `settingSources: []` and `strictMcpConfig: true` (first recorded run, user settings source). `set_mode default`
  remains required.
- Project source (measured 2026-10-13): a session whose cwd `.claude/settings.json` sets `defaultMode: acceptEdits`
  starts in `default`: the adapter filters an escalating default mode from the project source. The probe now pins
  that, plus that `set_mode default` is accepted and no mode update contradicts it. The user-source leak is not
  re-measured (the probe no longer touches the user's config).

## Probe 6: Claude driver on the real ACP adapter - PASS

`probe6-claude-driver.test.ts` (gated `FORGE_PROBES=1`, haiku, needs `pnpm build` for the hook), 2026-10-13:

- A plain run (`reply with the single word pong`) through `createClaudeDriver` ends `success` with a session ref.
- A write the hook server denies creates no file; the hook fired.
- **The hook's `tool_use_id` equals the ACP `toolCallId`** for the observed calls, so the receipt cross-check and
  the permission handler join on the id; the (tool name, args hash) fallback is not needed for native tools.
- Still open: that PreToolUse fires for `mcp__forge__*` tools under ACP and the `name` the adapter reports for them
  (re-run probe 4 with the forge MCP server as a positive control); whether project `permissions.allow` is applied
  adapter-side before `session/request_permission`; the real ACP wording for budget and turn-cap errors.

## Probe 7: Claude DirectorLLM on the real CLI - PASS

`probe7-director-llm.test.ts` (gated `FORGE_PROBES=1`, haiku, `--max-budget-usd 0.05`, trivial schema `{answer: 'ok'}`),
run 2026-10-13 on host 2.1.296:

- All eight flags work together live: `--json-schema`, `--tools ""`, `--setting-sources ""`,
  `--no-session-persistence`, `--permission-prompts none`, `--max-budget-usd`, `--model`, `--output-format json`.
- `--output-format json` prints **one** `result` object (not an array): `type: result`, `subtype: success`,
  `is_error: false`, `terminal_reason: completed`, `num_turns: 2`.
- `structured_output` **is populated** with the schema-shaped value (`{"answer":"ok"}`); `result` carries the same
  value as a JSON string. The adapter returned `{ ok: true, value: { answer: 'ok' } }`.
- Cost field is `total_cost_usd` (0.0126 USD for one trivial step on haiku); a schema step takes 2 turns.

## Probe 8: Express ticket end to end on the real Claude harness (server) - PASS on the second run

`apps/server/__tests__/probes/probe8-express-e2e.test.ts` (gated `FORGE_PROBES=1`), 2026-10-13, host Claude Code
2.1.296, ACP adapter 0.89.1 (bundled CLI 2.1.293). Director steps on opus (d-0060 matrix), Worker on sonnet, local-bare host.

- Run 1: FAIL after 98 s. The ticket parked in `waiting_human` (`policy_denied: not retried automatically`). Cause: the
  receipt cross-check killed a healthy Worker, not a policy decision. The ACP adapter announces a tool call as the model
  starts writing it (`tool_call` with `rawInput: {}`); the PreToolUse hook only runs once the whole input has streamed.
  The Worker wrote two `Edit` calls back to back; the second was announced at 17:35:07.9 and its hook had not posted
  3 s later, so the supervisor cancelled the run (`tool call ... (Edit) has no server-side decision receipt`). The hook
  never got to post for it. Fix: a call announced with an empty input is cross-checked when its result arrives, or when
  the turn ends normally without one (`run-supervisor.ts`); calls announced with their input keep the immediate check.
- Run 2: PASS in 205 s (ticket `done`, `success`, cost 0.088 USD for the Worker). G1 `passed` (chain of 20 receipts, 11 tool
  calls all receipted, 6 claims supported, test diff clean, `npm test` and lint pass); `add` is in the bare repo's `main`;
  `hook_liveness` registered; `verifyChain` ok.
- Measured: the hook latency from the ACP `tool_call` announcement to the stored decision is 2-4 s for reads and 2.3 s+ for
  an edit on this box (it includes the model finishing the input), so a fixed 3 s grace from the announcement is not safe.
- Measured: `PreToolUse` fires for `mcp__forge__finish` under ACP and gets a decision receipt (closes the open item of
  probe 6). The run recorded two `finish` decisions (the first effect `uncertain`, the second `mutation_committed`). Explained
  (2026-10-14, from the stored events): the model's first `finish` call omitted `summary`, the MCP server rejected it
  (`Input validation error ... expected string, received undefined at summary`, `PostToolUseFailure` so the effect is
  `uncertain`), and the model called `finish` again correctly. The hook records one decision per call; this is a Worker
  retry, not a double PreToolUse. G1 accepted the chain.
- Measured: the Worker first tried a compound `cd <worktree> ; ls ; cat ...` shell command (denied `approval/unattended`,
  correct) and the harness `ToolSearch` tool (denied `capability/unknown_tool`); it then used Read/Glob/Edit and `npm test`.
  Denied calls are fed back to the model as hook errors and the run continues; they do not park the ticket.
- Not available: the driver keeps no raw ACP/harness log; the probe's artefacts are the normalised events, receipts, gate
  results and the server log (`.forge/data/probes/8/`).

## Probe 8 follow-up: MCP tool deferral, the one-shot finish, rework claims (2026-10-14)

Probe 8 passed twice on 2026-10-13 and then parked on 2026-10-14 (HEAD 52a41f9): `gate G1 failed after 2 automatic
reworks; G1 claims: finish carried no claims for 2 changed files`. Root causes, from the stored events of the three runs:

1. **Claude Code defers MCP tool schemas behind `ToolSearch`.** The Worker saw `mcp__forge__finish` by name only and called
   `ToolSearch` to load its schema; the catalogue has no `ToolSearch`, so `admit()` denied it (`capability/unknown_tool`) in
   all three runs. Run 1 then called `finish` with a placeholder summary and no claims; the corrected retry was refused
   (`this run has already called finish`). Run 3 never managed to call `finish` at all.
2. **`finish` was one-shot.** The first (empty) call locked the run's claims.
3. **Rework runs could not satisfy `edited` claims.** The worktree already held run 1's edits (committed by the Director), so
   runs 2 and 3 made none; G1 matched claims against the current run's receipts only, so an honest `edited` claim had no
   evidence ("no allowed edit or write receipt with a committed effect for that path").
4. A compound `cd <worktree> ; ls -a ; cat ...` was denied `approval/unattended`: `cd` and `cat` have no allow rule.
   The Worker's cwd is already the worktree.

**Decision on ToolSearch: deferral is disabled, `ToolSearch` is not admitted.** The bundled Claude Code 2.1.293
(`node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-win32-x64@0.3.293/.../claude.exe`, bundled JS) reads
`process.env.ENABLE_TOOL_SEARCH` in its mode function `SDe()`: values `false`, `0`, `no`, `off` (parsed by `ms()`) or
`auto:100` return mode `"standard"` (no deferral, no ToolSearch tool); unset or `true` gives `"tst"`; `auto`/`auto:N` gives
`"tst-auto"`. The same string is in the SDK's list of recognised env names (`claude-agent-sdk/sdk.mjs`, `ENABLE_TOOL_SEARCH`).
The ACP adapter spreads `_meta.claudeCode.options.env` over `process.env` when it builds the query env
(`claude-agent-acp/dist/acp-agent.js`, `const env = { ...process.env, ...userProvidedOptions?.env, ...}` near line 7303),
and Claude Code applies the settings-file `env` block after the process env. The driver therefore sets
`ENABLE_TOOL_SEARCH=false` in both the session `_meta` `env` and the per-run `settings.json` `env` (`WORKER_HARNESS_ENV`,
`packages/drivers/src/domain/worker-env.ts`), so a user-level setting cannot re-enable deferral. No catalogue change, so no
re-sign: the pinned `schema_hash` is over the advertised input schema only, and `finish`'s did not change.

Fixes: `finish` accepts later calls (each its own event; G1 reads the last one, verified in `readClaims`); the Worker
contract states cwd, one command per call, the exact test command and the claim rules and is appended to the prompt
verbatim; G1 counts receipts of the ticket's earlier runs as claim evidence (own chain still verified alone); policy lifts
the `ask` for a `cd` to exactly the run's own cwd (`builtin:cd-cwd`), nothing else.

Re-run after the fixes (HEAD 52a41f9 plus the working-tree changes, `pnpm build` first), three in a row, all PASS: 122 s,
139 s, 112 s. Each ran one Worker run (no rework), `done`, G1 `passed`, **0 denied decisions** (no `ToolSearch`, no compound
shell line), the Worker called `mcp__forge__finish` once with `edited` claims for both files, `added_test` and `ran_tests`.
Worker cost 0.24, 0.10 and 0.10 USD. The rework path (claims backed by an earlier run's receipts) is covered by unit tests,
not exercised live, because no run needed a rework.

## Differences from the design docs

- `--setting-sources` takes `""` (empty) to load nothing; there is no `none` keyword.
- Auth/account reporting is the `_auth/status_update` notification, not part of `initialize`.
- `permissions.defaultMode` from the user's settings leaks through the ACP adapter despite
  `settingSources: []`; driver must `session/set_mode default` after every session creation.
- Default model exceeds a $0.05 budget; budget errors come back with `subtype: error_max_budget_usd`, no `result`, and exit 0 or 1 (classify by `subtype`).
- On Windows the CLI's shell tool is `PowerShell`; hook matchers must not assume `Bash`.
- Per-run hooks via `_meta.claudeCode.options.settings` work on ACP; the hook payload `tool_name` is `Bash`.
- `strictMcpConfig` effect is unproven (control showed no MCP tools either); user hooks on ACP are unobservable.

## Notes after the E2b review (2026-10-14)

- Probe 9 (GitHub App, `packages/git/__tests__/probes/`) now needs `FORGE_PROBE_GITHUB=1` as well as `FORGE_PROBES=1` and the `FORGE_GH_*` variables, so `pnpm probes` never pushes to a real repository because the App variables happen to be set.
- Harness children run with an allowlisted environment (`HARNESS_ENV_ALLOWLIST`); subscription login needs only the profile directory and `CLAUDE_CONFIG_DIR` when set. Probe 8 is the live check that the allowlist does not break the login.
- (Replaced by B7, d-0088: native tool schemas are approved per harness build in the database; see the compatibility notes below.)

## Compatibility check (B7, d-0088), measured 2026-10-15

`checkInstalled` (`pnpm probes`, `probe-compat.test.ts`) drives the real driver, hook and ACP adapter against a local scripted model API (`ANTHROPIC_BASE_URL`, throwaway `CLAUDE_CONFIG_DIR`, fake key): no cost, about 55 s, deterministic.

- The model request carries the exact tool schemas (name, description, `input_schema`) of every built-in tool, and a `user-agent: claude-cli/<version>` header. That is the only place the real schemas are visible (ACP exposes none), and the header proves the installed build ran, not the SDK-bundled one (d-0101).
- ACP session on Windows offers 24 tools: `Agent` (the Task tool is named `Agent` since at least 2.1.293), `Bash` (no `PowerShell`), `Read`, `Write`, `Edit`, `Glob`, `Grep`, ... The CLI engine's list differs (it also offers `PowerShell`), so hashes are per engine.
- Hashes over name plus input schema: 2.1.293 (SDK-bundled binary), 2.1.299 and 2.1.300 (installed) agree on `glob`, `grep`, `edit`, `write`, `shell`, `task`; **only `read` differs** between 2.1.293 and 2.1.299/2.1.300. 2.1.299 and 2.1.300 have identical shapes for all seven. Both 2.1.293 and 2.1.299 pass every check; 2.1.300 passes too. The shipped list (`KNOWN_GOOD_BUILDS`) holds 2.1.293 and 2.1.299.
- The host `claude` updated itself from 2.1.299 to 2.1.300 while B7 was built; a build not on the list is checked on first sight, which is the case the check exists for.
- Under load (four probes in parallel) a healthy build misses the 10 s hook deadline (probe 5 failed the same way): the check then reports `permission_requests`/`receipt_timing` failures. Run probes serially (`pnpm probes --maxWorkers=1`); the server repeats a failed check once before pausing a harness.
