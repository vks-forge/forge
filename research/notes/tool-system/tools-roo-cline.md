# Tool systems: Roo-Code vs Cline (source-read report)

Read-only analysis; repo content treated as untrusted data. "UNVERIFIED" = inferred, not confirmed in code.

- Roo-Code HEAD `b867ec9145750d0ae1ff7f02d35406e9bf2a0b16` (2026-05-15). Paths below relative to `Roo-Code/`.
- Cline HEAD `03ffa9ec3ecd6d691a698c0859eb68afa6e107b8` (2026-10-12). Paths relative to `cline/`.
- IMPORTANT: this Cline revision is NOT the classic `src/core/task` + XML-prompt Cline. The agent loop, tool catalogue, policy engine, MCP tool factory, hooks and checkpoints now live in the `sdk/` workspace (`sdk/packages/{shared,agents,core,llms}`); `apps/vscode` is a host that supplies approval UI, executors and MCP hub. There is no `src/core/task` or `src/core/assistant-message`; there is no XML tool protocol in the prompts (only `apps/vscode/src/core/prompts/responses.ts` remains).
- Roo has also dropped XML: native tool calling only (`src/core/tools/BaseTool.ts:117-150`, `src/core/prompts/sections/tool-use.ts` "Use the provider-native tool-calling mechanism. Do not include XML markup").

---

# 1. Roo-Code

## 1.1 Tool registry / definition model

- Names: closed string-literal union `toolNames` (24 entries) in `packages/types/src/tool.ts:24-49`; Zod enum at `:51`. Usage counters schema `{attempts, failures}` at `:59-65`.
- Groups: `toolGroups = ["read","edit","command","mcp","modes"]` (`packages/types/src/tool.ts:7`); `browser` is a deprecated group silently stripped from user configs by a Zod preprocess (`tool.ts:16`, `packages/types/src/mode.ts:49-94`).
- Group -> tools map is a hardcoded const `TOOL_GROUPS` (`src/shared/tools.ts:296-314`):
  ```ts
  read:    { tools: ["read_file","search_files","list_files","codebase_search"] },
  edit:    { tools: ["apply_diff","write_to_file","generate_image"],
             customTools: ["edit","search_replace","edit_file","apply_patch"] },
  command: { tools: ["execute_command","read_command_output"] },
  mcp:     { tools: ["use_mcp_tool","access_mcp_resource"] },
  modes:   { tools: ["switch_mode","new_task"], alwaysAvailable: true },
  ```
  `customTools` = opt-in tools only reachable if the model's `ModelInfo.includedTools` names them (`filter-tools-for-mode.ts:172-207`, `packages/types/src/model.ts:125,129`).
- Always-available list bypasses mode groups: `ALWAYS_AVAILABLE_TOOLS` (`src/shared/tools.ts:317-325`): ask_followup_question, attempt_completion, switch_mode, new_task, update_todo_list, run_slash_command, skill.
- Aliases: central `TOOL_ALIASES` (`src/shared/tools.ts:337-340`: `write_file -> write_to_file`, `search_and_replace -> edit`); a model may be shown a tool under its alias name (`filter-tools-for-mode.ts:63-86` renamed-tool cache) while execution resolves to canonical.
- Tool schemas (what the LLM sees) are one file per tool, OpenAI function format: `src/core/prompts/tools/native-tools/*.ts`, assembled by `getNativeTools()` (`native-tools/index.ts:46-72`; `read_file` is built dynamically from `supportsImages`).
- Tool implementations: class per tool extends `BaseTool<TName>` with `execute(params, task, callbacks)` and optional `handlePartial` for streaming UI (`src/core/tools/BaseTool.ts:30-60`); callbacks = `{askApproval, handleError, pushToolResult, toolCallId}` (`:8-13`). Typed args via `NativeToolArgs` map (`src/shared/tools.ts:92-120`).
- Versioning: none per tool. Compatibility handled by aliases, `usedLegacyFormat` flag (`tools.ts:146`) and deprecated-group stripping.
- Display names for UI/permission copy: `TOOL_DISPLAY_NAMES` (`tools.ts:268-293`).

## 1.2 Permission / policy model

Two independent gates: (a) CAPABILITY (is tool allowed in this mode?) and (b) APPROVAL (does it need a human?).

### (a) Capability: modes -> groups -> fileRegex
- `ModeConfig` (`packages/types/src/mode.ts:96-105`): `slug, name, roleDefinition, whenToUse?, description?, customInstructions?, groups: GroupEntry[], source?`. `GroupEntry = group | [group, {fileRegex?, description?}]` (`:9-37`); regex validated with `new RegExp` in the schema (`:13-26`); duplicate groups rejected (`:62-79`).
- Built-in modes (`mode.ts:168-227`): architect `["read", ["edit",{fileRegex:"\\.md$", description:"Markdown files only"}], "mcp"]` (`:177`); code `read,edit,command,mcp`; ask `read,mcp`; debug = code; orchestrator `groups: []` (`:223`, relies on always-available new_task).
- Enforcement point: `isToolAllowedForMode()` (`src/core/tools/validateToolUse.ts:120-239`), called twice: when building the tool list (filter) and at execution via `validateToolUse()` (`:32-63`, invoked at `presentAssistantMessage.ts:584`). Order: `disabledTools` requirement map first (explicit disable beats ALWAYS_AVAILABLE, `:133-146`) -> always-available -> custom tool (any mode, `:155`) -> experiments -> mode groups.
- fileRegex check (`validateToolUse.ts:205-233`): only for group `edit`; takes `toolParams.path || file_path`, only if a "real edit param" is present (`EDIT_OPERATION_PARAMS`, `:65-76`); `apply_patch` paths are extracted from `*** Add/Delete/Update File:` markers and each is checked (`:79-104, 216-230`). Failure throws `FileRestrictionError` (`src/shared/modes.ts:134-143`) which is returned to the model as an error tool_result and increments `consecutiveMistakeCount` (`presentAssistantMessage.ts:593-608`).
- Mode switch changes tools: the next API request rebuilds the array (`src/core/task/build-tools.ts:82-169`), because mode is re-read each request; `getAllModes` lets custom modes override built-ins by slug (`modes.ts:70-91`). Fallback to default mode if the current slug vanished (`filter-tools-for-mode.ts:241-243`).

