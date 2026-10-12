# OpenHands software-agent-sdk: tool system teardown

Commit: `e3a26821f8f7c85e98078c7b5e1a80647fc7d0c7` (shallow clone). Paths below are relative to `openhands-sdk/openhands/sdk/` (SDK), `openhands-tools/openhands/tools/` (TOOLS), `openhands-agent-server/openhands/agent_server/` (SRV), `openhands-workspace/openhands/workspace/` (WS). Anything not read directly is marked UNVERIFIED.

## Summary table

| Dimension | OpenHands SDK |
|---|---|
| Registry | `Tool{name,params}` spec -> global `_REG` resolver -> `ToolDefinition.create()`; usability probes; sealed catalog; hard-fail on duplicate names at agent init; no per-tool versions |
| Policy scopes | One global `ConfirmationPolicy` (Never default / Always / ConfirmRisky threshold+confirm_unknown) x one `SecurityAnalyzer` per conversation; plus PreToolUse hooks; `filter_tools_regex`; subagent scope. No per-tool/path/server rules |
| Ask routing | Status `WAITING_FOR_CONFIRMATION`; approve = call `run()` again; reject = `reject_pending_actions(reason)`; server `respond_to_confirmation{accept,reason}`; no timeout, no action-bound token |
| MCP | FastMCP client; raw tool name (no prefix), annotations -> readOnlyHint, live `list_changed` reconcile, 300s call timeout, typed auth/OAuth, origin-bound headers, `enabled` per server; no result cap |
| Web tools | browser-use tool set (12 tools), 30k char cap, `allowed_domains` pass-through (empty default); no fetch tool; injection defence = prompt tags + analyzer patterns |
| Receipts | Per-event JSON files, tree via `parent_id`, `SecurityAnalysisEvent`, `HookExecutionEvent`, secret masking; no hash chain/signing |
| Budgets | `max_iteration_per_run`=500, `max_budget_per_run` (post-step), StuckDetector (4/3/3/6), tool timeouts; no call-count rate limits |
| Sandbox | Local (none) / Docker (whole agent-server in container, localhost ports, no cap-drop/limits) / remote / apptainer / cloud; tmux persistent bash session |

## 1. Tool registry / definition model

- **Spec vs implementation split.** `Tool` (SDK `tool/spec.py:12-31`) is only `{name, params}`, a serialisable pointer. `ToolDefinition` (SDK `tool/tool.py:347`) is the runtime object. Names are "a wire contract" persisted in settings/profile JSON (`tool/defaults.py:3-10`).
- **ToolDefinition** (`tool.py:347-444`): frozen pydantic model, discriminated union (`DiscriminatedUnionMixin`). Fields: `description`, `action_type: type[Action]`, `observation_type`, `annotations: ToolAnnotations` (MCP-spec hints readOnly/destructive/idempotent/openWorld, `tool.py:215-247`), `meta`, `executor` (excluded from dumps), `prompt_guidance` (deduped system-prompt text), `response_schema` (structured output). Name auto-derived from class name (`__init_subclass__`, `tool.py:392-397`, `TerminalTool` -> `terminal`).
- **Factory contract**: abstract `create(cls, conv_state, **params) -> Sequence[ToolDefinition]` (`tool.py:427-444`). One spec can yield many tools (e.g. `browser_tool_set`).
- **Schemas**: `Action`/`Observation` (SDK `tool/schema.py:333`, `:365`). `Observation` is `content: list[TextContent|ImageContent]` plus `is_error`; `to_llm_content` prepends `[An error occurred during execution.]` (`schema.py:365-425`).
- **Registry** (`tool/registry.py`): module-global `_REG`, `_USABILITY_REG`, `_TOOL_CLASSES` behind an RLock (`:93-97`). `register_tool(name, instance|subclass)` (`:190-217`) accepts a fixed instance (params rejected, `:118-127`) or a subclass with concrete `create`. Duplicates only log a warning (TODO to throw, `:212-214`). `resolve_tool` (`:220-243`) looks up the resolver, falls back to built-ins (`:227`), and strips `response_schema` from params. `is_usable()` classmethod probes environment (e.g. no tmux), and a throwing probe counts as unusable (`:180-187`). `seal_tool_catalog()` freezes the catalog (`:306`) and `list_tool_catalog` returns `ToolCatalogEntry{user_selectable, usable, in_default_set}` for UIs (`:100-108`, `:320`).
- **Resolution per agent**: `AgentBase._initialize` (SDK `agent/base.py:571-660`) resolves specs on a 4-thread pool, applies `filter_tools_regex`, appends `include_default_tools` (Finish, Think; exempt from the regex), auto-attaches `InvokeSkillTool` / `VisionInspectTool` conditionally, and **raises on duplicate names** (`:645-650`).
- **Client tools**: UI clients register tools as pure JSON in `POST /conversations`; the agent emits an `ActionEvent` over WebSocket and the SDK returns an ack observation (`tool/client_tool.py:1-12`). Dynamic action types are cached by name and same-name/different-schema is rejected (`:48-64`).
- **Name repair**: `normalize_tool_call` (SDK `agent/utils.py:479-520`) aliases legacy names, strips XML fragments from names (`str_replace </parameter`), and only applies aliases when the name is NOT a registered tool (anti-hijack).
- **Versioning**: UNVERIFIED/none found. No per-tool version field; only SDK-level deprecation machinery (`defaults.py:140-162`, retired switches `enable_sub_agents` -> `tools`, removal in 1.56.0). `_action_types_with_risk` caches (tool.py:54) are in-process.

