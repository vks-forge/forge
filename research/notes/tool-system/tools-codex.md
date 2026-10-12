# Codex CLI tool system: reverse-engineering report

Commit: `f60516235442c99cb14490b2758e5f7a882b029d` (2026-10-12, shallow clone). All paths are relative to `codex-rs/` unless prefixed `docs/`. Cites are `file:line`. "UNVERIFIED" marks inference, not read code. Note: `docs/sandbox.md` is a 3-line stub pointing at developers.openai.com/codex/security, so the behaviour below comes from source only.

## 1. Tool registry and definition model

**Three layers: definition, executor/runtime, registry entry.**

- `ToolDefinition { name, description, input_schema, output_schema, defer_loading }` is the neutral metadata struct (`tools/src/tool_definition.rs:7`).
- `ToolSpec` is the wire enum, serialised straight to the Responses API: `Function | Namespace | ToolSearch | WebSearch{external_web_access, indexed_web_access, filters, user_location, search_context_size, search_content_types} | Freeform("custom")` (`tools/src/tool_spec.rs:22`).
- `ToolExecutor<Invocation>` ties spec and runtime together (`tools/src/tool_executor.rs:106`). Its methods:
  - `tool_name()`, `spec()`, `exposure()` (default `Direct`), `search_info()`.
  - `supports_parallel_tool_calls()` (default `false`, line 122) and `handle()`.
- A tool's spec cannot drift from its handler, because the spec comes from the same object that runs the call.
- `CoreToolRuntime` extends it (`core/src/tools/registry.rs:59`) with:
  - `pre_tool_use_payload`, `post_tool_use_payload`, `with_updated_hook_input` (the hook seams).
  - `telemetry_tags`, `is_third_party_tool`, `mcp_server_name`, `finishes_on_cancellation`.

**Exposure is a 6-state enum plus a bitflag set.**

- `ToolExposure`: `Direct | Deferred | DeferredModelOnly | DirectModelOnly | CodeModeOnly | Hidden` (`tools/src/tool_executor.rs:51`).
- Bitflags `ToolExposures {NONE, DIRECT=1, DEFERRED=2, CODE_MODE=4, ALL}` (`tool_executor.rs:17`) are what config operates on.
- `Hidden` means registered for dispatch but never shown to the model.
- "Deferred" means the tool is absent from the initial list and discoverable via a BM25 `tool_search` tool (`core/src/tools/handlers/tool_search.rs:14-17`).

```rust
// tools/src/tool_executor.rs:58-62
/// Register this tool for later discovery, but omit it from the initial
/// model-visible tool list. Deferred tools must provide search metadata via
/// [`ToolExecutor::search_info`].
Deferred,
```

**Registration has two trust tiers** (`core/src/tools/registry.rs`).

- `register_trusted*` (line 422) panics or logs via `error_or_panic` on duplicates.
- `register_external*` (line 463) is for MCP, dynamic and extension tools.
  - It refuses the reserved names `exec_command` and `shell_command` (line 477).
  - It records the first collision and skips the duplicate.
- `ToolPolicy` is a startup ceiling applied inside every `register_*` (`ext/extension-api/src/tool_policy.rs:10`):

```rust
pub struct ToolPolicy {
    pub allowed_tools: Option<Vec<ToolName>>, // None = ordinary; Some([]) = no tools
    pub require_managed_sandbox: bool,
    pub require_unified_exec: bool,
    pub expose_additional_permissions: bool,
}
```

- It "only restricts tools; permission and approval checks still apply" and is captured once, so later extension state cannot relax it. The guardian reviewer subagent uses it to get exactly `exec_command, write_stdin, view_image, exec, wait` (`ext/guardian-reviewer/src/settings.rs:44-55`).

**Per-turn assembly** (`core/src/tools/spec_plan.rs`).

1. `build_tool_router` (line 121) runs these steps in order:
   - Core tools first (`add_core_tool_sources`).
   - MCP tools (`mcp_handler_cache.append_mcp_tools`).
   - `apply_mcp_tool_exposure_policy` (line 197).
   - Extension tools, then dynamic tools, then hosted specs.
2. `finalize_tool_router` (line 368) then handles:
   - Tool-search injection.
   - Collision handling. With `tool_registry.error_on_tool_collisions` (line 475), a name collision or a namespace-description mismatch becomes a hard `ToolCollision` error.
   - Code-mode wrapping.
3. `build_model_visible_specs` (line 627) emits only `is_directly_visible` tools, then `merge_into_namespaces`.

**Namespaces.**

- A tool name is `(namespace?, name)`. The default namespace is `functions`. Namespaces carry their own description.
- `Responses Lite` models get one-level namespaces via `create_tools_json_for_responses_lite` (`tools/src/tool_spec.rs:95`).

**Catalog transitions (world_state).** Context sent to the model is a set of typed "sections" that diff against the previous snapshot.

- `WorldStateSection { ID, Snapshot, render_diff(previous: Absent|Unknown|Known) -> (new_snapshot, updates) }` (`core/src/context/world_state/mod.rs:321`, `PreviousSectionState` at line 303). The `ID` is persisted in rollouts and must stay stable.
- **`ToolsState`** (id `"tools"`) covers deferred namespaces only (`world_state/tools.rs`):
  - It renders a developer fragment capped at `MAX_RENDERED_FRAGMENT_BYTES = 4 KiB` (line 25).
  - Each namespace description is first line only, at most 250 chars, with a `...` suffix (line 26).
  - On a diff it emits "Added deferred tool namespaces" and "Removed deferred tool namespaces" groups.
  - Overflow is summarised as "... N additional namespaces omitted."
- **Truncation rule (`tools_budget.rs:48`, `calculate_namespace_row_truncation`).**
  - Step 1: reserve every namespace name first (`- name\n`). If names alone overflow, keep names in order until the budget is gone and mark the rest omitted.
  - Step 2: otherwise share the remaining bytes across descriptions round-robin, one char per row per round. No single verbose namespace can starve the others, and UTF-8 boundaries are respected.
- **`TopLevelToolsState`** (id `"top_level_tools"`, `world_state/top_level_tools.rs:135`) tracks the Responses-Lite catalog:
  - Snapshot is `BTreeMap<String, WorldStateHash>`, one SHA-1 per tool (`ns.tool` keys plus a header hash per namespace). Hash seeds are in `world_state/mod.rs:370`.
  - A diff emits `ResponseItem::AdditionalTools{role:"developer", tools:[changed only]}` (line 206), which is the "catalog transition".
  - Removals produce a `RemovedTools` developer notice. Whole-namespace removal subsumes its members (lines 214-247).
  - A namespace whose description changed but whose tools did not is sent as plain developer text, with an "instructions cleared" variant (lines 173-192).
  - Metrics count `added | removed | schema_changed` (`TOOL_INCREMENTAL_UPDATES_METRIC`, line 26).
  - Duplicate hash keys raise `ToolCollision`.
