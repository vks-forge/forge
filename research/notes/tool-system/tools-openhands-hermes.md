# Tool systems: OpenHands vs Hermes Agent (source read)

Repos at `C:\Users\vikas\AppData\Local\Temp\claude\D--VIKASH-software-factory\801e6179-8ddd-46ca-9f10-bb3fa727e27e\scratchpad\clones\`. Paths below are relative to each clone.

- OpenHands: `3f5654ac02c2a74661daa224bcfc8962643a58f2` (2026-10-12).
- Hermes Agent: `53bc70c5ee8544040cd9f0708d25c0f55276a44b` (2026-10-12).

## IMPORTANT scope caveat for OpenHands

The OpenHands clone is NOT the Python agent repo. It is "Agent Canvas", a React/TypeScript frontend (`docs/architecture.md:3`). It contains no `openhands/sdk`, `openhands/tools`, `openhands/agent_server`, `agenthub`, `runtime` or `security` directories. The only Python file is `tools/canvas_ui_tool.py`.

The tool system lives in a separate repo, `OpenHands/software-agent-sdk` (`docs/architecture.md:15` links it). Everything below for OpenHands is therefore what the client reveals through:

- wire types
- the start-conversation payload builder
- UI risk and confirmation handling
- specs and docs

SDK-internal claims (analyzer implementation, sandbox, registry internals) are marked UNVERIFIED. A second pass should clone `software-agent-sdk` for those.

---

# 1. OpenHands (Agent Canvas client + wire contract)

## 1.1 Registry / definition model

- **Python SDK tool model (only local sample).** `tools/canvas_ui_tool.py:43-49` defines a Pydantic `Action` with `Field(description=...)`. `:57-58` defines the `ToolExecutor` (`CanvasUIExecutor.__call__`). `:105` defines `class CanvasUITool(ToolDefinition[CanvasUIAction, CanvasUIObservation])`, registered via `register_tool` / `list_registered_tools` (`:30-37`). Each tool is a typed Action/Observation/Executor triple plus `ToolAnnotations`.
- **MCP-style annotations on every tool.** `tools/canvas_ui_tool.py:136-141` sets `readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False`. `ClassVar user_selectable = False` (`:108`) hides a tool from the picker.
- **Catalogue by name + params, set per agent profile.** `src/api/agent-server-adapter.ts:800-815` (`getAgentTools`): "Unset `tools` is left to the server; a list is sent as given", mapped to `{name, params}`. Planning agent: `:1540-1550` uses `[{glob},{grep},{PLANNING_FILE_EDITOR_TOOL_NAME, params:{plan_path}}]`.
- **Profile tool picker.** `src/constants/profile-tools.ts:16-36`: `absent = standard`, `[] = bare`, otherwise custom. `:38-46`: delegation tools (`task_tool_set`, `workflow_tool_set`) force `task_tracker` onto the parent.
- **Client-defined tools (runtime-injected, JSON schema).** `agent-server-adapter.ts:1383-1392` sends `client_tools: [CANVAS_UI_CLIENT_TOOL, LAUNCH_CHILD_CONVERSATION_CLIENT_TOOL, AUTOMATION_FORM_UPDATE_CLIENT_TOOL]`.
  - Server action kind is `ClientAction_<name>` (`src/constants/canvas-ui.ts:2-10`).
  - Server caches schema per tool NAME for the process lifetime and rejects a different re-registration with `ClientToolSchemaConflictError` (`:1379-1382`).
  - UNVERIFIED (inferred): this is a schema-immutability guard.
- **Versioning.** The client enforces a floor on the server: `src/api/agent-server-compatibility.ts:20-21,81-98` (`MINIMUM_COMPATIBLE_AGENT_SERVER_VERSION`, semver parse, fail closed on unknown version). No per-tool version.
- **Risk classification.** `SecurityRisk` enum UNKNOWN/LOW/MEDIUM/HIGH at `src/types/agent-server/core/base/common.ts:59-64` (inside the 40-90 window). Not on tool declarations in the visible code. Risk is per action instance (see 1.2).

## 1.2 Permission / policy model

- **Per-action risk field on every ActionEvent.** `src/types/agent-server/core/events/action-event.ts:58-61`: `security_risk: SecurityRisk` ("The LLM's assessment of the safety risk of this action").
- **Who sets the risk: the model self-declares (primary), analyzer may override.** `action-event.ts:42-49`: `tool_call` "may contain `security_risk` field predicted by LLM when LLM risk analyzer is enabled, while `action` does not". So the model's tool call carries a risk argument which is stripped from the executed `action` and kept on the event.
  - Analyzer kinds the client can request (`agent-server-adapter.ts:776-786`): `LLMSecurityAnalyzer`, `PatternSecurityAnalyzer`, `PolicyRailSecurityAnalyzer`; default `undefined`.
- **Confirmation policy (3 kinds the client emits).** `agent-server-adapter.ts:763-774`:
```ts
if (conversationSettings.confirmation_mode !== true) return { kind: "NeverConfirm" };
if (conversationSettings.security_analyzer === "llm")
  return { kind: "ConfirmRisky", threshold: "HIGH", confirm_unknown: true };