## 2. Permission / policy model

**Who sets `security_risk`.** Two sources, composable:
1. *Model self-declared*: `to_openai_tool(add_security_risk_prediction=True)` injects a `security_risk` enum field (`UNKNOWN|LOW|MEDIUM|HIGH`) into every non-readOnly tool schema (`tool.py:717-722`, `create_action_type_with_risk` `:873-899`). It is moved to the front of `properties` so output truncation cannot drop it (`:855-870`). The agent always passes `add_security_risk_prediction=True` (`agent/agent.py:794`).
2. *Analyzer-computed*: `SecurityAnalyzerBase.security_risk(action) -> SecurityRisk` (SDK `security/analyzer.py:39-53`). Variants:
   - `LLMSecurityAnalyzer` = just echoes the model's own field (`security/llm_analyzer.py:10-29`).
   - `PatternSecurityAnalyzer` (regex, two corpora: exec fields vs all fields incl. thought; Unicode/zero-width normalisation; tree-sitter shell AST for `rm -rf`; `UNKNOWN` when verb unresolvable) (`defense_in_depth/pattern.py:150-262`, `utils.py:1-60`, `_EXTRACT_HARD_CAP = 30_000`).
   - `PolicyRailSecurityAnalyzer` (per-segment composed rules: fetch-to-exec, raw-disk-op, catastrophic-delete -> HIGH) (`defense_in_depth/policy_rails.py`).
   - `ToolShieldLLMSecurityAnalyzer` (separate guardrail LLM judging the action in recent-history context, so actor does not grade itself) (`security/toolshield_llm_analyzer.py:1-30`), `GraySwanAnalyzer` (external Cygnal API).
   - `EnsembleSecurityAnalyzer`: max-severity fusion, child exception -> HIGH (fail-closed), optional `propagate_unknown` (`security/ensemble.py:22-101`; fail-closed at `:85`).
- **Critical gate**: the model's declared risk is only honoured if an analyzer is configured. `_extract_security_risk` returns UNKNOWN when `security_analyzer is None` or the tool is `readOnlyHint` (`agent/agent.py:1204-1229`). It always pops the field so it never reaches the tool (`:1416-1418`).
- Analyzer errors -> HIGH (`analyzer.py:137-142`).