- **`PermissionsState`** (id `"permissions"`, `world_state/permissions.rs:76`) is the same idea for policy:
  - Snapshot is `{instructions hash (computed with an empty exec policy), approved_command_prefixes: BTreeSet<Vec<String>>}`.
  - If only the prefix set grew, it emits a small `ApprovedCommandPrefixSaved` notice instead of resending the whole permission text (lines 111-124).
  - This keeps the prompt cache prefix stable.

**Description and schema truncation rules.**

| Surface | Limit | Cite |
|---|---|---|
| MCP tool description | 1,000 bytes, char-boundary safe | `tools/src/mcp_tool.rs:9` |
| MCP/ordinary tool input schema | 5,000-byte compact budget, overridable per server via `tool_input_schema_max_bytes` | `tools/src/json_schema/compaction.rs:15`, `config/src/mcp_types.rs:255` |
| Over-budget schema compaction | Lossy passes in order: strip descriptions, drop `$defs`, collapse objects deeper than 3, prune compositions | `compaction.rs:35-41` |
| Per-model `functions.*` description prefixes | 256 bytes combined, hard error if exceeded | `tools/src/functions_namespace_function_prefixes.rs:21` |
| Agent-plugin MCP specs | 8,000 B per tool, 64,000 B total, else the tool is `Hidden` | `core/src/mcp_tool_exposure.rs:18-19,135-147` |
| MCP missing `properties` | Patched to `{}`, because OpenAI requires it | `mcp_tool.rs:46` |

**Versioning.** There is no semver per tool.

- Change detection is content hashing (SHA-1 over the serialised definition, so descriptions count).
- `RolloutItem::WorldState` snapshots are persisted, with legacy fragment matchers for migration (`matches_legacy_fragment`).
- Dynamic-tool specs have a legacy and a canonical wire format, and mixing them is an error (`protocol/src/dynamic_tools.rs:~84`).
- The trace bundle has `TRACE_MANIFEST_SCHEMA_VERSION = 1` (`rollout-trace/src/bundle.rs:11`).

## 2. Permission and policy model

**Two orthogonal axes plus a reviewer.**

1. **Sandbox/permission profile (what the OS lets a process do).** The canonical type is `PermissionProfile` (`protocol/src/models.rs:422`):
   - `Managed{file_system, network}` means Codex builds the sandbox.
   - `Disabled` means no sandbox.
   - `External{network}` means an outside caller enforces the filesystem.
   - Legacy `--sandbox` values are `read-only | workspace-write | danger-full-access` (`utils/cli/src/shared_options.rs:40`, enum at `utils/cli/src/sandbox_mode_cli_arg.rs:14`).
   - Built-in profile IDs are `:read-only`, `:workspace`, `:danger-full-access` (`protocol/src/models.rs:410-416`).
   - User profiles live in `[permissions.<id>]` TOML with `extends`, `workspace_roots`, `filesystem`, `network` (`config/src/permissions_toml.rs:113`). Inheritance is cycle-checked.
   - Filesystem access modes are `read | write | deny` (`protocol/src/permissions.rs:120`). On ties "deny beats write beats read".
   - `PROTECTED_METADATA_PATH_NAMES` (`.git`, `.agents`, `.codex`, `.aws`) stay protected even under writable roots (`protocol/src/permissions.rs:46-51`).
2. **Approval policy (when to ask).** `AskForApproval` (`protocol/src/protocol.rs:1092`) has these variants:
   - `UnlessTrusted` (serialised `"untrusted"`): ask unless an exec-policy rule allows.
   - `OnRequest` (default): model decides, with the sandbox as backstop.
   - `Granular(GranularApprovalConfig{sandbox_approval, rules, skill_approval, request_permissions, mcp_elicitations})` (line 1118), where `false` auto-rejects that class of prompt instead of showing it.
   - `Never`.
   - The CLI exposes only `on-request | never` for `--ask-for-approval` (`utils/cli/src/approval_mode_cli_arg.rs:9`; flag at `tui/src/cli.rs:74`). The other values come from config.
   - Other flags: `--yolo` / `--dangerously-bypass-approvals-and-sandbox`, and `--approve-for-me` (auto-review plus workspace-write) at `shared_options.rs:45`.
   - Presets pair the two axes (`utils/approval-presets/src/lib.rs:28`): read-only+OnRequest, workspace+OnRequest, full-access+Never.
3. **Reviewer.** `ApprovalsReviewer {User, AutoReview}` (`protocol/src/config_types.rs:183`; legacy alias `guardian_subagent`). See the guardian section below.

**Default approval requirement** (`core/src/tools/sandboxing.rs:196`):

```rust
let needs_approval = match policy {
    Never => false,
    OnRequest | Granular(_) => matches!(fs.kind, FileSystemSandboxKind::Restricted),
    UnlessTrusted => true,
};
// Granular with sandbox_approval=false => Forbidden, not Prompt
```

Result type `ExecApprovalRequirement::{Skip{bypass_sandbox, proposed_execpolicy_amendment} | NeedsApproval{reason, proposed_execpolicy_amendment} | Forbidden{reason}}` (line 154).

**Command rules (execpolicy).** This is the "approved prefix" mechanism.

- Starlark rules in `$CODEX_HOME/rules/*.rules` (`core/src/exec_policy.rs:54-56`). Syntax: `prefix_rule(pattern=[...], decision="allow|prompt|forbidden", justification=..., match=[...], not_match=[...])` plus `host_executable(name, paths)` (`execpolicy/README.md:5-30`).
- `match` and `not_match` are load-time unit tests of the rule.
- `Decision` is ordered `Allow < Prompt < Forbidden`, and the aggregate over compound commands is `max()` (`execpolicy/src/decision.rs:9`, `policy.rs:402`). So the strictest segment wins.
- Unmatched commands fall to a heuristic (`exec_policy.rs:770`):
  - Dangerous-command match, or a Windows managed-FS profile with no sandbox backend, gives Prompt under OnRequest/UnlessTrusted/Granular and Forbidden under Never.
  - Otherwise Never allows, UnlessTrusted prompts, and OnRequest allows unless the command asked for a sandbox override.
- `Skip.bypass_sandbox` is true only if every parsed segment is explicitly Allowed by a rule (`exec_policy.rs:440-455`). An allow rule never removes filesystem restrictions that include denied reads (`sandboxing.rs:249-271`).
- Amendment suggestions are derived from the command prefix, except `BANNED_PREFIX_SUGGESTIONS` (`exec_policy.rs:57`). That list is about 90 entries (shells, interpreters, `git`, `rm`, `sudo`, `env`, `python -c`, `powershell -Command`, and so on) and cannot be offered as "always allow".
- A user approval with `ApprovedExecpolicyAmendment` appends an allow rule to `default.rules` and hot-swaps an `ArcSwap<Policy>` (`ExecPolicyManager`, lines 295-311, 464).
- The session approval cache key includes the exec-policy fingerprint, so a policy change invalidates cached approvals (`core/src/tools/approvals.rs:~659-668`).