### (b) Approval: `checkAutoApproval`
- Data model (flat booleans in global settings, `packages/types/src/global-settings.ts:97-119,231`): `autoApprovalEnabled`, `alwaysAllowReadOnly[+OutsideWorkspace]`, `alwaysAllowWrite[+OutsideWorkspace, +Protected]`, `alwaysAllowExecute`, `alwaysAllowMcp`, `alwaysAllowModeSwitch`, `alwaysAllowSubtasks`, `alwaysAllowFollowupQuestions` + `followupAutoApproveTimeoutMs`, `allowedCommands[]`, `deniedCommands[]`, `commandExecutionTimeout`, `allowedMaxRequests`, `allowedMaxCost`, `disabledTools[]`.
- Decision function `checkAutoApproval` (`src/core/auto-approval/index.ts:47-183`) returns a tagged union `approve | deny | ask | timeout{timeout, fn}` (`:37-45`). Notable branches: non-blocking asks auto-approve (`:58`); master switch (`:62`); `updateTodoList` and `skill` always approved (`:145-154`, with comment justifying skill); read-only vs write classification by tool-name lists (`src/core/auto-approval/tools.ts:3-17`); outside-workspace and write-protected flags must each be separately allowed (`index.ts:164-179`).
- Command policy `getCommandDecision` (`src/core/auto-approval/commands.ts:256-293`): split chains into sub-commands (`parseCommand`), per-sub-command longest-prefix-match between allow and deny lists (`findLongestPrefixMatch` `:95-114`, decision matrix `:340-368`; `*` wildcard counts as length 1), "any deny blocks all", and dangerous-substitution detector that forces ask: `${var@P}`, `${!var}`, here-string with `$()`, zsh `=(...)`/`*(e:..:)` (`:22-65`). Case-insensitive prefix match, not shell-AST based.
- Protected files: `RooProtectedController` patterns `.rooignore, .roomodes, .roorules*, .clinerules*, .roo/**, .vscode/**, *.code-workspace, AGENTS.md, AGENT.md` (`src/core/protect/RooProtectedController.ts:14-25`); a hit sets `isProtected` which is passed through `askApproval(..., isProtected)` and defeats auto-approve unless `alwaysAllowWriteProtected` (`WriteToFileTool.ts:58,130,162`; `index.ts:176`). Shield icon shown in `list_files`; the prompt tells the model (`RooProtectedController.ts:96-99`).
- Routing of asks: tools call `askApproval(type, msg, progress, isProtected)`, wrapper in `presentAssistantMessage.ts:491-526` -> `Task.ask()` (`Task.ts:1316-1335` calls `checkAutoApproval` then `approveAsk/denyAsk/timeout`). Reply types: `yesButtonClicked` / `noButtonClicked` / `messageResponse`; typed text on approval is merged into the tool result (`:517-523`); any non-yes sets `didRejectTool = true` (`:513`) which skips remaining tool blocks of that assistant message with "Skipping ... due to user rejecting a previous tool" error results (`:388-410`; MCP variant `:109-123`).
- "Remember" semantics: none per-call. Persistent allow = toggling a setting (global booleans, command lists, MCP `alwaysAllow`). There is no "approve this once for this pattern" memory.
- Timeouts: only for follow-up questions (auto-pick first suggestion after N ms, `index.ts:66-81`, timer `Task.ts:1327-1335`); tool approvals wait forever (`pWaitFor` poll 100 ms, `Task.ts:1402-1427`). Queued user messages auto-resolve a pending approval as "yes + message" (`Task.ts:1384-1399`).
- Loop guards: `ToolRepetitionDetector` (3 identical consecutive calls -> ask user, `src/core/tools/ToolRepetitionDetector.ts:7-70`, wired `presentAssistantMessage.ts:613-649`); `consecutiveMistakeLimit` default 3 (`packages/types/src/provider-settings.ts:29`, check `Task.ts:2483`).

## 1.3 Tool exposure to the LLM