**ConfirmationPolicy** (`security/confirmation_policy.py:9-61`):
```python
class ConfirmRisky(ConfirmationPolicyBase):
    threshold: SecurityRisk = SecurityRisk.HIGH
    confirm_unknown: bool = True
    def should_confirm(self, risk=UNKNOWN):
        if risk == SecurityRisk.UNKNOWN: return self.confirm_unknown
        return risk.is_riskier(self.threshold)   # reflexive: HIGH>=HIGH
```
`AlwaysConfirm`, `NeverConfirm` (default, `conversation/state.py:123`, `models.py:178`), `ConfirmRisky` (threshold may not be UNKNOWN, `:47-51`). `SecurityRisk.UNKNOWN` raises on ordered comparison (`risk.py:~69-95`).

**Enforcement point and wait.** In `_handle_tool_calls` (`agent/response_dispatch.py:154-201`): build all `ActionEvent`s (each emitted/persisted), then `_requires_user_confirmation` (`agent.py:1131-1141`). It analyzes the batch (`_analyze_for_confirmation` `:1164-1190`; a lone Finish/Think skips), emits one `SecurityAnalysisEvent{analyzer, policy, risks{action_id}, details}` even under `NeverConfirm` (`event/security.py:11-39`), and if ANY action's risk trips the policy sets `execution_status = WAITING_FOR_CONFIRMATION` (`:1193-1202`) and returns without executing. The run loop breaks on that status (`conversation/impl/local_conversation.py:2010-2014`). Pending = ActionEvents with no matching observation (`ConversationState.get_unmatched_actions`, `state.py:677`).

**Resolution.**
- *Approve*: simply call `run()` again; `_step` first executes any unmatched actions as "implicit confirmation" (`agent.py:714-723`, `local_conversation.py:1981-1988`). There is no per-action approval id.
- *Reject*: `reject_pending_actions(reason)` emits a `UserRejectObservation` per pending action and sets status IDLE (`local_conversation.py:2649-2687`). LLM sees `Action rejected: {reason}` as the tool result (`event/llm_convertible/observation.py:119-125`). Default reason "User rejected the action".
- *Server*: `POST .../respond_to_confirmation` with `ConfirmationResponseRequest{accept, reason}` (SRV `event_router.py:232-243`, `models.py:436-440`, `event_service.py:1933-1946`; accept = `run()`, reject = reject_pending). Policy and analyzer are settable at runtime (`conversation_router.py:551-580`).
- *Superseded*: a new user message while waiting auto-rejects pending actions with "Superseded by a new user message" (`local_conversation.py:2303-2316`, async path).
- **Timeouts**: none found for the confirmation wait itself (grep for `confirmation_timeout` returns nothing); it waits indefinitely. UNVERIFIED for external callers.
- **PreToolUse hooks** are a second, independent gate: run when the ActionEvent is emitted (`hooks/conversation_hooks.py:105-170`); a deny marks `state.blocked_actions[action_id]`; at execution `_ActionBatch.prepare` pops it and emits a `UserRejectObservation(rejection_source="hook")` (`agent/agent.py:283-290`, `:358-375`). Hook protocol: exit code 2 blocks, any other non-zero is non-blocking (`hooks/executor.py:36-46`); JSON `{"decision":"allow|deny"}` supported; `ASK` is a commented-out future decision (`hooks/types.py:38-40`).

## 3. Tool exposure to the LLM