**Network approval.**

- Sandboxed commands get a managed proxy (`NetworkProxy`). A request for a host not in the allow-list triggers `handle_inline_policy_request` (`core/src/tools/network_approval.rs:625`).
- Decisions are `AllowOnce | AllowForSession | Deny` (line 171). Session state is two sets keyed by `(environment, host-lowercase, protocol, port)`: `session_approved_hosts` and `session_denied_hosts`. Deny wins.
- `ReviewDecision::NetworkPolicyAmendment{Allow|Deny, host}` persists a rule across sessions.
- Concurrent requests for the same host share one pending approval (`PendingHostApproval` with an owner guard). If the owner is dropped, waiters fail closed (lines 282-350).
- The flow is allowed only when `policy != Never` and the profile is `Managed` (lines 191-198).
- A denial is also recorded as the tool call's rejection outcome so the model sees it.

**How deny is enforced (OS layer).**

- `SandboxManager::select_initial` picks the platform sandbox (`sandboxing/src/manager.rs:313`).
  - macOS: Seatbelt, a `(deny default)` SBPL base plus network/preferences/read-only-defaults fragments (`sandboxing/src/seatbelt_base_policy.sbpl:1-9`).
  - Linux: `bwrap` and `landlock` modules exist (`sandboxing/src/bwrap.rs`, `landlock.rs`). Details were not read (UNVERIFIED).
  - Windows: see section 8.
- Retry-on-denial flow in `ToolOrchestrator::run` (`core/src/tools/orchestrator.rs:127`): approval, then a first attempt in the sandbox, then on a sandbox denial an escalation approval, then a second attempt. Rules:
  - Never and OnRequest do not retry unsandboxed unless `wants_no_sandbox_approval`.
  - Strict auto-review requires a fresh review before the unsandboxed retry (line 484).
  - If denied reads exist, escalation keeps the sandbox with the reads still denied (`EscalatedSandboxWithRestrictions`, `sandboxing.rs:290-296`). Otherwise escalation would silently grant them.

**Approvals to the caller in app-server.**

- Server-to-client requests, each with typed params and response, are declared with `server_request_definitions!` (`app-server-protocol/src/protocol/common.rs:1793+`):
  - `item/commandExecution/requestApproval` (1797).
  - `item/fileChange/requestApproval` (1804).
  - `item/tool/requestUserInput`.
  - `mcpServer/elicitation/request` (1816).
  - `item/permissions/requestApproval` (1822).
  - `item/tool/call` (1828, dynamic tools).
- Command approval params (`app-server-protocol/src/protocol/v2/item.rs:1555`) carry:
  - `kind` (command or stdin), `threadId`, `turnId`, `itemId`, `startedAtMs`, and an optional `approvalId`. The `approvalId` is a UUID for sub-callbacks, used to disambiguate zsh-exec-bridge subcommands.
  - `environmentId`, `reason`, `networkApprovalContext`, `command`, `cwd`, parsed `commandActions`.
  - `additionalPermissions`, `proposedExecpolicyAmendment`, `proposedNetworkPolicyAmendments`.
  - `availableDecisions`, the ordered list of choices the client may show.
- Responses are `accept | acceptForSession | acceptWithExecpolicyAmendment | applyNetworkPolicyAmendment | decline | cancel` (`item.rs:66-85`). `decline` continues the turn and `cancel` interrupts it.
- A core `ApprovedMcpPolicyAmendment` arriving on a command path "fails closed" to `Decline` (`item.rs:91-93`).
- **Timeouts for user approvals: none found.** `request_command_approval` awaits a `oneshot`; a dropped sender yields `Abort` (`core/src/session/mod.rs:2881-2975`, the `rx_approve.await.unwrap_or(ReviewDecision::Abort)` line). It registers an elicitation guard (`elicitations.register()`), presumably to pause tool timers (UNVERIFIED).
  - A second pending approval for the same id overwrites the first with only a `warn!` (line 2909).
  - `ReviewDecision::TimedOut` exists only for the automated reviewer (`protocol/src/protocol.rs:4274`).

**Precedence for who decides** (`core/src/tools/approvals.rs:463-466`):

```rust
// Approval precedence is:
// 1. Hooks (PermissionRequest)
// 2. If StrictAutoReview || Guardian enabled, then Guardian. Else, user.
```

Hook Allow or Deny short-circuits; otherwise `request_reviewer_approval` asks the guardian first. A `None` from the guardian means "ask the user". Every resolution is telemetered with `ToolDecisionSource::{Config, AutomatedReviewer, User}` (`approvals.rs:804`).

**Guardian (a.k.a. auto-review).** Yes, it is an automated reviewer of approvals.

- Routing (`ext/guardian-reviewer/src/routing.rs:54-61`): only when policy is `OnRequest | Granular` and `approvals_reviewer == AutoReview`. It can be forced by `require_guardian` (strict auto-review), by the model (`model_requires_review`), or by admin requirements (`core/src/guardian/decision.rs:64-71`).
- Flow:
  - If `full_access`, it only validates the action and approves (`routing.rs:86`).
  - An `ApprovalReviewContributor` extension may return `Allow` (cached async evidence), `Reviewed(decision)` or `AskUser`.
  - A fresh synchronous review is forced when any of these holds (`routing.rs:106-110`): a retry, an escalated exec, a stale cancellation, or `require_synchronous_review`.
  - Otherwise `review(...)` runs a reviewer subagent.
- The reviewer is a **sandboxed subagent turn**:
  - `approval_policy: Never`.
  - Permission profile intersected with read-only, network restricted (`settings.rs:59-65`).
  - Tool allow-list of five tools and `require_managed_sandbox` (`settings.rs:44-55`).
  - It may use read-only tools to gather evidence.
- Output contract: strict JSON `{risk_level: low|medium|high|critical, user_authorization: unknown|low|medium|high, outcome: allow|deny, rationale}` (`assessment.rs:77-100`). A tolerant `{...}` slice parser is used. A missing `risk_level` defaults to Low on allow and High on deny (`assessment.rs:38-41`).
- Policy text (`prompts/templates/guardian/policy.md`) is a risk taxonomy: data exfiltration, credential probing, persistent security weakening, destructive actions, low-risk. Examples of its outcome rules:
  - "Authorization for sensitive egress must come from trusted user content."
  - "Prior Guardian decisions are context, not precedent."