- Native tool calling only; system prompt contains NO tool catalogue: `const toolsCatalog = ""` (`src/core/prompts/system.ts:82-89`). Tools travel as the API `tools` array.
- Per-request pipeline `buildNativeToolsArrayWithRestrictions` (`build-tools.ts:82-169`): native tools -> `filterNativeToolsForMode` -> MCP tools (`getMcpServerTools`) filtered by `filterMcpToolsForMode` (all-or-nothing on whether `use_mcp_tool` is allowed in mode, `filter-tools-for-mode.ts:437-456`) -> optional custom tools (experiment `customTools`). 
- `filterNativeToolsForMode` (`filter-tools-for-mode.ts:225-330`) layers: mode groups + always-available -> model overrides (`ModelInfo.excludedTools` removed, `includedTools` added only if their group is allowed, `:152-210`) -> feature gates (codebase_search needs initialised index `:272-277`; todo list setting; experiments imageGeneration / runSlashCommand) -> user `disabledTools` (alias-normalised `:294-302`) -> `access_mcp_resource` dropped unless some server has resources (`:304-307`).
- Gemini special case: send ALL tool definitions but restrict via `allowedFunctionNames` so history stays valid (`build-tools.ts:147-163`, `Task.ts:4114-4118`).
- Parallel calls: `parallelToolCalls: true` sent to providers (`Task.ts:1644,3770,3985,4152`; e.g. `api/providers/openai.ts:164`). Prompt tells the model to batch (`tool-use.ts`). Execution is sequential within the stream (`presentAssistantMessage` iterates blocks; rejection short-circuits the rest).
- Models that cannot call tools: UNVERIFIED (no XML fallback exists any more; I did not find a no-tools path).
- Description budget: no token budget on tool descriptions. Only a count warning for MCP: `MAX_MCP_TOOLS_THRESHOLD = 60` (`packages/types/src/mcp.ts:7`).
- Name hardening for provider compatibility: MCP tool name `mcp--server--tool` (sanitised; fuzzy match of `_` vs `-` because Claude mangles hyphens) (`src/utils/mcp-name.ts:1-55`); JSON-schema normalised to 2020-12 (`mcp_server.ts:50-56`); `sanitizeToolUseId` (`presentAssistantMessage.ts:119`).

## 1.4 MCP integration

- Config: JSON (`mcp_settings.json` global + project `.roo/mcp.json`, project wins on same name; watchers on both, `McpHub.ts:168-169,362-381`). Zod union of stdio / sse / streamable-http (`McpHub.ts:89-143`), shared base (`:67-73`): `disabled`, `timeout` 1-3600 s (default 60), `alwaysAllow: string[]`, `watchPaths` (restart server on file change), `disabledTools: string[]`.
- Per-tool flags derived at connect: `alwaysAllow: wildcard "*" or listed`, `enabledForPrompt: !disabledTools.includes(name)` (`McpHub.ts:994-1031`); mutated via `updateServerToolList` (`:1772-1889`) which rewrites the settings file with a watcher-suppress flag.
- Exposure: each enabled tool becomes its own native tool `mcp--<server>--<tool>` (`mcp_server.ts:13-69`), de-duplicated first-wins (project before global). Disabled tools are never sent AND rejected at execution (`UseMcpToolTool.ts:217-238`).
- Approval: `use_mcp_server` ask -> `checkAutoApproval` requires `alwaysAllowMcp === true` AND `tool.alwaysAllow` for tools (`auto-approval/index.ts:92-112`, `auto-approval/mcp.ts:3-11`). `access_mcp_resource` is approved by the global toggle alone (`index.ts:104-106`) - no per-resource control.
- Timeouts: per-server request timeout passed to the SDK client (`McpHub.ts:1746-1768`); error strings truncated at 1000 chars (`:899-902`).
- Results: text joined; embedded resources JSON-printed with `blob` stripped; images extracted into `data:` URIs and returned to the model (`UseMcpToolTool.ts:258-291`); audio dropped. No result size cap found (UNVERIFIED - did not find one in this path).
- Fuzzy tool-name resolution to tolerate hyphen/underscore mangling (`UseMcpToolTool.ts:194-195,241`).

## 1.5 Network / web tools

- No built-in web fetch/search/browser tool. The `browser` tool group was removed (`tool.ts:16`). Web access is MCP-only (or `generate_image` via provider). Hence no allow-list, no prompt-injection filter for fetched content; MCP tool output is passed to the model raw. No SSRF surface in core.

## 1.6 Audit / telemetry / rollback

- Per-call counters: `recordToolUsage` / `recordToolError` (`Task.ts:4506-4515`, call `presentAssistantMessage.ts:553-558`), exposed on events as `ToolUsage` with token usage (`Task.ts:526-535`). MCP and custom tools are bucketed as `custom_tool`.
- Task-level cost: `getApiMetrics(messages)` sums api_req_started messages (`src/shared/getApiMetrics.ts`; used `AutoApprovalHandler.ts:103`). Messages persisted per task (`task-persistence/`).
- Checkpoints: shadow git repo per task (`src/services/checkpoints/ShadowCheckpointService.ts:125` dotGitDir, `:157-178` `core.worktree` = workspace, `commit.gpgSign=false`, env sanitised `:20-60`; nested `.git` dirs handled `:232-260`). `checkpointSaveAndMark` is called BEFORE each mutating tool: write_to_file, apply_diff, edit variants, apply_patch, generate_image (`presentAssistantMessage.ts:653,668,677,685,693,701,780,818`; function `:957-966`). Restore/diff: `src/core/checkpoints/index.ts:234-313`; init has a timeout (`:39`) and degrades to disabled on error (`:222`).
- Not audited: approval decisions (who approved what, when) are only in chat history; no append-only audit log. UNVERIFIED beyond messages.

## 1.7 Cost / rate limits / budgets

- `AutoApprovalHandler` (`src/core/auto-approval/AutoApprovalHandler.ts:13-155`): counts `api_req_started` messages since last reset (`:54-57`) and cost since last reset (`:99-103`); when over `allowedMaxRequests` / `allowedMaxCost` (+0.0001 epsilon `:106`) it raises ask `auto_approval_max_req_reached` (`:60,108`); "yes" resets the window (`:66-68`), anything else aborts the task (`Task.ts:4098-4101`). Checked before every API request (`Task.ts:4092`). This is a rolling "consecutive auto-approved" budget, not a hard task cap.
- `requestDelaySeconds` between requests (`global-settings.ts:104`).
- Context: `autoCondenseContext` + `autoCondenseContextPercent` (`global-settings.ts:118-119`); non-destructive condense (messages tagged, `getEffectiveApiHistory`, `Task.ts:4080-4089`); sliding-window in `src/core/context-management`.
- Per-tool output caps: terminal output spilled to artifact file with preview size (`ExecuteCommandTool.ts:204-221,556-561`), model reads it with `read_command_output` (search/offset/limit). `read_file` line limit (`maxReadFileLine`, `vscode-extension-host.ts:309`).