- Tools list = `agent.tools_map.values()` passed per call to `llm.generate(tools=..., add_security_risk_prediction=True)` (`agent/agent.py:789-797`). Full `ToolDefinition` objects are also stored on the `SystemPromptEvent` (`:590-600`).
- Conversion: `to_openai_tool` (Chat Completions `tool.py:757-787`), `to_responses_tool` (Responses API, `strict: False`, `:789-817`), `to_mcp_tool` (`:673-708`). Every tool gets an optional `summary` field ("~10 words") for explainability, skipped if the tool declares its own `summary` (`:902-953`).
- **Per-model quirks**: `LLM.native_tool_calling: bool = True` (`llm/llm.py:547`). When False, `should_mock_tool_calls` (`llm/mixins/non_native_fc.py:36-39`) -> `pre_request_prompt_mock` converts tool messages to XML-ish text with in-context examples (skipped for `openhands-lm`, `devstral`, `nemotron`), sets stop words, drops `tool_choice` (`:42-66`); response parsed back in `post_response_prompt_mock`. Wiring at `llm.py:1440-1475`. Malformed calls raise `FunctionCallValidationError`, sent back to the model as a user message (`agent.py:798-808`). `ModelFeatures` registry for capability flags (`llm/utils/model_features.py`).
- **Parallel calls**: `Agent.tool_concurrency_limit` default 1, "values > 1 enable parallel execution... may race" (`agent/base.py:314-323`). `ParallelToolExecutor` (`agent/parallel_executor.py`) uses `ToolDefinition.declared_resources(action)` -> `DeclaredResources(keys, declared)` (`tool.py:250-278`, `:526-534`): undeclared = tool-wide mutex; declared with keys = per-resource FIFO locks acquired in sorted order (`conversation/resource_lock_manager.py:1-30`, timeouts file 30s / terminal 300s / browser 300s / mcp 300s / tool 60s, `:20-27`). Terminal declares `terminal:session` unless the tmux pool is used (TOOLS `terminal/definition.py:275-285`). Calls after `FinishTool` in the same batch are discarded (`agent.py:241-267`).
- **Description budget**: no explicit description-token budget found. Prompt tidiness handled by `prompt_guidance` dedupe (`tool.py:411-416`) and `ToolGuidanceSection` (`context/prompts/sections/static.py:~395`). UNVERIFIED that nothing caps description length.
- **Bad calls**: unknown tool -> `AgentErrorEvent` "Tool 'x' not found. Available: [...]" (`agent.py:1380-1398`); validation errors list parameter *names only*, not values (`:1424-1461`); `ValueError` in execution also becomes `AgentErrorEvent` (`:1542-1553`). Every failure path still writes an ActionEvent + error so tool_use/tool_result pairing stays valid (`_emit_tool_error` `:1278-1340`).

## 4. MCP integration

- **Config**: `Agent.mcp_config: dict[str, MCPServer]` (`agent/base.py:140-155`). `MCPServer` (`mcp/config.py:497-525`): `url|command/args/env/cwd`, `transport`, `timeout`, `sse_read_timeout`, `keep_alive`, `headers`, `auth`, `enabled` (disabled servers keep secrets but are never connected). Typed auth: none/api-key/bearer/basic/header/OAuth2 (`config.py:128-232`, `:470-495`); explicit `Authorization` header + `auth` is rejected (`:550-557`). OAuth token storage encrypted via `Cipher`.
- **Origin-bound credentials**: custom httpx client drops auth headers on any redirect to a different origin (`mcp/utils.py:139-165`).
- **Lifecycle**: `create_mcp_tools` (`mcp/utils.py:372-451`): connect + list with a 30s default timeout, raising `MCPTimeoutError`; conversation uses `_RUNTIME_MCP_TIMEOUT_SECS` and **degrades gracefully**: startup failure logs and continues without those tools (`local_conversation.py:1368-1400`). Subscribes to `notifications/tools/list_changed` and reconciles add/update/remove live (`mcp/utils.py:254-318`), pushing to the agent through `add_runtime_tools` (`agent/base.py:850-920`).
- **Same abstraction**: `MCPToolDefinition(ToolDefinition[MCPToolAction, MCPToolObservation])` (`mcp/tool.py:286-417`) with `name` = the raw MCP tool name (`:305-308`), `MCPToolAction.data` as an open dict, annotations copied from the MCP annotations (so `readOnlyHint` drives the security_risk field). LLM schema is the server's raw `inputSchema` + injected `security_risk`/`summary` (`:434-488`); a pydantic model is built dynamically only for validation (LRU 512, `:245-283`).
- **Namespacing**: no OpenHands-side prefixing. Name = bare MCP tool name; collisions across servers raise `Duplicate tool names found` (`agent/base.py:~893-912`) unless same client. Cross-server prefixing, if any, comes from FastMCP's `MCPConfig` multi-server client (UNVERIFIED).
- **Allow/deny**: only the coarse `filter_tools_regex` on tool name (`agent/base.py:156-161`, example excludes `repomix` except `pack_codebase`) plus `enabled` per server. No per-server tool allowlist. Subagent scope can restrict MCP servers to the parent's (`subagent/scope.py:15-50`).
- **Timeout / caps**: `MCP_TOOL_TIMEOUT_SECONDS = 300` per call (`mcp/tool.py:49`); on timeout returns an error observation advising retry (`:205-216`). Reconnect-once if session dropped (`:126-150`). **No result size cap in the MCP observation** (`mcp/definition.py:~50-80` concatenates all text blocks; images inlined as data URLs; unsupported block types dropped with a warning). Global truncation only if the LLM layer applies `max_message_chars` (llm.py:403, default per comment 30000, UNVERIFIED where applied).
- **Secrets**: `$VAR/${VAR}` in tool args are expanded from the conversation secret registry only (never host env), and output is masked (`mcp/tool.py:181-239`).