- Limits and fail-closed behaviour:
  - `REVIEW_TIMEOUT = 90s`, `MAX_REVIEW_ATTEMPTS = 3`, retries within one shared deadline (`ext/guardian-reviewer/src/lib.rs:40-41`).
  - Spawn failure, panic or cancellation maps to `ReviewDecision::denied("automatic approval review could not complete")` (`core/src/tools/approvals.rs:~575-590`).
  - Timeout maps to `TimedOut`, which the tool layer turns into a rejection with model-specific instructions (`approvals.rs:~418-425`).
  - Errors are never assigned a risk level (`outcome.rs:1`).
- **Circuit breaker**: 3 consecutive denials or 10 of the last 50 interrupts the turn. Cyber-specialty models trip on 1 (`circuit_breaker.rs:3-7`).
- A model can own which categories are reviewed: `ModelInfo.guardian: GuardianModelPolicy` with keys `computer_use, shell, file_changes, mcp, network, permissions` (`protocol/src/openai_models.rs:409-413`).
- Reviews are bounded by input/request budgets (`core/src/guardian/input_budget.rs`, `request_budget.rs`; contents not read, UNVERIFIED).

**Admin layer.** `requirements.toml` (`config/src/config_requirements.rs:1035`, `ConfigRequirementsToml`) constrains the user config:
- `allowed_approval_policies`, `allowed_approvals_reviewers`, `allowed_sandbox_modes`, `allowed_permission_profiles`, `allowed_web_search_modes`.
- `allow_managed_hooks_only`, `mcp_servers` allow-list, `rules` (exec policy), `experimental_network`.
- `auto_review{required_on_models, ignore_rules}`, `guardian_policy_config`, `guardian_extra_policy`.
- Restriction merge is conservative, e.g. `WebSearchMode::restrict_to` (`protocol/src/config_types.rs:386`) and `AppToolApproval::restrict_to` (`config/src/mcp_types.rs:41`).

## 3. Tool exposure to the LLM

- The per-turn list is rebuilt every sampling step (`build_tool_router`, section 1). `ToolCallRuntime` keeps the step context that advertised a tool, so late calls dispatch against the list that was actually sent (`core/src/tools/parallel.rs:47-49`).
- **Per-model knobs** on `ModelInfo` (`protocol/src/openai_models.rs:408-512`):
  - `shell_type`, `apply_patch_tool_type`, `web_search_tool_type` (Text or TextAndImage).
  - `supports_search_tool`, `use_responses_lite`, `tool_mode` (Direct, CodeMode, CodeModeOnly; the effective mode is computed per turn by `effective_tool_mode`).
  - `input_modalities`, `truncation_policy`, `experimental_supported_tools`, `guardian`, `multi_agent_version`, `model_messages` (per-model prefixes and instructions).
- **Rules that depend on those knobs:**
  - MCP tools become `Deferred` when `supports_search_tool`, else `Direct` (`core/src/mcp_tool_exposure.rs:~84-88`, `spec_plan.rs:260-283`).
  - `tool_search` is injected only if the model supports it, policy allows it, and at least one deferred tool has search info (`spec_plan.rs:~395-415`).
  - `Responses Lite` models get no hosted tools and use the namespace-JSON format (`spec_plan.rs:~690`).
  - `parallel_tool_calls` is sent as `prompt.parallel_tool_calls && !model_info.use_responses_lite` (`core/src/client.rs:1072`).
- **Per-server and per-app overrides.**
  - `omit_tools_from = [direct|deferred|code_mode]` (`config/src/mcp_types.rs:260`) can remove a surface from a server. It is ignored under `code_mode_only_strict_3p_tools` so deferred discovery stays intact (`spec_plan.rs:239-250`).
  - `enabled_tools` is an allow-list and `disabled_tools` a deny-list applied after it (`mcp_types.rs:284,288`).
- **Parallel calls.**
  - A tool is parallel-safe only if `supports_parallel_tool_calls()` is true and its exposure is not Hidden (`registry.rs:606-609`).
  - `ToolCallRuntime` holds an `RwLock<()>`: parallel-safe tools take `read()`, all others `write()` (`parallel.rs:213-216`). This gives automatic serialisation of unsafe tools with no per-tool queueing.
  - MCP servers opt in with `supports_parallel_tool_calls = true` (`mcp_types.rs:250`).
- **Budgets on what the model sees:** the truncation table in section 1, the 4 KiB deferred-namespace fragment, `TOOL_SEARCH_DEFAULT_LIMIT` for `tool_search`, and `get_context_remaining` / token-budget fragments (`core/src/tools/handlers/get_context_remaining.rs`).
- **"top_level_tools"** is the world-state section id for the Responses-Lite catalog diff (section 1). It is not a config key.

## 4. MCP integration

- **Config** (`config/src/mcp_types.rs`). Transport is stdio (`command, args, env, env_vars, cwd`) or streamable HTTP (`url, bearer_token_env_var, http_headers, env_http_headers, http_headers_helper`). Shared fields (`McpServerConfig`, line 223):
  - `enabled`, `required` (exec fails if init fails), `startup_readiness` (`connection | catalog`; a cached tool catalog can satisfy startup, line 209).
  - `startup_timeout_sec` (default 30s, `codex-mcp/src/rmcp_client.rs:106`) and `tool_timeout_sec` (default 300s, line 107).
  - `default_tools_approval_mode` and per-tool `[tools.<name>] {approval_mode, output_token_limit}` (lines 80-87).
  - `enabled_tools` / `disabled_tools`, `supports_parallel_tool_calls`, `environment_id` (default `"local"`; remote executors supported).
- **Namespacing.** Canonical name is `mcp__<server>__<tool>` (delimiter `__`, `codex-mcp/src/tools.rs:225`). Names are capped at 128 chars with a 12-char SHA-1 suffix for uniqueness (lines 226-289). MCP servers become namespaces and are asserted unique per owner (`spec_plan.rs:~478-500`).
- **Approvals** (`core/src/mcp_tool_call.rs`).
  - Modes `AppToolApproval {auto, prompt, writes, approve}` (`mcp_types.rs:28`).
  - `auto` uses the MCP annotations (`mcp_tool_call.rs:2465-2481`):
    - `destructiveHint=true` requires approval.
    - `readOnlyHint=true` requires none.
    - Otherwise approval is required if `destructive` defaults true or `openWorldHint` defaults true. Unannotated tools therefore prompt.
  - `writes` prompts unless `readOnlyHint`. `prompt` always prompts. `approve` never prompts (lines 2484-2495).
  - Session memory and persistent "remember" keys exist (`session_mcp_tool_approval_key`, `persistent_mcp_tool_approval_key`, ~1734-1763). Persistence writes to user or project config (2286-2390).
  - MCP approvals route through guardian too: `ApprovalAction::McpToolCall` (`approvals.rs:101`).