## 1.8 Sandboxing / isolation

- Workspace boundary is an APPROVAL concept, not a hard wall: `isPathOutsideWorkspace` marks `isOutsideWorkspace` on the ask and requires `alwaysAllow*OutsideWorkspace` for auto-approval (`WriteToFileTool.ts:89-96`, `ReadFileTool.ts:439,504,654`). With approval, outside paths are allowed.
- `.rooignore` (gitignore syntax via `ignore`): `validateAccess(path)` checks real path after symlink resolution (`RooIgnoreController.ts:89-112`), `validateCommand` blocks a fixed set of file-reading commands (`cat`, etc.) with ignored path args (`:123-170`); hot-reloaded (`:38-60`); lock icon in listings; instructions injected into the prompt (`:203-211`).
- Terminal: provider "vscode" shell integration or "execa" (`ExecuteCommandTool.ts:201`); dual timeout - agent timeout moves command to background, user timeout (`commandExecutionTimeout`, with `commandTimeoutAllowlist` exemption) kills it (`:79-98,375-430`). No OS-level sandbox/containerisation.
- Custom tools execute in-process with NO approval and NO mode restriction (see 1.9).

## 1.9 Extensibility

- Custom modes: `.roomodes` (project) and global `custom_modes.yaml`, YAML with JSON fallback, invisible-char cleaning, `customModesSettingsSchema.safeParse` (`src/core/config/CustomModesManager.ts:145-193,290-301`); project overrides global; per-mode rule dirs `.roo/rules-{slug}/` (`:571,578`); import/export bundles including rules files (`:21-37`). Duplicate slugs rejected (`mode.ts:113-131`).
- Per-mode prompt overrides in state (`customModePrompts`, `modes.ts:161-173`), `whenToUse` used by orchestrator to pick modes.
- Custom tools (experiment `customTools`): TS/JS files in `.roo/tools` transpiled with esbuild, Zod params, `execute(args, {mode, task}) -> string` (`packages/core/src/custom-tools/custom-tool-registry.ts:55-80`, `packages/types/src/custom-tool.ts:32-65`; loaded in `build-tools.ts:131-142`). Executed in `presentAssistantMessage.ts:825-868`: arguments Zod-validated, no `askApproval`, no checkpoint, allowed in every mode (`validateToolUse.ts:153-157` comment "As a follow-up we should expand the custom tool definition to include mode restrictions").
- Rules: `.roorules`, `.clinerules*` (also read), `AGENTS.md`; skills (`skill` tool, auto-approved); slash commands (`run_slash_command`, experiment).
- Model-level tool tuning via `includedTools`/`excludedTools` in model info.

## 1.10 Weaknesses

1. Approval is a bag of coarse booleans keyed to tool NAME classes (read/write/mcp); no per-path or per-tool-argument rules except the command prefix lists. No rule precedence/layering (user/project/enterprise).
2. `fileRegex` applies only to the `edit` group and tests the raw model-supplied path string; it does not constrain `execute_command` (a mode with `command` + restricted `edit` can still `sed -i`), nor does it normalise (`..`, absolute paths) before testing (UNVERIFIED for normalisation upstream of `validateToolUse`).
3. Custom tools bypass approval, mode checks and checkpoints.
4. Command allow/deny is prefix text matching; no AST, no argument-aware rules, no env/redirection reasoning beyond the substitution regex.
5. `access_mcp_resource` and MCP tool results are unbounded/untrusted; no injection defence; no result size cap found.
6. Approvals wait indefinitely; no per-approval audit trail; budget is "consecutive auto-approved" window, not a hard task cap.
7. Parallel tool calls requested from the provider, but permissioning is serial with `didRejectTool` skipping the rest (safe, but a single "no" cancels unrelated queued reads).

---

# 2. Cline (SDK architecture)

## 2.1 Tool registry / definition model

- Core contract (`sdk/packages/shared/src/agent.ts`): `AgentToolDefinition {name, description, inputSchema(JSON Schema), resultPolicy?: "cache-oversized", lifecycle?: {completesRun}}` (`:172-181`); `AgentTool` adds `executionMode?: "sequential"|"parallel"`, `timeoutMs`, `retryable`, `maxRetries`, `execute(input, ctx)` (`:204-215`). Factory `createTool()` (zod or JSON schema; enforces object-shaped top-level schema and fails loudly at registration, `sdk/packages/shared/src/tools/create.ts:5-79,81-120`).
- Built-in catalogue: `DefaultToolNames` (`sdk/packages/core/src/extensions/tools/constants.ts:107-117`): read_files, search_codebase, run_commands, fetch_web_content, apply_patch, editor, skills, ask_question, submit_and_exit. Assembled by `createDefaultTools({enableX...})` (`definitions.ts` ~`:905-981`); each tool only registers if an EXECUTOR is injected by the host (`if (enableBash && executors.bash)`), so the host owns the real I/O (VS Code supplies editor/read/terminal executors, `SdkController.ts:407-427`).
- Display catalogue for UI/CLI: `BASE_TOOL_CATALOG` + `getCoreBuiltinToolCatalog(context)` with `defaultEnabled` computed per mode/client/provider (`sdk/packages/core/src/extensions/tools/runtime.ts:38-200`); `resolveCoreSelectedToolIds` validates user allow-lists and throws on unknown ids (`:224-240`).
- There is no tool GROUP concept. The analogue is boolean feature flags per tool in `DefaultToolsConfig` and named presets.
- Presets = modes (`presets.ts:20-111`): `act` (all + editor + spawn/teams), `plan` (read/search/bash/webfetch ON, editor OFF), `search`, `minimal`, `yolo` (readFiles, bash, editor, submit_and_exit; no ask, no web). `resolveToolPresetName({mode})` maps `plan|yolo|act` (`:118-128`).
- Model-aware routing: declarative rules `{mode, modelIdIncludes, providerIdIncludes, enableTools, disableTools}` (`model-tool-routing.ts:4-32`); defaults swap `editor` for `apply_patch` for OpenAI/codex/gpt models (`:60-75`). Provider-native tools (web_search) are gated by `supportsModelTool(provider, model)` (`runtime.ts:200-215`).
- Legacy ids (classic XML-era names) survive in `apps/vscode/src/shared/tools.ts:5-30` (`ClineDefaultTool`) and in `buildToolPolicies` name lists.
- Versioning: none per tool; fingerprint of MCP tool list used to rebuild sessions (`McpHub.ts:2035-2060`).