## 5. Network / web tools

- Browser: `browser_tool_set` of ~12 tools wrapping browser-use/CDP (TOOLS `browser_use/definition.py`). Annotations: navigate/click/type/scroll are `readOnlyHint=False, openWorldHint=True`; `get_state`, `get_content`, `list_tabs`, `get_storage` are `readOnlyHint=True` (`definition.py:330,377,497,623`). Consequence: read-only browser reads skip `security_risk` entirely (`agent.py:1213-1215`), including content fetched from untrusted pages.
- `allowed_domains: list[str]` is accepted by `BrowserToolExecutor` and passed into the browser config (`browser_use/impl.py:300-352`). Enforcement is delegated to the browser-use library (UNVERIFIED); nothing in the SDK sets it by default (empty = allow all). No SDK-level URL allow-list for the terminal (`curl` etc.).
- Caps: per-action timeout `DEFAULT_BROWSER_ACTION_TIMEOUT_SECONDS`, session timeout 30 min, content truncated at `MAX_CHAR_LIMIT = 30000` on paragraph/sentence boundary (`browser_use/server.py:257-300`), full output optionally saved to disk. Chromium sandbox disabled when running as root (warned, `impl.py:338-354`).
- Prompt-injection defence is mostly *advisory + analyzer-side*: repo context / skills are wrapped in `<UNTRUSTED_CONTENT>` with a "may contain prompt injection" warning (`context/prompts/sections/dynamic.py:61-92`); the risk prompt escalates to HIGH for actions "influenced by" untrusted context, package-registry changes, curl|bash, secret exfiltration (`static.py:330-390`); `PatternSecurityAnalyzer` scans model *thought/summary* for injection phrases ("ignore previous instructions", mode-switch, identity) (`defense_in_depth/pattern.py:~100-145`). Tool *outputs* (web pages) are not wrapped or spotlighted. UNVERIFIED beyond grep.
- No built-in web-search / HTTP-fetch tool; the README example uses `mcp-server-fetch` (`agent/base.py:143-152`).

## 6. Audit / telemetry per tool call