- **Elicitation.** MCP `elicitation/create` surfaces as `mcpServer/elicitation/request` (`common.rs:1816`). Server-originated prompts fall back to `ElicitationAction::Decline` in many failure branches (`codex-mcp/src/elicitation.rs:288,485-706`). Auth elicitation for Apps is in `auth_elicitation.rs`.
- **OAuth.** `McpServerAuth {oauth | chatgpt | ema_auth}` (`mcp_types.rs:189`). EMA means enterprise IdP token exchange with "alternate credentials and ordinary OAuth fallback not permitted". The `oauth` block has `client_id`, `client_secret` (`RedactedString`), `callback_port`, `callback_url`. Plus `scopes` and `oauth_resource` (RFC 8707).
- **Result handling.**
  - Image and audio blocks are replaced by a text stub if the model lacks that modality (`mcp_tool_call.rs:952-989`).
  - Events carry results truncated to `MCP_TOOL_CALL_EVENT_RESULT_MAX_BYTES` (`:991`).
  - Rollouts persist MCP results capped at 64 KiB (`rollout/src/policy.rs:16`).
  - Per-tool `output_token_limit` caps model-visible output ("before the standard 20% serialization allowance", `mcp_types.rs:84-87`).
- **Sandbox state to MCP servers.** If the server advertises the sandbox-state meta capability, Codex injects `{permission_profile, sandbox_cwd, codex_linux_sandbox_exe, use_legacy_landlock, use_mxc}` into `_meta` so the server can sandbox its own children (`mcp_tool_call.rs:853-915`).
- **dynamicTools** (app-server).
  - `thread/start.dynamicTools: [DynamicToolSpec]` (`app-server-protocol/src/protocol/v2/thread.rs:151`). `DynamicToolSpec = Function{name, description, inputSchema, deferLoading} | Namespace{name, description, tools[]}` (`protocol/src/dynamic_tools.rs:13-44`).
  - The server-to-client request `item/tool/call` carries `callId, turnId, namespace?, tool, arguments`; the response is `{contentItems: [inputText|inputImage|inputAudio], success}`.
  - The handler registers as an *external* tool, and `deferLoading` maps to `Deferred` exposure with search source "Dynamic tools" (`core/src/tools/handlers/dynamic.rs:~85-115`).
  - Cancellation yields "dynamic tool call was cancelled before receiving a response". No timeout was found in the handler (UNVERIFIED beyond that file).
- **MCP-as-hook.** Hooks can call MCP tools (`HookHandlerConfig::McpTool`, `config/src/hook_config.rs:186`).

## 5. Network and web tools

- **Hosted web search** (`ToolSpec::WebSearch`). Controlled by:
  - Top-level `web_search = "disabled" | "cached" | "indexed" | "live"`, default `cached` (`protocol/src/config_types.rs:376`, `config/src/config_toml.rs:476`).
  - CLI `--search` ("enable live web search", `tui/src/cli.rs:78`).
  - `[tools.web_search] {context_size, allowed_domains, location}` (`config_types.rs:440`, `config_toml.rs:703`).
  - Mapping (`core/src/tools/hosted_spec.rs:14-22`):
    - cached gives `external_web_access=false`.
    - indexed gives `external_web_access=true, indexed_web_access=true`.
    - live gives `external_web_access=true`.
    - disabled gives no tool.
  - Domain filtering is `filters.allowed_domains`, enforced by the hosted backend, not locally.
  - Admin ceiling: `allowed_web_search_modes` in requirements. `restrict_to` ordering is Disabled < Cached < Indexed < Live (`config_types.rs:386-393`).
- **Standalone web tool.** The `ext/web-search` extension registers `web.run`, which wraps a `SearchClient` over HTTP. It is gated on provider capability plus `Feature::StandaloneWebSearch` or Responses-Lite (`spec_plan.rs:1198`). It replaces the hosted tool when present (`spec_plan.rs:~693-700`). Command schema is generated from `SearchCommands` (`ext/web-search/src/schema.rs`).
- **No native fetch-URL tool.** A repo-wide grep for `web_fetch` and `fetch_url` found nothing. Fetching pages is done by shell and curl, or by `web.run` commands (UNVERIFIED for the full command set).
- **Sandbox network policy.**
  - Profile `network = restricted | enabled` (`protocol/src/permissions.rs:86`).
  - With the managed proxy (`NetworkProxyConfig`, `network-proxy/src/config.rs:130`), `[permissions.<id>.network]` gives:
    - `enabled, mode = limited|full`. `limited` means only GET/HEAD/OPTIONS, with HTTPS CONNECT blocked unless MITM is on (line 386).
    - `domains = { "pattern" = "allow|deny" }` with deny winning (line 25), plus `unix_sockets`, `allow_local_binding`, `enable_socks5`, `enable_socks5_udp`.
    - `mitm`, `mitm_hooks`, `credential_broker`.
  - Defaults: `allow_local_binding` false; `dangerously_allow_non_loopback_proxy`, `dangerously_allow_all_unix_sockets` and `dangerously_allow_plaintext_credential_injection` all false.
  - **Credential broker** (`network-proxy/src/credential_broker.rs`): the sandboxed process sees dummy and alias env values; the proxy injects the real secret on matching hosts/headers via MITM. Fields visible: `CredentialRecord{env_var, host_binding, real_value, dummy_value}`. Hooks can strip or inject request headers by host/path/method (`mitm_hook.rs:28-50`).

## 6. Audit and telemetry per tool call

- **Dispatch pipeline** (`core/src/tools/registry.rs:615-897`): increment `turn_state.tool_calls`; `ToolDispatchTrace::start`; unknown-tool and payload-mismatch errors (also logged); PreToolUse hooks; `notify_tool_start`; shell command categorisation (`read | list_files | search | unknown | mixed`, lines ~740-755); `otel.log_tool_result_with_tags`; PostToolUse hooks; lifecycle notify (`Completed | Failed | Blocked | Aborted`).
- **OTel events:**
  - `codex.tool_result` with `tool_name, tool_namespace, call_id, tool_result_seq, duration, success, mcp_server, mcp_server_origin`, plus a truncated `output` preview. Default 2,048 bytes via `ToolResultLogConfig` (`protocol/src/config_types.rs:29-39`). Arguments are also logged (`otel/src/tool_result.rs:26-65`).
  - `codex.tool_decision` with `decision` (opaque, PII-free), `source = config|automated_reviewer|user` (`otel/src/events/session_telemetry.rs:1195`).
  - `codex.sandbox_outcome` with `outcome = denied|timed_out|signal|escalated` and initial and escalated durations (line 1224).
  - Counter `codex.approval.requested{tool, approved}` (`sandboxing.rs:~97-103`).
  - Guardian: `codex.guardian.decision.duration_ms`, and opt-in `guardian_assessment` logs with rationale capped at 64 KiB (`otel/src/guardian_assessment.rs:13`). Opt-in needs an explicit OTLP log destination.
  - Metrics: `TOOL_CALL_COUNT_METRIC`, `TOOL_CALL_DURATION_METRIC`, tags include sandbox type, `command_category`, MCP server.
  - `tool_result_seq` is a per-process atomic counter, "reset on process restart" and independent of the trace writer (`tool_result.rs:15-19`).