return { kind: "AlwaysConfirm" };
```
  - The threshold is hard-coded to HIGH in the client. `confirm_unknown: true` means UNKNOWN risk is also confirmed (fail-closed).
  - Sent as `confirmation_policy` (`:1393-1394`; planning agent forces `NeverConfirm`, `:1585`).
  - Settings fields `confirmation_mode` / `security_analyzer` were moved from agent settings to conversation settings (`src/routes/verification-settings.tsx:4-12`).
- **Approval routing.**
  - Execution status enum includes `WAITING_FOR_CONFIRMATION` (`common.ts:32`).
  - UI shows Approve/Reject (`src/components/shared/buttons/conversation-confirmation-buttons.tsx:100-153`) with a HIGH-risk banner (`:117-129`) and keyboard shortcuts Cmd/Ctrl+Enter (continue) and Shift+Cmd/Ctrl+Backspace (cancel) (`:90-98`).
  - Response is `POST /api/conversations/{id}/events/respond_to_confirmation` with body `{accept: boolean}` (`src/hooks/mutation/use-respond-to-confirmation.ts:21-23`; `src/api/event-service/event-service.api.ts:27`).
  - No reason, no scope, no "remember" in the client contract.
- **Remember / scopes / timeouts:** none visible in the client. UNVERIFIED in SDK.
- **Hooks as a second enforcement layer.** `src/types/agent-server/core/events/hook-execution-event.ts:1-60`:
  - Hook types: PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, SessionEnd, Stop.
  - Event fields: `hook_command`, `success`, `blocked`, `exit_code`, `reason`.
  - `src/api/hooks-service.ts` / `agent-server-adapter.ts:1825-1855` map hooks.json (matcher default `"*"`, `timeout`, `async`, `command`/`prompt`/`system_prompt` types).
- **Enforcement point:** server-side in the agent loop, before executing (confirmation is a conversation state). The client cannot bypass it. UNVERIFIED for where exactly in the SDK.

## 1.3 Tool exposure to the LLM

- Server-built from `agent.tools` plus `client_tools`. The client does not build the request list.
- Per-agent toolsets: standard code agent vs planning agent (`glob`, `grep`, plan-only file editor) at `agent-server-adapter.ts:1540-1550`.
- Exec toolset (terminal / file_editor / task_tracker) is "server/SDK's responsibility to restore on the profile path" (`:1347-1355`). A profile-launched agent otherwise has only Finish/Think (software-agent-sdk#3967 cited in the comment).
- Parallel calls: `llm_response_id` "groups related actions from same LLM response... results of parallel function calling" (`action-event.ts:51-56`). Parallel tool calls are supported; grouping id is an event field.
- Progressive disclosure, per-model prompt-based tools: none visible. UNVERIFIED.
- Critic: `critic_result` on ActionEvent (`action-event.ts:63-66`, `base/critic.ts`) with probabilistic feature categories (`agent_behavioral_issues` etc.) is an outcome predictor, not a gate.

## 1.4 MCP integration

- `mcp_config` is a shared top-level field forwarded to the server (`agent-server-adapter.ts:1032-1038,1071-1073`). For ACP agents it is forwarded to the subprocess (`:1431-1432`).
- Settings model `specs/mcp-settings.md`:
  - MCP-001: sparse per-server mutations.
  - MCP-002: secret patches (omit = preserve; value = replace; `null` = clear; redaction sentinel never sent).
  - MCP-003: map key is the stable identity.
- Secrets: encrypted-at-rest, `secrets_encrypted: true` makes the server decrypt (`:1427-1438`). Custom secrets are passed by reference as `LookupSecret` URLs (`/api/settings/secrets/{name}`, `:1276-1286`), not by value.
- Namespacing, per-server allow/deny, timeouts, result caps: UNVERIFIED (server side).
- DefenseClaw integration doc: `docs/DefenseClaw.md:33-39`. MCP servers and skills are scanned pre-run by an external scanner; this is a doc-only integration.

## 1.5 Network/web tools

- None visible in the client. Browser tool and `browser_get_state` referenced in the tool description (`tools/canvas_ui_tool.py:~95-106`).
- LLM egress can be proxied through DefenseClaw guardrail (`docs/DefenseClaw.md:110-140`, set `base_url` to `localhost:4000`; observe vs action mode). Prompt-injection defences: UNVERIFIED.

## 1.6 Audit / telemetry

- Typed event stream under `src/types/agent-server/core/events/`: action, observation, condensation, conversation-state, hook-execution, message, pause, streaming-delta, system, acp-tool-call. Every ActionEvent carries `tool_name`, `tool_call_id`, `tool_call` (raw model call), `llm_response_id`, `thought`, `reasoning_content`, `thinking_blocks`, `security_risk`, `critic_result`, `summary` (`action-event.ts:11-72`).
- Metrics: `max_budget_per_task` plus usage metrics surfaced (`agent-server-adapter.ts:96,466`).
- Transcript export: `src/utils/transcript-export/` (index, load-complete-events), plus automation activity log export. Tamper resistance: none visible. UNVERIFIED.
- Server version asserted via `/server_info` (compat file `:312`).

## 1.7 Cost / rate limits / budgets

- `max_iterations` default 500 (`agent-server-adapter.ts:162-166,1395`), `stuck_detection: true` (`:1396`).
- `max_budget_per_task` metric field (`:96,466`; cloud settings `src/api/cloud/settings-service.api.ts:47`).
- Condenser window for the planner (`:1556-1565`). LLM balance service (`src/api/llm-balance-service.ts`).
- Per-tool limits: not visible.

## 1.8 Sandboxing

- The frontend explicitly does not sandbox (`docs/architecture.md:15-19,75`): local mode gives the agent host filesystem access; Docker sandbox mode is recommended. Cloud: `sandbox_status` lifecycle (`agent-server-adapter.ts:87-88`).
- Runtime services info is injected into the system prompt so the agent uses the right URLs (`:174,290-352`).
- ACP agents (Claude Code, Codex, Gemini CLI, Pi, OpenCode) run as server-spawned stdio subprocesses; they manage their own tools (`docs/ACP_AGENTS.md:10-34`). This bypasses OpenHands' confirmation policy.
  - Inference, UNVERIFIED: ACP agents use their own permission model.

## 1.9 Extensibility

- Client tools via JSON schema (above). Skills from `.agents/skills/` (user and project; loaded at conversation start, `docs/DefenseClaw.md:104`). Hooks via hooks.json. ACP provider registry upstream in the SDK (`docs/ACP_AGENTS.md:46-48`).
- Canvas extensions spec: `specs/canvas-extensions.md` (not read).
- Validation of third-party tools: schema conflict error only. Otherwise UNVERIFIED.

## 1.10 Weaknesses and ideas

Weaknesses (visible):

- Risk is self-declared by the model unless an analyzer is attached. `LLMSecurityAnalyzer` is the same model family judging itself.
- ConfirmRisky threshold fixed at HIGH in the client. The approval response has only `accept: boolean`: no deny reason, no scope, no "always allow this pattern", no timeout visible.
- Local mode has no isolation by default.
- ACP subprocess path sits outside the confirmation policy (inference).

Steal:

1. Risk as a typed, ordered, per-action field with explicit UNKNOWN, plus a `confirm_unknown` flag (fail-closed on unclassified).
2. Separate `tool_call` (raw model output including the risk arg) from `action` (validated executable), both stored on the event.
3. `llm_response_id` grouping for parallel calls.
4. Client-tool registration with schema-immutability enforcement, plus a version floor handshake.
5. Secret-by-reference (`LookupSecret`) in the start payload and sparse-patch secret semantics.

---

# 2. Hermes Agent

## 2.1 Registry / definition model

- **Self-registration at import.** `tools/registry.py:1-6`: each `tools/*.py` calls `registry.register(...)`. `discover_builtin_tools` (`:96-141`) AST-scans modules for module-level `registry.register` calls, memoizes the verdict on disk by `(mtime_ns,size)` (`:144-178`), and skips packages lacking `__init__.py`.
- **ToolEntry** (`registry.py:181-197`): `name, toolset, schema, handler, check_fn, requires_env, is_async, description, emoji, max_result_size_chars, dynamic_schema_overrides`.
- **Registration validation** (`:666-743`): rejects non-dict schema or non-dict `parameters` at registration time ("Reject malformed schemas at registration, not at request time"). Cross-toolset shadowing is rejected unless `override=True`. Plugin override additionally needs operator opt-in (`allow_tool_override`; `PermissionError` `:706-717`).
- **Scoped registry:** global `_tools` plus per-profile `_scoped_tools` overlays keyed by HERMES_HOME (`:430-445`); `_generation` counter bumps on every mutation (`:444,743`) and keys the definition cache.
- **Availability gating:** `check_fn` with 30s TTL cache and 60s flake grace (`:223-231,325-385`). A failure within 60s of the last success keeps the tool (no cache write); a persistent failure drops it, with a WARNING for core tools.
- **Toolsets:** `toolsets.py`
  - `TOOLSETS` dict via `_ts(description, tools, includes, **extra)` (`:50-52,74-246`).
  - Composite via `includes`; `resolve_toolset` is recursive and cycle-safe with a memo keyed by (name, registry generation, profile scope) (`:341-412`).
  - `_HERMES_CORE_TOOLS` (`:11-39`), per-platform bundles `hermes-telegram` / `-discord` / `-slack` / `-cli` / `-acp` / `-api-server` / `-webhook` (`:193-245`).
  - `posture=True` for `coding` (`:183-188`). `platforms=` gating via `TOOLSET_SESSION_PLATFORMS` (`:249`).
  - Webhook is a safe subset: `["web_search","web_extract","vision_analyze","clarify"]` (`:41-42,234`).
  - Plugin and MCP toolsets are merged in from the registry (`get_toolset` `:279-320`). MCP server named like a built-in gets an alias (`:302-308`).
- **Versioning:** none per tool. Aliases handle renames: `_LEGACY_TOOL_ALIASES` (`model_tools.py:610-613`), "schemas advertise only new names". The registry `_generation` is cache version only.
- **Risk classification of tools:** not on the tool entry. Risk is pattern-based on commands (`tools/approval_detection.py`: `HARDLINE_PATTERNS` `:107`, `DANGEROUS_PATTERNS` `:228`), plus MCP `readOnlyHint` (2.4).
- **Dynamic schemas:** `dynamic_schema_overrides` (`registry.py:196,860-869`) and cross-reference rewriters so the model never hears of an absent tool (`model_tools.py:340-488`, "Cross-references must use that set").
- **Tool-schema sanitiser:** `tools/schema_sanitizer.py` applied last (`model_tools.py:516-520`). Argument coercion repairs string-typed args using the JSON schema (`tools/arg_coercion.py:1-25`).
- **skill_manage:** `tools/skill_manager_tool.py:922-925`, `toolset="skills"`.
  - Create / edit / patch / delete skills as procedural memory under `~/.hermes/skills`.
  - Guards: per-skill lock file (`:85`), read-before-write guard, background-review delete/pinned guards (`:30-33,395-414`), atomic write, optional post-write scan `skills.guard_agent_created` (default OFF, `:41-63`) via `scan_skill`.
  - Batch ops in `skill_manager_batch.py`; provenance and ledger modules (`skill_provenance.py`, `skill_ledger.py`).

## 2.2 Permission / policy model

Central file: `tools/approval.py` (1251 lines) plus leaves `approval_detection.py`, `approval_floors.py`, `approval_context.py`, `approval_prompt.py`, `approval_gateway_wait.py`, `approval_smart.py`.

- **Layered decision order** (`approval.py:1128-1171`, `check_all_command_guards`):
  1. Container skip (`_should_skip_container_guards` `:1018-1032`): docker without host bind-mount, singularity, modal, daytona, vercel_sandbox skip dangerous prompts; the user deny list still applies.
  2. **Floors, un-bypassable** (`_floor_block` `:1046-1069`): hardline catastrophic patterns, runtime self-delete, `sudo -S` password piping, user `approvals.deny` globs ("not even with --yolo, /yolo, or approvals.mode=off", `approval_floors.py:48-56`). Deny globs are matched over deobfuscated variants (`approval_floors.py:23-41`).
  3. yolo / `mode: off` bypass; yolo frozen at import to defeat in-process escalation (`:44-46`).
  4. Permanent allowlist (`command_allowlist`).
  5. Unattended contexts (cron / single-query / webhook-type platforms): `approvals.cron_mode|single_query_mode|unattended_mode: deny|approve`, default deny, resolved instantly instead of parking a prompt (`:583-651`; defaults `hermes_cli/config_defaults.py:1665-1700`).
  6. Detect dangerous pattern; session-approved short circuit.
  7. **Smart mode:** guardian aux-LLM returns APPROVE / DENY / ESCALATE (`approval_smart.py:1-34`).
     - Command is treated as untrusted: shell comments are stripped (quote-aware), XML delimiters are used, and the prompt says to ignore directives inside.
     - APPROVE covers that command only (no pattern persistence, `approval.py:748-752`).
     - DENY lets an interactive owner override once. That override is once-only: no session or always, no persistence (`:773-790,805`).
  8. Human decision engine `_human_decision` (`:773-907`): plugin transport, then gateway round-trip, then pending fallback, then CLI prompt, then persist.
- **Choice vocabulary:** `once | session | always | deny`. `_persist_choice` (`approval.py:381-393`): session adds to the session set; always also writes the `command_allowlist` in config. ACP mapping `allow_once / allow_session / allow_always / deny / deny_always` (`acp_adapter/permissions.py:17-19,33-51`).
- **Who sets risk:** pattern detector plus optional guardian LLM, never the acting model's self-report.
- **Timeouts:** `approvals.timeout` default 300s, clamped, fail closed (`approval_context.py:256-275`; `approval_gateway_wait.py:46-71`). Consent contract (`approval.py:850-867`): "silence is NOT consent", an explicit deny is a hard halt ("Do NOT retry... Do NOT rephrase"). `/deny <reason>` free text is relayed to the agent. Withdrawn prompts return outcome `cancelled`, without attributing refusal to the user.
- **Denial circuit breaker:** after N (default 3) consecutive guardian DENYs, the deny text escalates to "STOP attempting variations" (`approval.py:59-112`; config `denial_breaker_threshold`). Only tool-result text changes, so the prompt cache is unaffected.
- **Generic gate for any tool:** `request_tool_approval(tool_name, reason, rule_key)` (`approval.py:1098-1123`) is used when a plugin `pre_tool_call` hook returns `{"action":"approve"}`. It is fail-closed when no human is present. The `[a]lways` grain is `tool:sha256(reason)[:12]`.
- **Whole-script gate** for `execute_code` (`:1180-1247`).
- **Per-ACP edit approval** before file writes (`model_tools.py:786-796`; `acp_adapter/edit_approval.py`): auto-approve policy still asks on sensitive paths.
- **Scopes:** per session, per profile (permanent list per HERMES_HOME `approval.py:56-57`), per pattern key. Gate flavours (`_GateSpec` `:660-737`): command, code, action.
- **Enforcement point:** inside the tool handler / dispatch before executing (terminal tool calls `check_all_command_guards`; `pre_dispatch_guards` for plugin and ACP edits), not inside the sandbox. Container backends skip it.
- **Destructive slash commands** are confirmed too: `destructive_slash_confirm`, `mcp_reload_confirm` (`config_defaults.py:1691-1698`).

## 2.3 Tool exposure to the LLM

- **Per-request list:** `model_tools.get_tool_definitions(enabled_toolsets, disabled_toolsets)` (`:214-253`). Pipeline (`_compute_tool_definitions` `:499-540`):
  1. `_select_tool_names`: union of enabled toolsets; `disabled_toolsets` are subtracted LAST, so a disabled toolset always wins over a re-enabling composite (`:315-337`).
  2. `registry.get_definitions` runs `check_fn` filtering and dynamic overrides (`registry.py:843-871`).
  3. Dynamic cross-reference rewriters.
  4. Schema sanitiser.
  5. Tool Search assembly.
- **Memoization:** key = scope, toolsets, registry generation, config.yaml stat signature, kanban, delegated child, profile (`:256-279`). Cache is returned as a shallow copy (a duplicate-name bug caused HTTP 400 on some providers, `:229-253`).
- **Per-platform selection:** config `platform_toolsets: {cli:[hermes-cli], telegram:[...]}` (`cli-config.yaml.example:1409-1419`), custom lists allowed (`:1382-1398`). The top-level `toolsets:` key is deprecated (`:1539`). Coding posture is auto-selected in a code workspace (`toolsets.py:179`).
- **Progressive disclosure ("tool search")** `tools/tool_search.py:1-8`:
  - MCP/plugin tools plus a curated deferrable core set are replaced by 3 bridge tools `tool_search / tool_describe / tool_call`.
  - Core tools never defer. The listing budget is `min(listing_max_tokens=4000, threshold_pct=5% of context)` (`:47-51,77`).
  - Listing degrades full, then names, then mixed, then groups, then none (`model_tools.py:490-496`).
  - Bridge `tool_call` unwraps to the real tool name so all hooks and approvals see the real name (`model_tools.py:899-919`). It is validated against the session-scoped catalog and the concrete schema (`:733-745`), up to 7 queries and 10 describes per call (`tool_search.py:41-42`).
- **Parallel calls:** `_NEVER_PARALLEL_TOOLS`, `_PARALLEL_SAFE_TOOLS` (read-only), and path-scoped readers/writers admitted by path overlap (`agent/tool_dispatch_helpers.py:30-50`, `_should_parallelize_tool_batch :244`). MCP tools can be declared parallel-safe (`:107`).
- **Per-model differences:** Anthropic OAuth wire form aligns with `mcp__server__tool` naming (`mcp_tool_schema.py:156-162`). Schemas are sanitised for llama.cpp grammar converters (`model_tools.py:514-520`). Unique tool names enforced for DeepSeek/Kimi. No prompt-based tool-calling fallback found. UNVERIFIED beyond those greps.
- **Agent-loop tools** (`todo_list, memory, session_search, delegate_task`) are intercepted by the loop (`model_tools.py:606,934-935`).

## 2.4 MCP integration

- Config `mcp_servers:` in config.yaml (stdio `command/args/env`, `url` for HTTP/SSE; `cli-config.yaml.example:1577-1600`). One background asyncio loop, one long-lived Task per server (`tools/mcp_tool.py:1-12`).
- **Naming:** `mcp__<server>__<tool>`, non-`[A-Za-z0-9_]` chars replaced with `_` (`mcp_tool_schema.py:147-162`). Collision resolution (`mcp_tool_registration.py:~408`). Toolset `mcp-<server>` with bare alias.
- **Per-server allow/deny:** `tools.include` whitelist (`[]` registers nothing), `tools.exclude` blacklist, fnmatch globs, include wins (`mcp_tool_registration.py:217-231`). `tools.resources` / `tools.prompts` toggle the utility tools (`:157-167`). `enabled:` per server.
- **Trust tiers:** `trust: full|untrusted`, unrecognised becomes untrusted (fail closed) (`mcp_tool_registration.py:37-45`). `readOnlyHint` captured at discovery (`:61-80`). For `untrusted` servers a write-capable tool (no `readOnlyHint=true`) goes through the human approval gate at call time (`mcp_tool_handlers.py:60-85`); an approval-system error is fail-closed.
- **Timeouts:** tool call default 300s (`mcp_tool_common.py:41`), per-server `tool_timeout`. Circuit breaker with threshold and cooldown, half-open probe (`mcp_tool_handlers.py:88-100`). Dead-stdio respawn, auth-401 refresh, session reconnect (`:2`).
- **Result caps:** `tool_budget.mcp_result_size_chars`, default 50,000 vs 100,000 generic, spill to disk with a preview (`tools/budget_config.py:13-18,25-39`; `cli-config.yaml.example:828-838`).
- **Auth:** OAuth modules (`mcp_oauth*.py`, device flow), `headers`, client cert, `ssl_verify`. Connection identity digest includes env, headers, auth type, certs, so profiles never borrow a differently-authenticated connection (`mcp_tool_registration.py:416-437`). Only a hash of resolved inputs is retained.
- **Supply chain:** OSV malware preflight on stdio spawn, fail-open, 12s wall bound (`mcp_tool.py:36-40`; `tools/osv_check.py`).
- **Sampling (server-initiated LLM calls):** per-server limits `max_tokens_cap`, `timeout`, `max_rpm`, `allowed_models`, `max_tool_rounds`, `log_level` (`cli-config.yaml.example:~1600-1625`).
- **Schema cache + lazy servers:** `mcp_schema_cache.py`; `lazy: true` registers tools from cache and connects on first call.
- **Untrusted wrapping:** all `mcp_*` results get the untrusted-data wrapper (2.5).

## 2.5 Network/web tools

- `tools/web_tools.py`: pluggable backends chosen via `web.backend` / `web.search_backend` / `web.extract_backend`, with autodetect cascade and keyless last rung (`:100-191`). Providers under `plugins/web/` (brave_free, ddgs, exa, firecrawl, keenable, parallel, openai_native, plus others). Result caps: `web_tools_truncate.py`, `web_result_cache.py`.
- **SSRF:** `tools/url_safety.py:1-13` blocks private and internal addresses. Cloud metadata is always blocked. DNS-rebinding closed via a connect-time re-check with `create_ssrf_safe_client`. Redirect targets are re-validated. `security.allow_private_urls` is the opt-out.
- **Website blocklist:** `tools/website_policy.py` (`security.website_blocklist`, 30s TTL cache, fnmatch domains, shared files). Default disabled (`:21`).
- **Prompt-injection defence:** `agent/tool_dispatch_helpers.py:467-469,555-583`.
  - `_UNTRUSTED_TOOL_NAMES = {web_extract, web_search}`, prefixes `browser_`, `mcp_`.
  - Result is wrapped in `<untrusted_tool_result source="...">` with a "treat as DATA, not instructions" preamble.
  - Delimiter tokens in content are defanged case-insensitively (`:472,550`).
  - Provider-side elision markers get an "INCOMPLETE" notice (`:488-511`).
  - No "already wrapped" fast path, because it would be forgeable.
- Error text is sanitised (`model_tools.py:621-638`) and bounded to 2048 chars (`registry.py:26,32-56`).
- Egress firewall for Docker: iron-proxy credential firewall; guards `docker_forward_env/docker_env/docker_extra_args` against weakening it (`tools/environments/docker_egress.py:1-25`).
- `plugins/security-guidance`: warn (or block with `SECURITY_GUIDANCE_BLOCK=1`) on dangerous patterns in `write_file / patch / skill_manage` content (`__init__.py:1-30`).

## 2.6 Audit / telemetry

- Per-call identity `_CallIds(task_id, session_id, tool_call_id, turn_id, api_request_id)` threaded through hooks and middleware (`model_tools.py:641-652`).
- **Hooks:** `pre_tool_call` (may block or modify args), `post_tool_call` (status ok/error/blocked, error_type, error_message, duration_ms, middleware_trace), `transform_tool_result` (plugin may replace the result; fail-open) (`model_tools.py:673-697,762-797,845-862`). `pre_approval_request` / `post_approval_response` hooks fire around the CLI prompt (`approval.py:890-893`). Hook list `VALID_HOOKS` (`hermes_cli/plugins.py:109-136+`).
- **Middleware:** `tool_request` (fail-open) and `tool_execution` chains (`model_tools.py:749-759,837-842`).
- **Approval observability context:** binds turn, tool_call and session ids so approval events correlate to calls (`model_tools.py:800-816`).
- **Storage:** SessionDB (`hermes_state*.py`, FTS, WAL, rewind, tool-retry stamps on the tool row's `display_metadata` so the replayed row stays byte-identical, `hermes_state_tool_retries.py:1-6`).
- **Trajectory export:** `agent/trajectory.py:37-60` appends ShareGPT-format JSONL under file lock to `trajectory_samples.jsonl` / `failed_trajectories.jsonl` (the latter for incomplete runs). `batch_runner.py`, `trajectory_compressor.py`.
- **Observability plugin:** `plugins/observability/langfuse`. Metrics export only builtin tool names, so plugin and MCP names never leave the machine (`toolsets.py:251-254`).
- **Tamper resistance:** none (plain JSONL/SQLite, no hash chain or signing). UNVERIFIED for the plugin side.

## 2.7 Cost / rate limits / budgets

- **Iteration budget:** `IterationBudget(max_total)` thread-safe consume/refund (`agent/iteration_budget.py:28-56`); parent `agent.max_turns` default 500 (`cli-config.yaml.example:1169`; constructor default `sys.maxsize` `run_agent.py:241`); each subagent has its own `delegation.max_iterations` default 50. `execute_code` iterations are refunded. Budget warnings are injected as cache-safe tool-result text. Also a wall-clock `run_budget_seconds` (`run_agent.py:271`) and a gateway inactivity timeout (`cli-config.yaml.example:1172-1176`).
- **Per-result and per-turn tool output budgets:** 100K chars per result, 200K per turn, 1.5K preview, scaled down for small context windows to 15% per result and 30% per turn with floors (`budget_config.py:11-14,63-114`). `read_file` is pinned infinite to avoid persist-read loops. Per-tool override via registry `max_result_size_chars` (`registry.py:194,928-936`). Overflow spills to disk with a preview.
- **Approval-side budgets:** guardian aux-LLM cost bounded by the denial breaker. MCP sampling `max_rpm`, `max_tokens_cap`.
- **Account/credit tracking:** `agent/account_usage.py`, `credits_tracker.py`, `billing_usage.py`. A dollar budget per task was not found. UNVERIFIED.

## 2.8 Sandboxing / isolation

- `terminal.backend`: local (default), ssh, docker, singularity, modal (plus managed_modal), daytona, vercel_sandbox, plus plugin backends (`cli-config.yaml.example:421-520`; `tools/environments/*`; selected via `TERMINAL_ENV`, `terminal_tool.py:431`).
- **Docker hardening:** `--cap-drop ALL`, no-new-privileges, pid limits, tmpfs /tmp (nosuid), /var/tmp noexec (`tools/environments/docker.py:3,305-313,363-364`). `docker_mount_cwd_to_workspace` off by default ("SECURITY: off by default", `cli-config.yaml.example:429`). Egress proxy (above). Resource limits `container_cpu/memory/disk`, persistence flag (`:522-528`).
- **Approval/sandbox interaction:** isolated backends skip dangerous-command prompts; Docker with host bind-mounts does not (`approval.py:1018-1032`).
- `execute_code` runs a Python script that calls tools via RPC (`code_execution_tool.py`, `code_kernel*.py`). Whole-script approval applies in gateway/ask contexts. A purely local non-interactive session is documented as approved (trusted by config) (`approval.py:1185-1193`).
- Subagents: `DELEGATE_BLOCKED_TOOLS` (no recursion, clarify, memory, send_message, cronjob, start_chat); child toolsets must be a subset of the parent's tools (`delegate_tool_toolsets.py:11-45`). Optional subagent git worktree (`subagent_worktree.py`).
- Browser: CDP/Camofox/Lightpanda plus `browser_vault` (credential input never reaches the model, `model_tools.py:425-452`).

## 2.9 Extensibility

- **Plugins:** directory or entry-point plugins with a manifest (`plugin.yaml`, `hermes_cli/plugins_manifest.py`, `SUPPORTED_MANIFEST_VERSION`), `register(ctx)`; `ctx.register_tool()`, hooks (`VALID_HOOKS`), middleware (`VALID_MIDDLEWARE`), platforms.
- **Declared capabilities with consent** (`hermes_cli/plugin_capabilities.py:28-45`): `tools.override`, `llm.provider_override`, `llm.model_override`, `llm.agent_id_override`, `llm.profile_override`, `llm.task_override`, `gateway.platform_actions`. "ONLY capabilities with an existing enforcing surface" and each carries a risk description on a consent screen. State in `plugins.entries.<id>.granted_capabilities`/`capabilities_consent`.
- **Registry protections against hostile plugins:** override opt-in; plugin may not name another profile's scope; may not deregister tools it does not own (`registry.py:745-760`); plugin namespace attribution via frame inspection (`:657-664`). Same-name registration in the same toolset silently overwrites (`:~103 note`). Sorted import order is used to make that deterministic.
- **Skills:** `skills_guard.scan_skill`, `skills_ast_audit.py`, `skill_linter.py`, hub install pipeline with source adapters (`skills_hub_*.py`), `skill_provenance.py`. Agent-created skill scan is opt-in (default off).
- Custom toolsets at runtime: `create_custom_toolset` (`toolsets.py:481-483`); BUILTIN_* frozen sets snapshot before additions.

## 2.10 Weaknesses and ideas

Weaknesses:

- Approval keys on shell-command regex, not on a typed risk per tool. Anything reachable through a non-shell tool (`execute_code`, MCP on `trust: full`, browser) is far less gated. `execute_code` in non-interactive local sessions is approved by design (`approval.py:1185-1193`).
- Huge surface and global mutable state (module-level dicts, contextvars, env flags such as `HERMES_EXEC_ASK`). Many special cases per platform.
- Containers skip approvals entirely, so sandbox escape or bind-mount mistakes become the only control.
- No tamper-evident audit; trajectories are plain JSONL. No per-task dollar budget found. No per-tool schema version.
- Agent-created skill scanning off by default, although a skill is persistent instruction injection.
- Guardian LLM shares the primary stack (mitigated by comment stripping and delimiters, but still an LLM verdict).

Steal:

1. Un-bypassable "floor" tier (hardline plus user deny globs evaluated on deobfuscated variants) that runs before yolo, mode=off and container skips (`approval.py:1046-1069`).
2. Consent contract text: silence is not consent, an explicit deny is a hard halt, a deny reason is relayed to the agent, a denial circuit breaker changes only tool-result text (cache-safe), and withdrawn prompts are `cancelled` (not attributed to the user).
3. Unattended-context policy (`cron_mode / single_query_mode / unattended_mode: deny|approve`) so a gate never parks on an unanswerable prompt.
4. Tool Search bridge with budgeted listing tiers and unwrap-to-real-name so approval, hooks and scope checks still see the real tool, plus `disabled_toolsets` subtracted last.
5. Registry-time schema validation, override-opt-in, scope-overlaid registries, `check_fn` with flake grace, plus capability-declared plugins with consent.
6. Untrusted-content wrapper with delimiter defanging and MCP `trust: untrusted` + `readOnlyHint` gating of write tools.
7. Size-scaled result budget: per-result and per-turn caps as a fraction of the model context, spill-to-disk with preview.

---

# 3. Comparison

| repo | registry | policy scopes | ask routing | MCP | web tools | receipts | budgets | sandbox |
|---|---|---|---|---|---|---|---|---|
| OpenHands (client view; SDK UNVERIFIED) | Typed `ToolDefinition` Action/Observation/Executor + `ToolAnnotations` (readOnly/destructive/idempotent/openWorld). Per-profile `tools:[{name,params}]`; `client_tools` JSON schema; schema-conflict guard; server version floor | Per conversation: `NeverConfirm` / `AlwaysConfirm` / `ConfirmRisky(threshold HIGH, confirm_unknown)`; per-action `security_risk` LOW/MED/HIGH/UNKNOWN, model-declared or analyzer (LLM / Pattern / PolicyRail); hooks PreToolUse can block. No session/always scope visible | WAITING_FOR_CONFIRMATION state; `respond_to_confirmation {accept}` over REST; UI banner on HIGH; no reason, no timeout visible | `mcp_config` map forwarded to server; secrets encrypted/by-reference; sparse patch semantics; rest UNVERIFIED | Not in client; DefenseClaw proxy/scanner doc only | ActionEvent with raw `tool_call`, risk, thought, critic_result, `llm_response_id`; HookExecutionEvent; transcript export; no tamper evidence visible | `max_iterations` 500, stuck_detection, `max_budget_per_task` metric, condenser | Not in client (host by default; Docker recommended); ACP subprocess agents outside policy (inferred) |
| Hermes Agent | Self-registering `ToolEntry` + `check_fn` + scoped overlays + generation counter; static `TOOLSETS` with `includes`, platform bundles, postures; schema validated at register; aliases for renames | Layers: container skip, unbypassable floors (hardline + user deny), yolo/off, allowlist, unattended modes, pattern detect, smart guardian LLM, human; choices once/session/always/deny; per profile, per pattern key; MCP `trust` tiers | Plugin transport, gateway push (Telegram/Discord/Slack buttons, `/approve`, `/deny <reason>`), CLI prompt, ACP permission options, MCP elicitation; timeout 300s fail closed; hooks around prompt | `mcp__server__tool`, include/exclude globs, trust full/untrusted + readOnlyHint gate, per-server tool_timeout (300s), circuit breaker, OAuth, OSV preflight, sampling limits, 50K result spill, lazy servers, tool-search deferral | Pluggable backends (Firecrawl, Exa, Brave, DDGS, etc.), SSRF guard with rebinding and redirect checks, blocklist, untrusted-result wrapper with delimiter defanging, docker egress proxy | `_CallIds` on every hook; pre/post/transform hooks; middleware trace; SessionDB (SQLite); ShareGPT JSONL trajectories; Langfuse plugin; no tamper evidence | `IterationBudget` (500 parent / 50 subagent, refunds), run wall-clock, per-result/per-turn char budgets scaled to context, MCP sampling rpm/tokens; no $ cap found | local/ssh/docker/singularity/modal/daytona/vercel + plugin backends; docker cap-drop ALL, no-new-privileges, pids, tmpfs, egress proxy; approvals skipped inside isolated backends |

---

# 4. Steal list (consolidated, ranked)

1. **Floors before yolo** (Hermes `approval.py:1046-1069`). A hardline plus operator-deny tier that nothing downstream can override, matched on normalized/deobfuscated forms, with the "unbypassable even in container/yolo" invariant tested.
2. **Typed per-action risk with fail-closed UNKNOWN** (OpenHands `SecurityRisk` + `ConfirmRisky{threshold, confirm_unknown}`). Combine with Hermes's rule that risk is assigned by the platform (pattern or independent analyzer), never trusted from the acting model. Store the raw model call and the validated action separately.
3. **Consent contract and decision vocabulary** (Hermes `_human_decision`): once / session / always / deny with deny-reason relay, silence-is-not-consent, `cancelled` as a distinct outcome, denial circuit breaker that edits only tool-result text, and unattended-context modes (`deny|approve`) so no gate waits on nobody.
4. **Tool Search bridge** (Hermes `tool_search.py`): deferred MCP/plugin tools behind search/describe/call, budgeted listing tiers, unwrap-to-real-name before policy, session-scoped catalog, and `disabled_toolsets` applied last.
5. **MCP governance bundle** (Hermes): `mcp__server__tool` namespacing, include/exclude globs, `trust: untrusted` + `readOnlyHint` write gate, per-server timeouts and circuit breaker, connection identity digests including credentials, spill-to-disk result cap, untrusted-result wrapper with delimiter defanging.
6. **Registry hygiene** (Hermes): validate schemas at registration, reject cross-toolset shadowing, plugin override opt-in with declared capabilities and a consent record, `check_fn` flake grace, generation-keyed definition cache.
7. **Client-tool schema immutability + version floor handshake** (OpenHands), and secret-by-reference in start payloads.

Gaps neither covers (design opportunities): tamper-evident per-call receipts (hash chain or signed), a per-task dollar budget enforced at the tool boundary, per-tool versioning, and risk declared on the tool definition (not only inferred from the command).