## 2.2 Permission / policy model

- Policy type is tiny: `ToolPolicy {enabled?: boolean (default true), autoApprove?: boolean (default true)}` (`sdk/packages/shared/src/llms/tools.ts:7-18`), keyed by tool name with `"*"` wildcard (`agent-runtime.ts:216-224`).
- Enforcement point: `AgentRuntime.prepareToolExecution` (`sdk/packages/agents/src/agent-runtime.ts:2395-2491`), strict order: (1) input parse error -> skip; (2) provider-executed tools skip; (3) normalise input vs schema; (4) all `beforeTool` hooks may rewrite `input`, override `policy`, append context, `skip`, or `stop` (`:2430-2463`, hook result type `shared/src/agent.ts:420-433`); (5) merge policy (`"*"`, then tool, then hook override) -> `enabled === false` => skipped with "disabled by policy"; `autoApprove === false` => `requestToolApproval` callback (`:2465-2483`); no callback => denied (`:2498-2503`); callback throw => denied (`:2523-2530`). Denial text gets a `TOOL_REJECTION_SUFFIX` (`:2480`).
- Calls are approved serially in a loop (`:2338-2340`), then executed: adjacent `parallel` tools overlap, a `sequential` tool is a barrier (`:2343-2370`). Default `toolExecution` is `"sequential"` unless `maxParallelToolCalls >= 2` (`agent-runtime.ts:615`, `agent-runtime-config-builder.ts:191-198`).
- Host policy mapping (VS Code): `buildToolPolicies` forces `autoApprove:false` for every read/edit/command/web tool and EVERY MCP tool (`apps/vscode/src/sdk/sdk-tool-policies.ts:57-84`) so the callback runs each time; the callback evaluates LIVE user settings via `isToolAutoApproved` (`:92-112`, wired `SdkController.ts:395-398`, used in `sdk-interaction-coordinator.ts:96-99`). That makes mid-task toggles take effect. Note SDK default is auto-approve for unlisted tools (comment `sdk-tool-policies.ts:51`) - fail-open if a tool name is missed.
- Data model (`apps/vscode/src/shared/AutoApprovalSettings.ts:1-44`): `version` (race-prevention counter), `actions: {readFiles, editFiles, executeSafeCommands, useBrowser, useMcp}` plus legacy fields (`enabled`, `maxRequests`, `favorites`, `*Externally`, `executeAllCommands`) explicitly retained for compatibility; `enableNotifications`. Four capability classes + one MCP toggle; no per-path, no per-command patterns, no cost cap. Default `executeSafeCommands:false` (`:38`).
- No command allow/deny list exists in this revision (grep for allowlist/denylist/command permission in `apps/vscode/src` and `sdk/packages` found only unrelated hits). Command safety = approval toggle + plan-mode guard + hooks.
- Plan mode: tools removed (editor off) AND a shell guard hook: `createPlanModeCommandGuardExtension` registers a `beforeTool` hook on `run_commands`, blocks file-mutating commands (rm/mv/cp/touch/tee redirection, package-manager install/add, git mutating subcommands, PowerShell cmdlets) (`sdk/packages/core/src/extensions/tools/command-guard.ts:1-140`, `command-guard-extension.ts:39-89`). Header comment honestly states it is a blacklist, not a shell interpreter. Runs BEFORE policy/approval so users are never asked about doomed calls (`command-guard-extension.ts:12-15`); emits `plan_mode_command_blocked` telemetry.
- YOLO: preset `yolo` toolset + `createToolPoliciesWithPreset("yolo")` = `{"*": {enabled:true, autoApprove:true}}` plus per-tool entries (`presets.ts:139-160`); dedicated system prompt requiring `submit_and_exit` with `verified` flag (`sdk/packages/shared/src/prompt/system/yolo.ts:1-39`). Enterprise kill switch `yoloModeAllowed` in remote config (`sdk/packages/shared/src/remote-config/schema.ts:201`; doc `docs/enterprise-solutions/.../yolo-mode.mdx`).
- Approval routing in VS Code: `SdkInteractionCoordinator.handleRequestToolApproval` appends a tool-ask message, opens a diff preview for edits BEFORE the buttons render, registers a single pending resolver (`sdk-interaction-coordinator.ts:96-150`). No timeout in the VS Code path; typing a chat message leaves the approval pending and queues it as a follow-up (`:200-207`). The headless/desktop path has a 5 min timeout and file-based request/decision IPC (`sdk/packages/core/src/runtime/tools/tool-approval.ts:74-101`).
- Denial text is engineered: for edit tools it states "The file was NOT modified and still contains its original content" so the model does not build the next edit on content that never landed (`apps/vscode/src/sdk/tool-approval-denial.ts:176-195`), and denials are excluded from the consecutive-mistake counter (`:227-247`).
- "Remember" semantics: only settings toggles; no per-call memory. MCP per-tool `autoApprove` list exists in config/UI but the live gate ignores it: `isToolAutoApproved` says "One global toggle governs all MCP tools; there is no per-tool opt-in" (`sdk-tool-policies.ts:106-109`) while McpHub still stores and displays `autoApprove` per tool (`McpHub.ts:888-897,1764-1801`). Likely regression/inconsistency (UNVERIFIED whether another path consumes it).