- **Persistence.**
  - Rollouts are JSONL files `rollout-<timestamp>-<thread_id>.jsonl` (`rollout/src/rollout_file_name.rs:41,67`). Under `~/.codex/sessions/...` (UNVERIFIED path).
  - `persisted_rollout_item` decides what is durable (`rollout/src/policy.rs`): response items, events (filtered by `ThreadHistoryMode`), `WorldState`, `TurnContext`, `TokenUsageRecord`, `SecurityRiskScore`, `SessionMeta`.
  - Command output is capped at 64 KiB with a truncation marker. MCP results are capped at 64 KiB (lines 16-19).
  - Optional full-fidelity **rollout trace**, enabled only by env `CODEX_ROLLOUT_TRACE_ROOT` (`rollout-trace/README.md:5`). It writes `manifest.json`, an append-only `trace.jsonl` event spine with monotonic `RawEventSeq`, and `payloads/*.json`. Payloads are written before events. An offline reducer builds `state.json`. The README says it is "observe first, interpret later" and local only.
- **Tamper resistance: none found.** There is no hash chain, signature or HMAC on rollouts or traces. A grep for hash, sha, signature and hmac in `rollout/src/recorder.rs` and `rollout-trace/src/writer.rs` found only git SHAs. The only integrity-adjacent mechanisms are a writer lock (`rollout/src/writer_lock.rs`) and monotonic sequence numbers. Treat the audit log as best-effort. The "hook trust hash" (section 9) is the only content-integrity check in the system.

## 7. Cost, rate limits and budgets per tool

There is no per-tool cost or rate limiter. What exists is resource and size budgets, plus one global token budget.

| Budget | Value | Cite |
|---|---|---|
| Default exec timeout | 10 s | `core/src/exec.rs:63` |
| Unified-exec yield window | 250 ms to 30 s (empty `write_stdin` min 5 s; Windows first-yield floor 10 s) | `core/src/unified_exec/mod.rs:68-72` |
| Background terminal timeout | 300 s default | `unified_exec/mod.rs:73` |
| Model-visible exec output | 10,000 tokens default; 1 MiB hard buffer | `unified_exec/mod.rs:74-76` |
| Concurrent unified-exec processes | 64 | `unified_exec/mod.rs:77` |
| Output deltas per call | 10,000 | `exec.rs:85` |
| Global tool output cap | `tool_output_token_limit` | `config/src/config_toml.rs:343` |
| MCP startup / call timeout | 30 s / 300 s | `codex-mcp/src/rmcp_client.rs:106-107` |
| Hook default timeout | 600 s | `hooks/src/engine/discovery.rs:764` |
| Guardian review | 90 s, 3 attempts | `ext/guardian-reviewer/src/lib.rs:40-41` |
| Sub-agents | 6 threads, depth 1 (config defaults) | `core/src/config/mod.rs:254,264` |
| Rollout token budget | `RolloutBudgetConfig{limit_tokens, reminder_at_remaining_tokens, sampling_token_weight, prefill_token_weight}`, shared across a root thread tree. Weighted usage can come from `usage.codex_rollout_budget_units`. Exhaustion returns `true` on all later calls. | `core/src/config/mod.rs:1337`, `core/src/rollout_budget.rs:20-60` |

The model can query remaining context through the `get_context_remaining` tool. The agent is reminded of its budget through `TokenBudgetContext` developer fragments.

## 8. Sandboxing details, especially native Windows

**Selection.** `WindowsSandboxLevel {Disabled, RestrictedToken, Elevated}` (`protocol/src/config_types.rs:297`). Telemetry labels are `disabled | unelevated | elevated | mxc` (`core/src/windows_sandbox.rs:66-75`). Config mapping (`windows_sandbox.rs:123-130`): `windows_sandbox_mode = elevated|unelevated|mxc`, else the features `WindowsSandboxElevated` or `WindowsSandbox`. There is also a third backend, MXC (`mxc-sandbox/`, `SandboxType::WindowsMxc`), not analysed (UNVERIFIED).

**Unelevated ("restricted token", legacy path).**
- Builds a restricted token with `WRITE_RESTRICTED` (0x08), `LUA_TOKEN`, and `DISABLE_MAX_PRIVILEGE` (`windows-sandbox-rs/src/token.rs:41-44`), plus per-workspace capability SIDs (`cap.rs:16-34`).
- Write access is ACL-based. A path is writable only if an ACE grants the capability SID. `CapSids` has `workspace`, `readonly`, `workspace_by_cwd` and `writable_root_by_path`. Stale ACLs from earlier extra roots do not widen later sandboxes (comment at `cap.rs:23-27`).
- It sets a default DACL scoped to the runner's logon SID, using an OWNER RIGHTS ACE so another logon cannot rewrite it (`token.rs:55-60`).
- **Network "block" is advisory.** `apply_no_network_to_env` sets `SBX_NONET_ACTIVE`, proxy vars pointing to `127.0.0.1:9`, `PIP_NO_INDEX`, `NPM_CONFIG_OFFLINE`, `CARGO_NET_OFFLINE` and `GIT_ALLOW_PROTOCOLS=""`. It prepends stub `ssh` and `scp` to PATH and deletes `curl`/`wget` `.bat`/`.cmd` shims (`windows-sandbox-rs/src/env.rs:126-175`; called from `spawn_prep.rs:141` only in `prepare_legacy_spawn_context`). A process that ignores env vars or calls WinSock directly is not blocked. This is inference from the code path, and a grep found no other caller (UNVERIFIED for dynamic behaviour).
- **Hard limits of this backend:**
  - "WRITE_RESTRICTED tokens consult restricting SIDs only for writes, so this backend cannot make capability-SID deny-read ACLs authoritative" (`lib.rs:750`). Deny-read overrides bail with "require the elevated Windows sandbox backend".
  - Restricted read-only access is also elevated-only (`lib.rs:745-748`).
  - Reads are therefore unrestricted by default, and full-disk write profiles are rejected (`resolved_permissions.rs:52-54`).