- **Event model**: `Event{id, timestamp, source, parent_id}` (SDK `event/base.py:20-35`). A tool call yields `ActionEvent{thought, reasoning_content, thinking_blocks, action, tool_name, tool_call_id, tool_call (raw args), llm_response_id, security_risk, critic_result, summary}` (`event/llm_convertible/action.py:24-80`), then `ObservationEvent{observation, action_id, tool_name, tool_call_id}` or `AgentErrorEvent{error, classification}` or `UserRejectObservation{rejection_reason, rejection_source user|hook}`; plus `SecurityAnalysisEvent`, `HookExecutionEvent`, `ConversationErrorEvent{code}`, `LLMCompletionLogEvent`, `TokenEvent`, `Condensation`.
- **Persistence**: `EventLog` writes one JSON file per event `events/event-{idx:05d}-{event_id}.json` plus `base_state.json` (`conversation/persistence_const.py:1-10`, `event_store.py:188-271`); cross-process safe via file lock and a length-marker sidecar; `parent_id` makes history a tree (branching/`navigate_to`/`fork`) (`event_store.py:75-105`, `local_conversation.py:797,935`).
- **Secrets**: every observation is masked once in `ToolDefinition.__call__` (`tool.py:651-656`), audit events masked as well (`agent.py:1140`); model messages masked (`:1095-1102`).
- **Truncation**: `maybe_truncate` keeps head+tail, inserts a notice, and can persist the full text to a content-hash-named file (`utils/truncate.py:12-80`, default 50_000). Terminal `MAX_CMD_OUTPUT_SIZE = 30000` (TOOLS `terminal/constants.py:18`), file editor 16000 (`file_editor/utils/config.py:1`), browser 30000.
- **Export**: events stream over WebSocket/REST; telemetry via Laminar `@observe` spans per tool with `tool_call_id` (`agent.py:1527-1536`); per-LLM metrics and `max_budget` use `conversation_stats`; LLM raw logs via `log_completions` (`LLMCompletionLogEvent`).
- **Tamper resistance: none found.** No hash chain, signature, or HMAC over events (grep for hmac/sha256 only hits cipher/truncate/dedupe). An actor with write access to the persistence dir can rewrite history. Orphaned tool calls are repaired by synthetic errors rather than flagged (`local_conversation.py:2689-2717`).

## 7. Cost / rate limits / budgets

- `max_iteration_per_run` default 500 -> `ConversationErrorEvent(code="MaxIterationsReached")`, preserving FINISHED if the last step finished (`local_conversation.py:2024-2046`).
- `max_budget_per_run: float|None` checks `accumulated_cost` across all LLMs (agent, condenser, ...) after each step -> `MaxBudgetReached`, status ERROR (`:720-742`, `:2016-2022`). Note the name: it is per **run**, not per task; checked after a step, so one step can overshoot.
- `StuckDetector` (`conversation/stuck_detector.py`): thresholds action-observation 4, action-error 3, monologue 3, alternating 6 (`conversation/types.py:136-161`). Nudges once on an error streak, then STUCK terminates the loop (`local_conversation.py:744-767`).
- Per-tool limits: terminal soft timeout / no-change timeout 30s (`terminal/constants.py:24-32`) with the model told how to continue or interrupt; MCP 300s; browser action timeout; resource lock timeouts above. LLM: `num_retries=5`, `timeout=300`, `stream_idle_timeout` (`llm/llm.py:379-402`). No per-tool call-count or rate limit found.
- Content-policy and context-overflow errors are converted into nudges / condensation requests instead of fatal errors (`agent.py:809-872`).

## 8. Sandboxing / isolation

- `BaseWorkspace` (SDK `workspace/base.py:25-58`): `working_dir`, `execute_command`, file up/download, git diff. `LocalWorkspace` runs directly on the host with no isolation (`workspace/local.py:17-80`). `RemoteWorkspace` talks to an agent-server over HTTP. WS packages: `docker/` (`DockerWorkspace` boots the agent-server image: `docker run -d --rm --ulimit nofile=65536`, ports bound to 127.0.0.1, optional `--network`, `-v` volumes, forwarded env `workspace.py:200-262`), `apptainer/`, `cloud/`, `remote_api/`, `agent_sandbox/`.
- Notable: **the whole agent-server (LLM loop + tools) runs inside the container**, not just the tools. No `--cap-drop`, `--read-only`, `--security-opt`, CPU/memory limits in the run flags shown (`workspace.py:240-251`), so the container is Docker-default-privileged-ish. Hardening is deployment's job (UNVERIFIED for the other backends).
- Bash session model: one persistent session per conversation, tmux backend (pane pool, 256x200 grid, history 10k, socket `openhands`) or subprocess backend, Windows variant (`terminal/terminal/*`, `terminal/constants.py:44-60`). PS1 JSON markers parse exit code/cwd per command (`constants.py:5-12`). `is_input` sends keystrokes to a running process; `reset=True` makes a new session.
- Even when invoked remotely, tools run inside a `LocalConversation` in the server (`tool.py:293-300`).