## 2.3 Tool exposure to the LLM

- Provider-agnostic native tool calling via the `@cline/llms` gateway; tools are `AgentToolDefinition[]` on each `AgentModelRequest` (`shared/src/agent.ts` ~`:232-240`). Runtime rebuilds definitions per request so dynamic descriptions (e.g. current shell) stay fresh: `Object.defineProperty(tool,"description",{get})` (`definitions.ts:536-548`).
- Per-mode set via presets; per-model via routing rules (2.1). Provider-executed tools (web_search) are separate `modelTools`, and the runtime refuses to execute those locally (`agent-runtime.ts:2418-2424`).
- Parallel calls: model is told to batch (YOLO prompt rules, `yolo.ts:16-17`); tools accept arrays (read_files, run_commands, fetch requests all batch). Runtime parallelism opt-in per `maxParallelToolCalls`.
- Invalid calls (missing name/args, bad JSON) are captured as `InvalidToolCall` and returned as errors, `inputParseError` skip path (`agent-runtime.ts:235-240,2408`).
- Description/size budgets: tool OUTPUT is budgeted hard (`executors/output-limits.ts`: 48,000 chars command output, 2,000 lines/2,000 chars per line for reads, 48,000 search), with truncation notices placed in head/tail so recovery guidance survives later re-truncation (`:1-40`). `resultPolicy:"cache-oversized"` stores big results in a session cache (16 MiB, evict after 5 idle iterations) addressable as `cline://cache/<session>/<id>.result.txt` (`sdk/packages/core/src/session/services/tool-result-cache.ts:1-60`).
- Models that can't call tools: UNVERIFIED (not found).

## 2.4 MCP integration

- Two layers: (1) VS Code `McpHub` (config file, connections, OAuth, list-changed refresh) `apps/vscode/src/services/mcp/McpHub.ts` (2198 lines); (2) SDK `createMcpTools` that converts descriptors to `AgentTool`s (`sdk/packages/core/src/extensions/mcp/tools.ts:63-95`).
- Config schema (`apps/vscode/src/services/mcp/schemas.ts:10-79`): flat or CLI "nested transport" format; `autoApprove: string[]`, `disabled`, `timeout` (1-3600 s, default 60, `sdk/packages/shared/src/mcp.ts:10-12`), `remoteConfigured`, `oauth`, `metadata`; transports stdio / sse / streamableHttp. No `disabledTools` per tool in the hub (grep: none); the SDK offers `createDisabledMcpToolPolicies` (`extensions/mcp/policies.ts:17-47`, exported at `core/src/index.ts:313`) but I found no call in `apps/vscode` (UNVERIFIED usage elsewhere).
- Namespacing: `<server>__<tool>`, sanitised to `[a-zA-Z0-9_-]`, capped at 64 chars with sha1(8) suffix on overflow (`extensions/mcp/name-transform.ts:4-30`). Policy keys use the same name (`sdk-tool-policies.ts:77`); `isMcpToolName` detects `__` (`:132-136`).
- MCP tools use `resultPolicy:"cache-oversized"`, per-tool `timeoutMs`, `retryable/maxRetries` (`tools.ts:77-82`).
- Tool-list drift: fingerprint of server/tool/description/schema/timeout, debounced 300 ms, triggers a session rebuild (`McpHub.ts:2035-2100`); list_changed refresh with 2 s wait/3 retries (`:72-73`).
- Enterprise: remote config `allowedMCPServers[]`, `remoteMCPServers[]` (alwaysEnabled, headers), `blockPersonalRemoteMCPServers`, `mcpMarketplaceEnabled` (`remote-config/schema.ts:122-135,189-197`).
- Images/resources: UNVERIFIED in the SDK path (a `split-tool-images` provider middleware exists, `llms/src/providers/middleware/split-tool-images.ts`).

## 2.5 Network / web tools

- `fetch_web_content`: batch of `{url, prompt}` requests, `Promise.all`, 30 s timeout, retryable x2 (`definitions.ts:560-590`). Executor: http/https only, 5 MB cap, redirects followed (5 hint), HTML stripped by regex (`executors/web-fetch.ts:10-48,115-128`). No host allow-list, no private-IP/SSRF block, no injection sanitiser (grep for localhost/127./169.254 returned nothing). Auto-approval class `useBrowser` covers `web_fetch|fetch_web_content|web_search` (`sdk-tool-policies.ts:128-130`).
- `web_search` is provider-native, enabled only when the model supports it (`runtime.ts:57-62,200-215`).
- Classic `browser_action` id still in `ClineDefaultTool` (`apps/vscode/src/shared/tools.ts:14`); implementation in this tree: UNVERIFIED.

## 2.6 Audit / telemetry / rollback