**Elevated.**
- Runs commands as dedicated local accounts `CodexSandboxOffline` and `CodexSandboxOnline` (`setup.rs:53-54`). Passwords are stored DPAPI-encrypted (`dpapi.rs`, `identity.rs`). The accounts are hidden from the Winlogon user list (`hide_users.rs`).
- **Network deny uses Windows Filtering Platform**: persistent provider, sublayer and `FWP_ACTION_BLOCK` filters keyed on the offline account's user id (`wfp.rs:17-60`, `wfp_setup.rs`). That is kernel-level and not env-based. The offline identity can be given loopback proxy ports through `WindowsSandboxProvisioningSettings{proxy_ports, allow_local_binding}` (`lib.rs:62`).
- A service plus helper-runner architecture: `windows-sandbox-service/`, `elevated/runner_client.rs`, framed IPC (`elevated/ipc_framed.rs`), and `command_runner` with a ConPTY. Command launch uses atomic job-object entry (`proc_thread_attr.rs:77`) and `no_reparse_dir.rs` (handle-pinned directories that avoid reparse points).
- **Deny-read via ACL.** `deny_read_acl.rs` / `deny_read_resolver.rs` / `deny_read_walker.rs` snapshot unreadable globs into deny ACEs. Both the lexical and canonical paths are covered so reparse-point aliases cannot bypass. Root deny ACEs are rejected. Glob expansion from a filesystem root requires `glob_scan_max_depth` (`deny_read_resolver.rs:223`). Historical restrictions that cannot be revoked stay in place (`deny_read_state.rs:42`).
- Requires effective `:root` read access ("elevated Windows sandbox requires effective `:root` read access", `resolved_permissions.rs:114`). It cannot express "read nothing except X".
- Requires a one-time admin elevation to provision users, ACLs and WFP (`setup_provisioning.rs`, `setup_launch.rs`) and has uninstall and recovery paths (`uninstall_windows.rs`).

**Windows-specific policy interactions.**
- If the Windows sandbox is `Disabled` and the profile has managed FS restrictions, every unmatched command is forced to Prompt (or Forbidden under Never), because "there is no platform sandbox to enforce the boundary" (`core/src/exec_policy.rs:782-799`).
- Some PowerShell commands get PowerShell-specific danger heuristics (`ExecPolicyCommandOrigin::PowerShell`, `exec_policy.rs:~145`). The `BANNED_PREFIX_SUGGESTIONS` list includes `powershell -EncodedCommand`, `cmd /c` and `py -3`.

**Known gaps / observations:**
- Unelevated: reads unrestricted, network advisory only, no deny-read.
- Elevated: needs admin once, needs full read, and the WFP filters are persistent system state (a cleanup risk if setup is interrupted; `runtime_ownership.rs` writes an ownership record "before registration so a service restart cannot lose cleanup ownership", line 64).
- Writable-root metadata (`.git`, `.codex`, `.aws`, `.agents`) is protected by name. Other secret directories (for example `.ssh`) are not named in the protected list. They are protected only if the profile denies them (UNVERIFIED: default profile contents were not read).

## 9. Extensibility: hooks, plugins, skills

**Hooks** (`hooks/`, `config/src/hook_config.rs`, `core/src/hook_runtime.rs`).
- Events (`protocol/src/protocol.rs:1688`): `PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt`.
- Handler types (`hook_config.rs:163`): `command` (with `commandWindows`, `async`, `timeout`, `additionalContextLimit`), `mcp_tool`, plus `prompt` and `agent` placeholders. The `Prompt{}` and `Agent{}` variants are empty structs, so they are not implemented yet.
- Tool names are Claude-Code-compatible, e.g. `Bash`, with matcher aliases so one hook can match several names (`registry.rs:276-287`, `hook_runtime.rs:233`).
- **PreToolUse can block or modify:**
  - Exit 0 with JSON may carry `block_reason`, `updated_input`, `additionalContext`.
  - **Exit code 2 blocks** and requires stderr text (`hooks/src/events/pre_tool_use.rs:261-277`).
  - Any other exit code, a timeout, or invalid JSON marks the hook `Failed`, and the tool **proceeds (fail-open)**. Examples: `permission_decision_allow_without_updated_input_fails_open`, and a deprecated "approve" decision fails open (tests, lines 442-587).
  - `updated_input` replaces the invocation via `with_updated_hook_input` (`registry.rs:~720`) and is dropped when blocking.
  - **Only synchronous hooks apply control effects**; async hooks cannot block (`hooks/src/engine/mod.rs:156-159`).
- **PermissionRequest hooks** run before guardian or user UI. They return allow, deny or no decision. Fold rule: any deny wins, else the last allow wins (`events/permission_request.rs:14`).
- **PostToolUse** runs only on success. A block rejects the *result*, not the executed action ("A PostToolUse block rejects the result, not the already-completed tool execution", `registry.rs:~850`).
- Hooks run as shell commands in the session cwd with JSON on stdin. Context spills to disk past about 2,500 tokens (`hook_config.rs:175-178`).
- **Untrusted-handler semantics** (`hooks/src/engine/discovery.rs:796-812`). Trust status is `Trusted | Managed | Modified | Untrusted`:
  - Built-in is Trusted. Admin/system-layer hooks are Managed (always run).
  - Otherwise the handler's hash of its normalised config must equal `trusted_hash` stored in user state (`[hooks.state]`, `HookStateToml`). A changed hook is `Modified`, an unknown one `Untrusted`.
  - **Untrusted and Modified handlers are not executed** (lines 715-720).
  - The hash is over normalised config (`NormalizedHookIdentity`), so TOML and `hooks.json` declarations of the same hook converge (line 769).
  - The escape hatch is `--dangerously-bypass-hook-trust` (`utils/cli/src/shared_options.rs:63`); disabled hooks stay disabled even then.
  - Admin `allow_managed_hooks_only` forbids non-managed hooks.
  - Project-layer hooks go through the same trust gate (`ConfigLayerSource::Project`, discovery.rs ~830).
  - TUI `/hooks` browser (`tui/src/bottom_pane/hooks_browser_*`) lists status.
- **Extensions (in-process Rust)** (`ext/extension-api/src/contributors.rs`): `ToolContributor` (348), `ToolLifecycleContributor` (372), `ApprovalReviewContributor` (413), `McpServerContributor`, `ContextContributor`, `TurnInputContributor`, `SkillInvocationContributor`, `ModelRequestContributor`/`ModelResponseInterceptor`, `TurnItemContributor`, `ConfigContributor`. Guardian, web-search, memories, goal, and so on are built as extensions.
- **Plugins** (`plugin/`, `core-plugins/`): bundles can carry hooks (`PluginHookSource`, `hooks/src/declarations.rs`) with stable hook keys `plugin@marketplace:path:event:group:idx`, MCP servers (`ThreadStore` agent-plugin MCP gets the 8 KB/64 KB spec budget), and skills. Admin `plugins`/`marketplaces` requirements exist. Commands run from a plugin are attributed (`plugin_id`, `script_path`) in approval events (`session/mod.rs:2945-2955`).
- **Skills** (`skills/`, `docs/skills.md`): `SKILL.md` directories. Skill script execution can have its own approval class (`GranularApprovalConfig.skill_approval`). Skills can declare MCP dependencies (`core/src/mcp_skill_dependencies.rs`). Config in `config/src/skills_config.rs`. Contents were not read in depth (UNVERIFIED).