## 9. Extensibility

- Custom tools: subclass `ToolDefinition` + `register_tool`; or JSON client tools; or MCP; or `Tool(name, params)` plus `response_schema` (structured output from any tool, validated with Draft 2020-12, reserved names guarded: `tool.py:64-66`, `:488-508`).
- Server: `tool_module_qualnames` / `--import-modules` plumbing so the server can import custom tool modules (`registry.py:364-374`, `client_tool.py:5-9`).
- Hooks (`hooks/`): PreToolUse, PostToolUse, UserPromptSubmit, SessionStart/End, Stop; shell-command hooks receive JSON on stdin, process manager reaps on timeout (`hooks/executor.py:79-148`); plugins can contribute hooks (`local_conversation.py:1332`), plus marketplace/plugins/skills (`plugin/`, `marketplace/`, `skills/`, `subagent/`). Stop hooks can veto finishing (`local_conversation.py:1947-1975`).
- Subagents: `task_tool_set`/workflow tools with `SubAgentScope{tools, mcp_servers}` to bound a child to the parent's capabilities (`subagent/scope.py`).
- Validation: JSON-Schema validation of input at `action_from_arguments`, MCP early validation, `fix_malformed_tool_arguments` coerces common LLM mistakes (`agent.py:1400-1404`), critic hook can score actions (`agent.py:1486-1492`).

## 10. Weaknesses, and steal list

**Weaknesses**
1. Default policy is `NeverConfirm` and the default analyzer is `None` (`state.py:123-127`): out of the box nothing is gated. With no analyzer the model's `security_risk` is discarded.
2. `LLMSecurityAnalyzer` trusts the actor to grade itself; the model has no incentive to flag, and a prompt-injected model can lie.
3. Read-only tools (`readOnlyHint`) get UNKNOWN risk; under `ConfirmRisky(confirm_unknown=True)` every grep/read would prompt (my reading of `agent.py:1213-1215` + `confirmation_policy.py:53-55`; UNVERIFIED in practice), while a read-only-annotated tool that exfiltrates (browser_get_content/MCP tool lying about hints) bypasses risk entirely. MCP annotations are server-supplied, hence untrusted.
4. Approval is "run() again": no approval token bound to the exact action/args, no approver identity, no expiry, no timeout (`agent.py:714-723`).
5. Audit log is plain per-event JSON files with no hash chain/signature; MCP results have no size cap; no network allow-list for the shell; Docker workspace has no resource limits or cap-drop; policy is one global object (no per-tool / per-path / per-server scopes); `max_budget` is checked after the step.
6. MCP tools are exposed under bare names with only a regex filter; duplicates hard-fail the agent init.

**Steal list**
1. **Spec/runtime split + sealed catalog with `is_usable()` probes** (`registry.py:180,306,320`): serialisable `{name, params}` specs, factory-resolved at runtime, UI gets `{usable, in_default_set}`.
2. **Ensemble analyzer with fail-closed fusion** (`ensemble.py`): rule-based (pattern + composed rails + AST) and separate-judge LLM, max severity, exception -> HIGH, UNKNOWN fails safe. Plus the two-corpus idea (scan only executable fields for shell patterns, all fields for injection) and Unicode normalisation (`pattern.py:150-262`).
3. **Emit an audit event for every verdict even when policy never asks** (`SecurityAnalysisEvent`, `event/security.py`), keyed by action id with analyzer/policy names and details.
4. **Resource-declared concurrency** (`DeclaredResources` + sorted FIFO lock manager, `tool.py:250-278`): "undeclared = serialize, declared-empty = free" is a clean safety default for parallel tool calls.
5. **Tool-call transcript invariants**: every failure path (unknown tool, validation, hook block, interrupt, rejection) still yields a paired result; `security_risk`/`summary` ordered first in the schema to survive output truncation (`tool.py:855-870`); error text lists parameter names not values; hook-block and user-reject share one observation type with a `rejection_source`. Also steal head+tail truncation with persisted full output keyed by content hash (`utils/truncate.py`).