- Runtime events `tool-started`, `usage-updated`, etc. (`agent-runtime.ts:2326,2537-2542`); usage includes `totalCost` accumulated per run (`:2313-2331`). Telemetry `captureToolUsage {ulid, tool, modelId, provider, autoApproved, success}` (`sdk/packages/core/src/services/telemetry/core-events.ts:567-579`) - records WHETHER a call was auto-approved, which Roo's counters do not. Plan-mode blocks, diff-edit failures and skill use have dedicated events.
- Hooks as audit: `PreToolUse`/`PostToolUse`/`TaskStart|Resume|Cancel|Complete`/`UserPromptSubmit`/`Notification`/`PreCompact` shell/TS hooks (`apps/vscode/src/core/hooks/templates.ts:12-30`, adapter `apps/vscode/src/sdk/hooks-adapter.ts`, examples `sdk/examples/hooks/PreToolUse_BlockDestructive.sh`, `_RequireReview.sh`, `_ModifyInput.ts`, `_ClineignoreGuard.sh`). Hook output `{cancel, contextModification, errorMessage}` (template).
- Checkpoints: no shadow repo. Private git refs `refs/cline/checkpoints/{sessionId}/...` built like `git stash create --include-untracked` (3-parent commit) using a persistent per-session `GIT_INDEX_FILE` scratch dir so unchanged untracked files are not re-hashed; scratch reaped after 14 days (`sdk/packages/core/src/hooks/checkpoint-hooks.ts:6-50,432-465,497-700`). Triggered once per USER RUN in `beforeModel` iteration 1 (not per edit), idempotent across resumes (`:652-700`). Pros: invisible to `git stash list`, fast. Cons: coarse granularity (per user turn), requires a git repo (swallows errors if not, `:461`).
- Tool receipts: UNVERIFIED beyond the above; no signed or append-only per-call log found.

## 2.7 Cost / rate limits / budgets

- `maxIterations` exists in runtime (`agent-runtime.ts:835,1024`) but VS Code sets `undefined` (`cline-session-factory.ts:1135`). `maxConsecutiveMistakes` config (`sdk/packages/core/src/types/config.ts:250`) and a host handler that stops the run and lets the user resume (`sdk-interaction-coordinator.ts:70-90`).
- Auto-approve `maxRequests` is a dead legacy field ("feature has been removed", `AutoApprovalSettings.ts:11-12`). No cost ceiling found (grep for maxCost/budgetUsd in core/agents found nothing relevant; usage only tracked). Net: Cline has NO auto-approve cost/request cap in this revision (Roo does).
- Context management: budget projection + compaction strategies (`extensions/context/budget-projection/*`, `types/config.ts:82-110`), overflow recovery flag when provider rejects context (`shared/src/agent.ts` `overflowRecovery`), max-output-token recovery nudges (`agent-runtime.ts:1162-1175`).
- Per-tool timeouts everywhere: run_commands 30 s default (x2 outer), reads 10 s, search 30 s, fetch 30 s, editor/patch 30 s, skills/submit 15 s (`definitions.ts:272,368,502,560,653,702,765,843`); shell/MCP `retryable:false` for commands, true for fetch.

## 2.8 Sandboxing / isolation

- Terminal: host-provided executors; VS Code "vscodeTerminal" vs background mode (`vscode-terminal-execution-mode.ts`, `sdk-foreground-command-coordinator.ts`, `cancelBackgroundCommand.ts`); no OS sandbox. Details UNVERIFIED.
- `.clineignore`: `ClineIgnoreController` (gitignore syntax, `!include`, `validateCommand` over cat/grep/PowerShell readers, lock marker; `apps/vscode/src/core/ignore/ClineIgnoreController.ts:8,73-85,179-230`). In this tree it is referenced only by `core/prompts/responses.ts:6,163`; SDK-core has no clineignore enforcement (grep none). Enforcement is offered as an example PreToolUse hook (`sdk/examples/hooks/PreToolUse_ClineignoreGuard.sh`). So `.clineignore` is effectively opt-in hook enforcement now (UNVERIFIED whether the VS Code SDK executors call the controller; I did not find it).
- Plugins run in a Node subprocess sandbox with idle shutdown and RPC (`sdk/packages/core/src/runtime/tools/subprocess-sandbox.ts:1-70`, `extensions/plugin/plugin-sandbox*.ts`) - process isolation, not permission isolation (UNVERIFIED granularity).
- Workspace boundary: legacy `readFilesExternally/editFilesExternally` flags retained but unused by the live gate (`AutoApprovalSettings.ts:16,18`), i.e. no outside-workspace distinction any more.

## 2.9 Extensibility

- Rules: `.clinerules` (files and dirs), global rules, workflows, skills (`apps/vscode/src/core/context/instructions/user-instructions/*`, `sdk/packages/core/src/extensions/config/user-instruction-config-loader.ts`), enterprise `globalRules/globalWorkflows` with `alwaysEnabled` (`remote-config/schema.ts:139-146,225-226`).
- Hooks (above) are the main policy-extension seam; `AgentExtension {name, manifest:{capabilities:["hooks"]}, hooks:{beforeTool,...}}` (`command-guard-extension.ts:80-88`). Extensions can inject tools, commands, policy.
- Custom tools: plugin tools (`sdk/packages/core/src/services/plugin-tools.ts`), Composio meta-tools, cron/schedule tools, sub-agent/team tools (`extensions/tools/team/*`), `spawn_agent`. Custom tools flow through the same `ToolPolicy` + approval pipeline because they are ordinary `AgentTool`s (contrast with Roo).
- Modes: three fixed (`act|plan|yolo`) - NO user-defined modes/personas with tool groups (UNVERIFIED but no schema found). This is Cline's biggest gap vs Roo.

## 2.10 Weaknesses