## 10. Weaknesses observed

1. **User approvals never time out.** `rx_approve.await` has no deadline; an unattended `exec` with `OnRequest` hangs until interrupted. Duplicate pending IDs silently overwrite (`session/mod.rs:2909-2912`).
2. **Hook failures fail open.** A crashing, timing-out or malformed PreToolUse hook lets the tool run. Also, a project-supplied hook can only be blocked by the trust hash, which the user can bypass globally with a flag.
3. **No audit tamper evidence.** Plain JSONL and trace files, no hash chain, no signing. Audit tags use a per-process counter that resets.
4. **Unelevated Windows sandbox is weak.** Env-var network "block" is bypassable, reads are open, and there are no deny-reads. Policy still treats the tool as sandboxed (only `Disabled` is escalated to Prompt, `exec_policy.rs:789`).
5. **Guardian is LLM-based and fail-closed on error (good), but spawns a model per approval.** Cost and latency are 90 s worst case times 3 attempts. Policy text is long, prompt-injection surface exists via command content (mitigated by the "trusted user content" rule). A single denial limit (3 consecutive) then interrupts the whole turn.
6. **Approval keys serialised to strings** (`ApprovalStore` uses `serde_json::to_string(key)`, `sandboxing.rs:42-62`). Fine, but cache identity depends on serde field stability.
7. **Complexity and duplication.** Legacy `SandboxPolicy` vs `PermissionProfile`, two AskForApproval types (core and app-server), many `TODO(anp)` markers for reconciling per-environment sandbox context (`registry.rs:~632`, `exec_policy.rs:~147,~281`). Several features were gated or experimental (`askForApproval.granular`).
8. **No per-tool rate limiting or cost attribution.** Only global token budget and size caps. No per-tool quotas, and no spend ceiling per MCP server.
9. **Defaults favour permissive reads and `cached` web search**, with unannotated MCP tools prompting by default (good), but `approve` mode makes the entire server unreviewed (except under strict auto-review).
10. **Web search filtering is delegated to the hosted backend**, so the allow-list is not locally verifiable. There is no local fetch tool, so egress control for web content depends on shell and proxy.

## Summary table

| Aspect | Codex mechanism |
|---|---|
| Registry | `ToolExecutor` (spec+handler fused), `ToolExposure` x6 + `ToolExposures` bitflags; trusted vs external registration; `ToolPolicy` startup ceiling; collision hard-error option; hash-diffed catalog (`top_level_tools`) |
| Policy scopes | Sandbox profile (`:read-only/:workspace/:danger-full-access`, user `[permissions.<id>]` with `extends`), `AskForApproval` (4 forms), exec-policy Starlark prefix rules (allow<prompt<forbidden, max over segments), per-MCP-tool approval modes, admin `requirements.toml` layer |
| Ask routing | Hooks (PermissionRequest) > Guardian (auto-review subagent) > user; app-server `item/*/requestApproval` with `availableDecisions`; no user timeout; guardian 90 s / 3 attempts, fail-closed |
| MCP | `[mcp_servers.<n>]` stdio/HTTP; `mcp__srv__tool` names capped 128 w/ hash; allow/deny tool lists; per-tool approval + output token limit; annotations drive `auto` approval; OAuth/ChatGPT/EMA auth; startup 30 s, call 300 s; deferred exposure when model has tool search; sandbox-state `_meta` |
| Web tools | Hosted `web_search` (`disabled/cached/indexed/live` + `tools.web_search.allowed_domains`); optional standalone `web.run`; no fetch tool; managed proxy w/ domain allow/deny, `limited` mode, MITM, credential broker; per-host one-time vs session approval |
| Receipts | OTel `codex.tool_result` (2 KB preview), `tool_decision` (source), `sandbox_outcome`; JSONL rollouts (64 KB caps); opt-in trace bundle via `CODEX_ROLLOUT_TRACE_ROOT`; no tamper evidence |
| Budgets | Size/time caps (10 s exec, 10 k tokens, 1 MiB, 64 procs, 5 KB schema, 1 KB desc, 4 KB namespace fragment), rollout-wide weighted token budget; no per-tool cost/rate limits |
| Sandbox | macOS Seatbelt deny-default; Linux bwrap/landlock (unread); Windows: unelevated restricted-token (write-only restriction, advisory network) / elevated (dedicated accounts, ACL deny-read, WFP network block) / MXC; escalation preserves deny-reads |

## Steal list

1. **Spec and handler fused in one trait, with an exposure bitset.** `Direct/Deferred/CodeMode/Hidden` per tool, with config only subtracting surfaces. Gives tool-search deferral and per-surface omission for free (`tool_executor.rs:17,51,106`).
2. **Hash-diffed catalog transitions.** Persist `{tool -> hash}` per section; on change send only added/changed tools plus a removal notice. This keeps prompt-cache prefixes stable and makes tool-list drift observable via metrics (`top_level_tools.rs`, `permissions.rs:111-124`).
3. **Names-first fair-share truncation** for namespace/tool summaries within a hard byte cap, with an explicit "N omitted" line (`tools_budget.rs:48`).
4. **Rule engine with unit-tested rules and strictest-wins aggregation.** `prefix_rule(..., match=, not_match=)` validated at load, `max(decision)` across compound commands, a banned-suggestion list so "always allow" can never be offered for `bash -c`/`python -c`/`git`, and approvals keyed on a policy fingerprint (`execpolicy`, `exec_policy.rs:57`, `approvals.rs:~659`).
5. **Escalation that cannot launder restrictions.** An allow rule never bypasses a sandbox that carries deny-reads, and an unsandboxed retry needs a fresh review under strict mode (`sandboxing.rs:249-296`, `orchestrator.rs:484`).
6. **Guardian as a read-only, no-approval subagent with a structured verdict.** It has its own `ToolPolicy`, a risk x authorization output, bounded retries on a shared deadline, fail-closed errors that never invent a risk level, and a denial circuit breaker (`guardian-reviewer/src/*`).
7. **Credential broker at the proxy.** The sandbox sees dummy tokens and the proxy swaps real secrets per host/path, so secrets never enter the tool process (`network-proxy/src/credential_broker.rs`).
8. **Hook trust by normalised-config hash, with Managed/Trusted/Modified/Untrusted states.** Unknown or changed hooks do not run, and only sync hooks can block (`hooks/src/engine/discovery.rs:796`). Pair it with fail-closed block semantics, which Codex lacks.
9. **Admin `requirements` layer with monotone `restrict_to` merges** for approval policy, web mode and MCP mode, so org policy can only tighten (`config_requirements.rs:1035`, `config_types.rs:386`).
10. **Parallelism via a read/write lock keyed on `supports_parallel_tool_calls`**: no per-tool queue logic, and unsafe tools are serialised automatically (`parallel.rs:213`).