1. Policy granularity is per tool name only (`enabled`, `autoApprove`); no argument/path/command patterns; the VS Code gate collapses to five booleans, with one toggle for ALL MCP tools.
2. SDK default `autoApprove: true` for unlisted tools; safety depends on the host enumerating names (`sdk-tool-policies.ts:51,69-72`) - a renamed or new tool silently becomes auto-approved in VS Code (the code even keeps both legacy and new names in the lists to avoid this).
3. Plan-mode safety is a blacklist that the authors admit misses `python -c`, `bash -c "..."` (`command-guard.ts:1-17`).
4. No cost/request ceiling; `maxIterations` unset; `.clineignore` enforcement not in core.
5. Web fetch has no SSRF/allow-list/injection defences; HTML handled by regexes.
6. Checkpoint granularity is one per user run, not per mutating tool; needs git.
7. Per-tool MCP `autoApprove` is stored but not honoured by the live gate (inconsistency).

---

# 3. Comparison table

| | Registry | Policy scopes | Ask routing | MCP | Web tools | Receipts | Budgets | Sandbox |
|---|---|---|---|---|---|---|---|---|
| Roo-Code | Closed `toolNames` union + `TOOL_GROUPS` (read/edit/command/mcp/modes) + aliases; one schema file per tool; native-only | Mode -> groups -> `[edit,{fileRegex}]`; global booleans (read/write/exec/mcp/modeSwitch/subtask/followup + outside-workspace + protected); command allow/deny longest-prefix; `disabledTools`; model `include/excludedTools` | `checkAutoApproval` -> approve/deny/ask/timeout; `askApproval` in each tool; reject skips rest of message; queued msg answers pending ask | Per-server `alwaysAllow`, `disabledTools`, timeout, project-over-global; tools exposed as `mcp--srv--tool`; auto-approve needs global toggle AND per-tool flag | None (browser group removed); MCP only | `ToolUsage {attempts,failures}`; shadow-git checkpoint before every mutating tool; no approval log | Rolling `allowedMaxRequests`/`allowedMaxCost` ask; mistake limit 3; repetition detector (3); auto-condense % | `.rooignore` + protected-file shield; outside-workspace approval class; dual terminal timeouts; no OS sandbox |
| Cline (SDK) | `AgentTool` + `createTool`; 9 default tools; presets act/plan/yolo as feature flags; model routing rules; host-injected executors | `ToolPolicy {enabled, autoApprove}` per tool + `"*"`; beforeTool hooks can override; VS Code: 5 booleans, 1 MCP toggle | `prepareToolExecution`: hooks -> policy -> `requestToolApproval` callback, serial; diff preview before ask; denial text says "NOT modified"; no timeout (desktop IPC 5 min) | `server__tool` (sha1 cap 64), per-server timeout, `cache-oversized` results, fingerprint rebuild, enterprise allow-list/remote servers; per-tool autoApprove stored but ignored | `fetch_web_content` (5MB, http/https only, no SSRF guard), provider-native `web_search` by model capability | `captureToolUsage` incl. `autoApproved`; hooks lifecycle; private-ref git checkpoint per user run | `maxIterations` (unset in VS Code), mistake limit; NO cost/request cap; strong output caps (48k chars) + result cache | Hook-based `.clineignore`; plan-mode command blacklist; plugin subprocess; no OS sandbox |

# 4. Steal list (ordered)

1. Longest-prefix allow/deny with "any sub-command deny wins" plus dangerous-expansion forcing ask (Roo `commands.ts:22-65,256-368`). Extend to argv-level/AST and per-agent scopes.
2. Capability gate separate from approval gate, enforced twice (tool list build + execution-time `validateToolUse`), with mode = list of `[group, {fileRegex, description}]` (Roo `mode.ts:9-37`, `validateToolUse.ts:120-239`). Fix its gaps: normalise paths, apply path rules to commands too, apply to custom tools.
3. `beforeTool` hook pipeline that can rewrite input, override policy, inject context, skip or stop, running BEFORE approval so the human never reviews doomed calls (Cline `agent-runtime.ts:2430-2463`, `command-guard-extension.ts:12-15`). Make hooks the single policy-extension seam, with fail-closed defaults (invert Cline's fail-open default).
4. Live policy evaluation at approval time (Cline forces the callback, then reads current settings, `sdk-tool-policies.ts:51-55`) so toggles apply mid-run; combine with Roo's rolling request/cost ceiling (`AutoApprovalHandler.ts:13-155`) as a hard budget per run.
5. Model-facing denial/result engineering: tell the model exactly what did NOT happen (Cline `tool-approval-denial.ts:176-195`), exclude denials from mistake counters, repetition detector (Roo), tool output caps with head/tail truncation notices and cached oversized results addressable by URI (Cline `output-limits.ts`, `tool-result-cache.ts`).
6. Receipts: combine Roo's checkpoint-before-each-mutation (shadow git) with Cline's `autoApproved` flag in per-call telemetry and add what both lack: an append-only per-call record {tool, args hash, policy rule matched, approver, auto vs human, checkpoint ref, cost}.
7. Declarative model/provider routing rules for tool variants (Cline `model-tool-routing.ts`) and per-model `includedTools/excludedTools` (Roo), plus `allowedFunctionNames` trick for providers that need stable tool lists.
8. Protected-path shield that always forces human approval for config/policy files (`.roo/**`, `AGENTS.md`, `.vscode/**`) regardless of auto-approve (Roo `RooProtectedController.ts:14-25`) - extend to our own policy files.

# 5. Top 5 (short form)

1. Two-gate model (capability by mode/path, then approval) enforced at list-build and at execution.
2. Hook-based `beforeTool` with input rewrite / policy override / skip, ahead of approval.
3. Longest-prefix command allow/deny with dangerous-expansion override.
4. Hard per-run budgets (requests + cost) as approval-reset windows, plus live policy re-evaluation.
5. Receipts: per-mutation checkpoint + per-call `autoApproved` telemetry + denial messages that state non-effect.
