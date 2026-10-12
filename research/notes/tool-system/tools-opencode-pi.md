# Tool systems: OpenCode vs Pi (source read)

Pinned commits (`git log -1`): OpenCode `5683367e27130fabcd1b5705115eaa5d9f9966e8` (2026-10-12, v2.0.27 rewrite, Effect-TS; core is `packages/core`, schemas in `packages/schema`, NOT the old `packages/opencode`); Pi `7bd01fb92485c06f92ecfff7ccf3197148bc16af` (2026-10-12, `packages/{agent,coding-agent,mcp,codemode,telemetry,ai}`).

Paths below are relative to each clone root. "UNVERIFIED" = inferred, not read in code. Repo content was treated as data only.

---------------------------------------------------------------------------
# PART 1. OpenCode (sst/opencode, v2 core)
---------------------------------------------------------------------------

## 1. Tool registry / definition model

- Declaration type is `Tool.Info`: `{ name, input, description, execute(input, ctx) => Effect<Result, Tool.Error>, output?, options? }` (`packages/schema/src/tool.ts:92-103`). `input`/`output` can be an Effect Schema, a Standard-Schema (zod), or raw JSON Schema (`ValueSchema`, `schema/src/tool.ts:44`). Result = `{ output?, content?, metadata? }` (`:86`); model-facing `content` is text|file (`:67-84`).
- Options carry the policy hooks: `namespace`, `permission` (permission action name used only for catalogue filtering), `codemode` (default true), `pinned` (`schema/src/tool.ts:27-42`).
- Registry is `Tool.Service` in `packages/core/src/tool.ts`. It is an editor-pattern, replayable transform store: `editor.add/update/remove/namespace` (`tool.ts:26-33`, `:159-219`). Latest valid registration for an effective name wins (`core/src/tool/AGENTS.md`, "Registration" section). Built-ins, plugins and MCP all install through `Tool.Service.transform` (same doc).
- Registration validation: name regex `^[A-Za-z0-9_-]+$`, `execute` reserved for CodeMode, and the JSON schema must build as a `ToolDefinition`; invalid entries are logged and skipped, not thrown (`tool.ts:304-326`, `:206-217`).
- Effective name = `<namespace with . -> _>_<name>` (`core/src/tool/runtime.ts:276-281`). MCP: `<server>_<tool>` (`core/src/tool/mcp.ts:16-17`).
- Catalogue is code, not data: built-in tools are plugins under `core/src/tool/plugin/*.ts` (edit, glob, grep, patch, question, read, shell, skill, subagent, webfetch, websearch, write, mcp-resource). No per-tool version field; only event schemas carry `durable.version` (e.g. `session.tool.success` version 2, `schema/src/session-event.ts:530-534`). Registry revision is implicit (State replay, `tool.ts:158-160`).
- No explicit risk class on a tool. Risk is expressed only as a permission *action* string (`read`, `edit`, `shell`, `webfetch`, `websearch`, `subagent`, `skill`, `question`, `external_directory`, `execute`, `<server>_<tool>`; `services/www/src/docs/content/permissions.mdx` "Actions" table). `edit`, `write`, `patch` share action `edit` (`tool/AGENTS.md` "Permissions").
- Schema normalisation for provider quirks happens at definition time: inlines `$ref/$defs`, flattens `allOf`, drops unused `$defs` (`runtime.ts:174-259`). Input repair hook coerces stringified/mis-typed args against the schema before validation (`core/src/plugin/tool-input-repair.ts:1-45`).

```ts
// schema/src/tool.ts:92-103
export type Info<Input, Output> = {
  readonly name: string; readonly input: Input; readonly description: string
  readonly execute: (input, context: Context) => Effect.Effect<Result<Output>, Error>
  readonly output?: Output; readonly options?: Options }
```

## 2. Permission / policy model

- Rule = `{ action: string, resource: string, effect: allow|deny|ask }` (`schema/src/permission.ts:56-66`). Ruleset is an ordered array; **last match wins**; no match => `ask` (`core/src/permission.ts:87-97`, `evaluate`).
- Matching: `Wildcard.match` converts `*`->`.*`, `?`->`.`, anchors, case-insensitive on Windows; trailing ` *` also matches the bare command (`core/src/util/wildcard.ts:3-13`).
- Multi-resource operations: any `deny` wins, else any `ask`, else allow (`permission.ts:165-166` `denied`, `:173-189` `evaluateInput`; documented in permissions.mdx "Matching").
- Scopes (low -> high precedence): base agent policy (allow `*`, ask `external_directory`, ask `*.env`) -> config global `permissions` -> per-agent `agents.<id>.permissions` -> session `permissions` (`core/src/permission.ts:158-163` `configured` = `merge(agent.permissions, session.permissions)`); then project-scoped **saved approvals** (always-allow, DB) appended as allow rules (`:148-156`, `:174`); then plugin `permission.evaluate` hook; then **policies** (managed / org) which can only turn allow/ask into deny (`core/src/config/plugin/policy.ts:48-63`, `core/src/managed-policy.ts:50-75`). Org statements from the Console come last and "have the final say" (`policy.ts:125-127` comment). Default for any agent: `schema/src/agent.ts:46-51`.
- Pattern granularity per tool: shell resources are tree-sitter-parsed per-command strings; "save" pattern is a command prefix with arity table (`git status *`, `npm run *`, ~130 entries) (`core/src/shell/parse.ts:23-160`, `:375-381`; `:195-198` yields `{resource, save}`). File tools use location-relative paths; paths outside project need a prior `external_directory` approval (`core/src/file-access.ts:93-142`). Web: URL / query string as resource. MCP: action `<server>_<tool>`, resource `*` only (arguments are not matchable) (`core/src/tool/mcp.ts:51-57`).
- Ask routing: `Permission.assert` publishes `permission.asked` on the bus and parks on a `Deferred` (`permission.ts:205-263`); any client (TUI, web app, ACP/editor, SDK) answers with `reply({requestID, reply: once|always|reject, message?})` (`:265-325`, schema `schema/src/permission.ts:42`). ACP bridge maps to Allow once / Always / Reject options (`packages/cli/src/acp/permission.ts:39-74`). Non-interactive `run`: with `--auto/--yolo/--dangerously-skip-permissions` replies `once` to everything; otherwise auto-rejects with feedback "This non-interactive run cannot ask the user..." (`cli/src/run/noninteractive.ts:73-74`, `:158-183`; flag wiring `cli/src/commands/handlers/run.ts:27`).
- "Remember" semantics: `always` writes one row per tool-proposed `save` pattern into a project-scoped table (`permission/saved.ts:63-78`, called at `permission.ts:299-305`), and immediately releases other pending asks that now evaluate to allow (`:309-321`). Saved approvals are allow-only, never override a configured deny (deny is checked before saved rules, `:173-175`). Reject rejects **every pending request in the session**, optional feedback becomes `CorrectedError` that goes to the model (`:277-296`). No "always deny" memory, no expiry, no TTL on saved rows (UNVERIFIED for expiry; schema has only created/updated, `permission/saved.ts:50-58`).
- Timeouts: none on permission asks; pending Deferred waits until reply or `close` (rejects all, `permission.ts:133-145`). Websearch provider-choice form has a 1-minute timeout (`tool/plugin/websearch.ts:141-144`).
- Enforcement point: **in-process, inside each tool leaf, before the side effect**, not by the registry (`tool/AGENTS.md`: "registry has no Permission.Service dependency and performs no execution authorization"). Catalogue visibility is also filtered: a tool whose action resolves to a wildcard-resource deny is dropped from the request (`tool.ts:229-233`, `whollyDisabled` `:292-295`). Decline is tunneled as a defect so blanket `mapError` can't turn it into model output (`permission.ts:249-256` comment; `core/src/session/model-request.ts:400-410`).
- No OS-level enforcement. Docs say so: "`shell` runs with the host user's filesystem, process, and network authority. Directory inference from command text is best effort" (permissions.mdx "Directories").

```ts
// core/src/permission.ts:87-97
export function evaluate(action, resource, ...rulesets) {
  return rulesets.flat().findLast(r => Wildcard.match(action, r.action) && Wildcard.match(resource, r.resource))
    ?? { action, resource: "*", effect: "ask" } }
```

## 3. Tool exposure to the LLM

- Per request, `SessionContext.select` builds `registry.snapshot(Permission.merge(agent.permissions, session.permissions))` (`core/src/session/context.ts:121-134`). `snapshot` filters out wholly-denied tools and splits remaining into **direct** (`codemode:false`: shell, webfetch, websearch, etc.) and **CodeMode** tools (default), sorted by name for cache stability; adds one synthetic `execute` tool when not denied (`tool.ts:225-262`).
- Progressive disclosure = **CodeMode**: tools in the CodeMode namespace tree are not individually declared; the model writes TS-like scripts calling `tools.ns.name(...)` through `execute`, with a ranked inline catalogue of ~2000 budget units (`core/src/codemode/catalog.ts:50-55`, `:79-98`; `CodeModeTool.catalog`, `tool.ts:249-254`), pinned entries first, plus a `search(...)` builtin (`packages/codemode/README.md`, "Execution Limits" area). Rendered catalogue is cached across steps keyed on tool names (`tool.ts:249-254`).
- Prompt-cache hygiene: instructions ordered "most to least shared across sessions" (`session/context.ts:136-150`); MCP instructions diffed and emitted as deltas (`mcp/instructions.ts:31-52`).
- Session hook `context/compaction/generate` can mutate/remove/rename declared tools and descriptions; hook-invented tools are dropped by identity check, so a plugin cannot add a tool the registry did not hold (`core/src/session/model-request.ts:246-276` comments "Entries matching neither were invented by a hook and are dropped"). Shell tool rewrites its own description per active shell (`tool/plugin/shell.ts:283-291`); websearch removes itself when disabled (`tool/plugin/websearch.ts:184-194`).
- Step cap: `agent.steps`; at limit `toolChoice: "none"` and execution short-circuits "Tools are disabled after the maximum agent steps" (`core/src/session/runner/llm.ts:223-241`, `runner/step.ts:95-98`).
- Parallel calls: each `tool-call` stream event forks the execution immediately (concurrent by default; `step.ts:121-137`). Provider quirks live in `packages/ai` protocol adapters (e.g. `parallel_tool_calls` mapping `ai/src/protocols/alibaba-chat.ts:62-85`, anthropic `disableParallelToolUse`, `ai/src/protocols/anthropic-messages.ts:558`) and model capability flags (`core/src/modal/models.ts:115` `capabilities.tools`). Whether a tool-less model gets an empty tool list was not traced (UNVERIFIED).
- Description token budget: no per-description cap found; only the CodeMode inline catalogue budget. Output budget: `outputLimit()` fits max_tokens to remaining context (`model-request.ts:94-103`).

## 4. MCP integration

- Config: `mcp.servers: Record<name, local|remote>` with `command[]`, `cwd`, `environment`, `disabled`, `codemode`, `timeout{startup,catalog,execution}`, `protocol` (legacy|auto|2026-07-28), remote `url`, `headers`, `oauth{client_id, client_secret, scope, callback_port, redirect_uri, auth_server_metadata_url}|false` (`schema/src/mcp.ts:3-60`, `schema/src/config/mcp.ts:19-22`).
- Timeouts: startup 30 s, catalog 30 s, **execution 12 hours** default (`core/src/mcp/client.ts:34-36`), progress callback keeps calls alive (`client.ts:360-361`).
- Namespacing/allow-deny: tools registered as `<server>_<tool>` (non-`[A-Za-z0-9_-]` -> `_`); per-tool permission action is that name with resource `*` (`tool/mcp.ts:43-57`). Org/config policy can remove a whole server: `integration.use` resource `mcp:<name>` (`config/plugin/policy.ts:137-142`). Per-server `codemode:false` pushes its tools to direct declaration (`tool/mcp.ts:45`).
- Env: stdio servers spawn through the Location `Environment`; only config-declared env is sent across the seam, host env merged on the spawner side (`mcp/stdio.ts:27-34`, `:84-88`).
- Results: text -> content, binary -> `data:` URI file parts; `isError` -> `ToolFailure`; JSON-looking text auto-parsed when no output schema (`tool/mcp.ts:78-110`). Size cap only by the global tool-output truncation (2000 lines / 50 KiB, full file kept 7 days, `core/src/tool-output.ts:13-16`, `:67-118`). No MCP-specific sanitisation or injection marking.
- Server instructions are injected into the system prompt inside `<mcp_instructions>` after only a permission-visibility filter (`mcp/instructions.ts:21-26`, `:76-105`) -> trusted-text-from-remote surface (see weaknesses).
- OAuth: SDK-driven PKCE (verifier required, `mcp/oauth.ts:209`), RFC 9728-style discovery state, tokens stored through `Credential.Service` as integration credentials, invalidated on failure with a warning (`oauth.ts:235-296`); redirect default `http://127.0.0.1/callback` (`:152`). Elicitation supported (`client.ts:188`).

## 5. Network / web tools

- `webfetch`: http/https only (`assertHttpUrl`, `webfetch.ts:70-72`), GET, 30 s default / 120 s max timeout (`:13-15`), body hard cap 5 MiB via streaming bounded collector (`tool/http-body.ts:5-29`, `html-markdown.ts:50`), content types limited to text/json/xml/js (no images/binaries, `webfetch.ts:85-95,140-143`), HTML->markdown or text with script/style/iframe stripped (`:170-187`). Permission `webfetch` with URL as resource (`:124-133`). Retries with UA `opencode` on Cloudflare challenge (`:61-65,136`).
- **No SSRF guard** (no private-IP / link-local / metadata-endpoint check) and no allow-list beyond permission patterns; redirect policy not set explicitly (UNVERIFIED, depends on Effect HttpClient default).
- `websearch`: backend is a pluggable `WebSearch.Provider` (e.g. MCP-backed providers calling `tools/call` over JSON-RPC with 256 KiB response cap and 25 s timeout, `core/src/plugin/websearch/mcp.ts:7,56-67`); first use asks the user to choose/allow/disable a provider (form, `tool/plugin/websearch.ts:75-137`); selection persisted in KV (`core/src/websearch.ts` `ProviderKey`). Results rendered as markdown links with provider snippets (`:153-163`).
- Prompt-injection defence: none specific. Only mitigation is the permission ask on the URL/query. Fetched text goes straight into the tool result.

## 6. Audit / telemetry per call

- Every session mutation is a **durable event** appended to an event store with per-aggregate sequence (`core/src/event/sql.ts`, `EventSequenceTable`). Tool lifecycle events: `session.tool.input.started/ended` (raw input text), `session.tool.called` (parsed input, `executed` bool), `session.tool.progress` (ephemeral), `session.tool.success` (content, metadata, `executed`), `session.tool.failed` (error, bounded partial content) (`schema/src/session-event.ts:468-566`). Step events carry `cost` (USD) and `tokens` and a file snapshot diff per step (`session-event.ts:161-171, 364-365`; `session/runner/step.ts:241-262`; `core/src/snapshot.ts`).
- Not logged per tool: duration/start-end timestamps are only whatever `Base` events carry (UNVERIFIED), no args hash, no result hash, no per-tool cost. Permission asks/replies are **ephemeral** events (`schema/src/permission.ts:45-53`), i.e. the approval trail is not durably recorded; only the saved-always rows persist.
- `EventLogger` logs only config/agent/provider/model/command update events (`core/src/event-logger.ts:6-15`).
- Tamper resistance: none (SQLite rows, no hash chain/signing).
- Shell output is persisted to a backing file; model sees bounded tail with full path (`tool/AGENTS.md` "Output").

## 7. Cost / rate limits / budgets per tool

- No per-tool budget or rate limit. Limits that exist: per-agent `steps` cap (`llm.ts:223`), shell default 2-minute timeout (`shell.ts:24`), webfetch/websearch timeouts, 50 KiB/2000-line output cap, CodeMode `timeoutMs/maxToolCalls/maxOutputBytes` which default to **unlimited** (`packages/codemode/README.md` "Execution Limits"; `core/src/codemode/tool.ts` sets none found, UNVERIFIED). Cost is tracked per step/compaction only.

## 8. Sandboxing / isolation

- None at OS level for shell/file tools; policy is the only gate and docs call the shell scanner "best effort" (permissions.mdx). Path checks are **lexical** (`file-access.ts:79-123`, "Lexical directory used as the external approval boundary"); doc says explicit external paths are canonicalized before matching (permissions.mdx "Directories") but `resolve` uses `path.resolve` only (symlink escape = UNVERIFIED).
- CodeMode runs a custom interpreter (not eval): "only runs the language features we implement ... cannot access network, filesystem, processes" (`packages/codemode/README.md:7-8`); extensions (e.g. `fetch`) are explicit host globals. Nested tools still hit their own leaf permission (permissions.mdx `execute` row).
- Shell env marker injection (`AGENT=1`, `OPENCODE_SESSION_ID`, `shell.ts:213-216`). Remote workspaces: MCP stdio spawns where the Location lives (`mcp/stdio.ts:27-34`).

## 9. Extensibility

- Plugin API (`packages/plugin/src/effect/*`): `ctx.tool.transform(editor => editor.add/update/remove)`, `ctx.tool.hook("execute.before"|"execute.after")`, `ctx.permission.hook("evaluate")`, `ctx.session.hook("context"|...)`, `ctx.mcp/skill/provider/agent/shell/websearch` transforms (`plugin/src/effect/tool.ts:20-60`, `permission.ts:7-24`).
- `execute.before` may mutate `input` and fail with `Tool.Error` (reject); it is the **only** hook with a failure channel (`core/src/plugin/hooks.ts:23-30`). `permission.evaluate` hook receives `{action, resources, effect}` and can **flip effect in either direction** (including allow), so a plugin is trusted with the entire policy (`permission.ts:178-189`, `plugin/src/effect/permission.ts:7-16`). The shipped managed-policy plugin uses it only to force deny (`config/plugin/policy.ts:48-63`).
- Validation of third-party tools: name regex, schema compile, namespace regex; runtime wraps foreign errors into `Tool.Error` so a plugin cannot leave a call unsettled (`tool.ts:304-326`, `tool/runtime.ts:29-45`). Input/output validated at runtime; undeclared output rejected (`runtime.ts:46-55`). No signing/sandboxing of plugin code (UNVERIFIED but no isolation seen); plugin tools receive same `Permission.Service` and must call it themselves.

## 10. Weaknesses and ideas

Weaknesses
1. Default policy is allow-all (`schema/src/agent.ts:46-51`): shell/edit run unasked unless config adds ask rules. (permissions.mdx "Defaults" describes `external_directory` as ask and `*` allow.) Doc/code drift: docs say policies use action `permission` while code matches `tool.use` (`schema/src/config/policy.ts:5-8` vs permissions.mdx "Policies").
2. Enforcement lives inside every tool leaf by convention; registry cannot guarantee a plugin tool asked. MCP permission can't see arguments (`resources:["*"]`).
3. Lexical path and best-effort shell parsing; no OS sandbox; explore agent has `shell: allow *` and read-only-ness is prompt text only (`plugin/agent.ts:14-15,106`).
4. Permission asks are ephemeral and untimed: no durable approval audit, no timeout/expiry, saved rules never expire.
5. Execution default 12 h on MCP calls; CodeMode limits default unlimited.
6. webfetch has no SSRF/private-range guard; MCP server instructions and tool descriptions flow into the system prompt un-sanitised.
7. Plugin `permission.evaluate` can grant, widening trust to any loaded plugin.

Ideas to steal
- Single ordered `{action, resource, effect}` ruleset, last-match-wins, deny-over-ask-over-allow across multi-resource ops, with a separate never-grants "policy" layer on top (managed-policy.ts).
- Tool declares both `resource` (what is checked now) and `save` (the generalised pattern to remember), with a command-arity prefix table (`shell/parse.ts`).
- Catalogue visibility filtered by the same ruleset (`whollyDisabled`) so denied tools never cost tokens or tempt the model.
- Decline-as-defect + feedback-as-typed-error split so user "no" cannot be laundered into model-visible text, while "no, because X" steers the model.
- Hook-invented-tool drop via object identity (`model-request.ts:246-276`) and replayable transform registry with scoped dispose.

---------------------------------------------------------------------------
# PART 2. Pi (earendil-works/pi)
---------------------------------------------------------------------------

Design stance stated in code docs: "Pi ... does not ask for approval before every tool call" and "lack of a built-in sandbox" is out of its security boundary (`packages/coding-agent/docs/security.md:3,98`). Permissions are an extension concern.

## 1. Tool registry / definition model

- Two layers. Core `AgentTool` in `packages/agent` and rich `ToolDefinition` in `packages/coding-agent/src/core/extensions/types.ts:579-660`: `name, label, description, promptSnippet?, promptGuidelines?, parameters (TypeBox), constrainedSampling?, prepareArguments?, outputSchema?, exposure?, namespace?, reachesTools?, annotations?, defaultActive?, prepareLoadout?, executionMode?, execute(id, params, signal, onUpdate, ctx)`. `wrapToolDefinition` adapts to `AgentTool` (`core/tools/tool-definition-wrapper.ts:8-30`).
- Built-ins are a closed set: `read bash powershell edit write grep find ls` (`core/tools/index.ts:95-105`), factories take `cwd` and per-tool `*Operations` for pluggable backends (e.g. remote/sandboxed exec). Presets `createCodingTools` (read,bash,edit,write) and `createReadOnlyTools` (read,grep,find,ls) (`index.ts:164-211`). No built-in web tool and no permission field on a tool.
- Risk metadata is **MCP-style annotations**: `readOnlyHint/destructiveHint/idempotentHint/openWorldHint`, explicitly "not verified; permission extensions can use them" (`types.ts:518-531`).
- Exposure enum is the catalogue control: `direct | model-only | codemode | deferred | hidden` (`types.ts:516`) plus `defaultActive` (`:631`). Registry in `AgentSession._refreshToolRegistry` merges base tools, extension tools (and SDK custom tools) in a Map keyed by name, **later registration overwrites earlier, including built-ins** (`agent-session.ts:3520-3575`, `toolRegistry.set(tool.name, tool)`); `registerTool` only checks `parameters` is an object (`extensions/loader.ts:289-301`). No version field; no collision error (UNVERIFIED beyond that check).
- Argument handling: optional `prepareArguments` shim -> `validateToolArguments` (clone, null-normalise, convert/coerce, TypeBox check; `packages/ai/src/utils/validation.ts:317-345`) -> `tool_call` hook (`agent/src/agent-loop.ts:708-775`).

## 2. Permission / policy model

- There is **no core permission engine**. The only primitive is the extension event `tool_call`: handlers may mutate `event.input` in place or return `{block, reason, terminate}` (`types.ts:1245-1264`, `:1454-1463`). `runner.emitToolCall` runs handlers in order and stops at first block (`extensions/runner.ts:1249-1267`). Mutated input is **not re-validated** (`types.ts:1254` doc comment).
- Fail-closed: a throwing `tool_call` handler blocks the tool (`docs/extensions.md:263`; `agent-session.ts:658-681` rethrows; `agent-loop.ts` `prepareToolCall` catch converts to error result, `:765-775`).
- Scopes: allow/deny/ask live in user extension code. Reference examples: `permission-gate.ts` (regex of dangerous bash patterns, `ctx.ui.select` confirm, `ctx.hasUI` false => block), `protected-paths.ts` (substring blocklist on write/edit), `confirm-destructive.ts`, `sandbox/` (OS sandbox), `timed-confirm.ts` (examples/extensions). Flag-level gating: `--tools`, `--exclude-tools` (glob `*` patterns), `--no-tools`, `defaultTools` setting, `--no-mcp` (`agent-session.ts:451,1540-1560`; `core/mcp-servers.ts:12-25`).
- Project trust is the only built-in gate: protected resources (`.pi/settings.json`, `.pi/mcp.json`, `.pi/extensions|skills|prompts|themes`, SYSTEM.md, `.agents/skills`) load only after trust; decision order = CLI `--approve/--no-approve`, then `project_trust` extension event, then saved `~/.pi/agent/trust.json` (closest parent), then `defaultProjectTrust` (`ask|always|never`) (`docs/security.md` "Understand project trust"; `core/project-trust.ts`, `core/trust-manager.ts`). Non-interactive modes cannot prompt (`security.md`). Context files (AGENTS.md etc.) load regardless of trust.
- Ask routing: `ctx.ui.select/confirm/input/editor` on interactive TUI; in RPC mode they become `extension_ui_request` JSON on stdout awaiting `extension_ui_response` by id; dialogs accept `timeout` (agent-side auto-resolve) or an `AbortSignal` (`docs/rpc-extension-ui.md:7-63`; `examples/extensions/timed-confirm.ts`). Print/JSON modes: `ctx.hasUI` false; the example extension blocks by default there.
- "Remember this decision": none built in. An extension must implement it (UNVERIFIED that any shipped example persists decisions).
- Enforcement point: before the call, in the agent loop, after validation (`agent-loop.ts:728-762`); nested calls get the same hooks via `runToolCall` and `parentToolCallId` (`agent-loop.ts:804-830`, `agent-session.ts:733-755`, `docs/extensions.md:149`). Abort re-checked after the hook returns (`agent-loop.ts:736-743`). Not OS-level.

```ts
// types.ts:1454-1463
export interface ToolCallEventResult { block?: boolean; reason?: string; terminate?: boolean }
// agent-loop.ts:762-770 : a hook returning { block } short-circuits to an error ToolResult for the model
```

## 3. Tool exposure to the LLM

- Declared set = "active tools" = `agent.state.tools` (`agent-session.ts:1484-1494`). `_applyToolLoadout` keeps only registered, non-`hidden`, activatable tools, then lets active tools' `prepareLoadout` rewrite descriptions or hide declarations (`agent-session.ts:1566-1625`). Hidden declarations stay callable and in the transcript but are omitted from requests (`types.ts:566-574`).
- Progressive disclosure is first-class: `codemode` tools are callable only from the `codemode` script tool (not declared, not listed); `deferred` tools are loaded by a BM25 `tool_search` into the next call; `direct` declared normally (`docs/mcp.md` "Control tool exposure"; `extensions/tool-search/tool.ts:1-36,128-155`; `agent-session.ts:1561-1573` `_getCallableTools`). Loaded-by-search tools are recorded in the transcript so they persist across `/tree`, resume, fork (mcp.md). Codemode description does not list MCP tools so it is stable and cache-friendly (mcp.md).
- System-prompt budget: per-tool `promptSnippet`/`promptGuidelines` only for active tools; custom tools without a snippet are omitted from "Available tools" (`types.ts:586-589`). MCP servers summarised as one line each in an `mcp_servers` section, appended as a new message when it changes rather than rewriting earlier context (mcp.md).
- Execution mode: default parallel; any call to a tool with `executionMode:"sequential"` forces the whole batch sequential (`agent-loop.ts:508-528`). Truncated assistant message (hit output limit) -> **no tool calls executed**, each returns an error telling the model to re-issue (`agent-loop.ts` `failToolCallsFromTruncatedMessage`, ~`:478-505`).
- Provider quirks: `constrainedSampling` per tool and `strict` JSON schema options in `packages/ai/src/api/constrained-sampling.ts`, anthropic/bedrock/mistral adapters (`anthropic-messages.ts:1623-1647`, `bedrock-converse-stream.ts:1163`). Model without tools: not traced (UNVERIFIED).

## 4. MCP integration

- Built-in extension `packages/coding-agent/src/extensions/mcp/*` over `packages/mcp` client. Config: `~/.pi/agent/mcp.json` + `.pi/mcp.json` (project, trust-gated; same-name project entry replaces user entry; entry without command/url only overrides `enabled/exposure/toolExposure`) (`docs/mcp.md` "Configure servers").
- Types and validation: `McpServerConfig` stdio|http, `exposure`, per-tool `toolExposure` with exact-then-first-pattern precedence, `timeout` seconds (default 60, progress resets), `enabled`, `description` (`core/mcp-servers.ts:59-78,233-305`). SSE rejected (`:270`). Server name regex; `url` must be http(s) (`:249,272-275`).
- Namespacing: `mcp__<server>__<tool>`, sanitised, 64-char cap, sha256-8 suffix on collision (`extensions/mcp/tools.ts:49,79-92`).
- Per-server/tool allow-deny: `exposure: hidden` and `toolExposure` patterns (e.g. `"delete_*": "hidden"`), `--tools`/`--exclude-tools` with `mcp__x__*` patterns (mcp.md; `agent-session.ts:1540-1560`). Permissions otherwise via extension `tool_call` + annotations (mcp.md "Permissions").
- Secrets: `${ENV}` and whole-value `!command` substitution in `env`/`headers` (mcp.md). `auth: {provider}` reuses a Pi login token but is forbidden in project `mcp.json` and requires https (`mcp-servers.ts:143-148,281-289`).
- Result handling: text over 20 KB is middle-truncated, full text in a temp file (`extensions/mcp/tools.ts:51,177-198`); `isError` -> error result; codemode scripts get the full untouched `CallToolResult` (tools.ts header comment, mcp.md). Resource tools and ui:// resources skipped. Tool calls never retried, resource reads retried once (mcp.md).
- OAuth: dynamic client registration or pre-registered client, CIMD option, RFC 9728/8414/9207 checks, loopback-only callbacks (RFC 8252), `authServerMetadataUrl` override (https only), tokens in `~/.pi/agent/mcp-auth.json`, credentials keyed by server name + URL (mcp.md "Authenticate with OAuth"; `mcp-servers.ts:91-126,167-209`). Server logging notifications to `~/.pi/agent/mcp.log` (5 MB rotate).
- Stdio teardown: close stdin, SIGTERM, SIGKILL process group (mcp.md).

## 5. Network / web tools

- Core ships **no** web search/fetch tool (tool list `core/tools/index.ts:95-105`; repo-wide grep for web search finds only provider-side Anthropic passthrough in `packages/ai`). Web access comes from MCP servers, extensions or bash (curl). Consequently no built-in URL allow-list, size cap or injection defence. `security.md` states prompt injection is expected and out of scope. Only the optional OS sandbox example restricts domains: `network.allowedDomains/deniedDomains` via `@anthropic-ai/sandbox-runtime` (`examples/extensions/sandbox/index.ts:1-45`).

## 6. Audit / telemetry per call

- Session file is an append-only JSONL **tree** (id/parentId entries), tool results stored as `toolResult` messages with `toolCallId, toolName, content, isError`, plus extension `details` and optional `usage` (`docs/session-format.md:91-92,187`). Separate `usage` entries record non-message model cost (e.g. cache warm) and roll into session totals (`session-format.md:115-121`).
- Events (JSON/RPC mode): `tool_execution_start/update/end` carry `toolCallId, toolName, args, partialResult`, `durationMs` measured in the loop (`agent-loop.ts:817-848`, `agent-session.ts:1361`). Nested (codemode) calls are not in the transcript; a bounded `nestedCalls` record (name, args <=8 KiB, status, duration, error; never results; max 256; `complete:false` if lossy) is attached to the parent result and their `usage` is rolled up into the parent (`docs/extensions.md:149`; `core/nested-tool-calls.ts`).
- `tool_result` extension hook can redact content (and must also replace `structuredContent`) before persistence (`types.ts:1267-1284`, `agent-session.ts:684-724`).
- `packages/telemetry`: vendor-neutral span/attribute contract with typed schemas; its security note says to avoid tool args/outputs unless schema allows (README "Security and Portability"). `coding-agent/core/telemetry.ts` is only an install-telemetry toggle (13 lines). No args/result hashes, no signing, no tamper evidence (UNVERIFIED for `packages/durable`, not read).

## 7. Cost / rate limits / budgets per tool

- Per-tool: only per-call output limits (read/bash 2000 lines / 50 KB, grep line 500 chars; `core/tools/truncate.ts:11-13`), bash optional timeout with max cap (no default; `core/tools/bash.ts:27-42`), MCP 60 s request timeout and 20 KB model-text cap. Codemode `timeoutMs`, `memoryLimitBytes` heap cap, `max_output_tokens` option parsed from a `// @options` first line but "the sandbox does not act on them; the caller decides" (`packages/codemode/README.md:58-86`). Tool-reported `usage` rolls into session cost. No spend budget or tool-call rate limit found in coding-agent (grep "budget" hits only compaction/retry).

## 8. Sandboxing / isolation

- None by default; docs recommend running the whole Pi in container/VM (`docs/security.md` table; `docs/containerization.md`). Two integration seams: per-tool `*Operations` and `BashSpawnHook` (`core/tools/bash.ts:79-99,223`) for routing exec to a remote/isolated environment, and the sandbox example overriding `bash` with `SandboxManager` (bubblewrap/sandbox-exec, FS deny-read/allow-write, domain allow-list) (`examples/extensions/sandbox/index.ts`).
- Codemode runs QuickJS-WASM in a worker thread (Node/Bun) or a separate Durable Object isolate (Cloudflare) with heap and time limits (`packages/codemode/README.md:7-14,58-60,110-127`).
- File writes serialised per path via `withFileMutationQueue` (`core/tools/file-mutation-queue.ts`).

## 9. Extensibility

- Extensions are TS modules (jiti-loaded) executed **in-process with full user privileges** ("Extensions execute inside the Pi process", `security.md`). API: `pi.on(event)`, `pi.registerTool`, `pi.registerMcpServer`, `registerCommand`, tool renderers, providers, `setActiveTools`. Events relevant to tools: `tool_call` (block/mutate), `tool_result` (compose/redact/override isError, usage, terminate), `context`/`context_with_system` request transforms, `user_bash`, `project_trust`, `mcp_servers_change` (`types.ts:1193-1335,1659-1673`; runner `1249-1305`).
- Third-party tool validation: object-parameter check only (`loader.ts:289-296`); TypeBox arg validation at call time; `prepareArguments` shim. An extension can **replace built-ins and `codemode`/`tool_search`/`/mcp`** (mcp.md "Replace the built-in MCP support"; `agent-session.ts:3555-3575`). `reachesTools()` lets meta-tools declare which tools they may reach so permission/lazy-registration hooks can act first (`types.ts:621`, extensions.md:183).
- Rewrite power: `tool_call` can rewrite arguments (e.g. wrap a bash command in a sandbox, per sandbox example comment) and `tool_result` can rewrite output; nested calls inherit both.

## 10. Weaknesses and ideas

Weaknesses
1. No built-in allow/deny/ask, no remembered decisions, no policy layering: safety == whichever extension the user installed; a hostile or buggy extension has full authority and can overwrite built-in tools silently.
2. Mutating `event.input` in `tool_call` skips re-validation (`types.ts:1254`).
3. Project-trust is bypassable by design for context files and `sessionDir` (security.md); trust decisions in non-interactive modes default to skip, but `defaultProjectTrust:"always"` is one setting away.
4. Substring/regex gates in shipped examples (permission-gate, protected-paths) are trivially evadable; no shell parsing like OpenCode.
5. No audit of approvals, no args/result hashes; nested calls drop results and truncate args; telemetry is best-effort.
6. No web tool means no network policy hook point of its own; bash is the web tool.
7. MCP annotation hints are unverified author claims by design.

Ideas to steal
- `exposure` enum (direct/model-only/codemode/deferred/hidden) + `toolExposure` per-tool pattern overrides + BM25 `tool_search`: progressive disclosure with transcript-persisted loads and cache-stable declarations.
- Single `tool_call` chokepoint that also covers nested tool calls with `parentToolCallId` and `<parent>/<n>` ids; fail-closed on handler error.
- Refuse to execute tool calls from a max-output-truncated assistant message (`agent-loop.ts` `failToolCallsFromTruncatedMessage`).
- `reachesTools()` declaration so policy hooks know a meta-tool's reach before it runs.
- Nested-call record with bounded size, `complete:false` flag and usage rollup; project trust gate on executable project config.

---------------------------------------------------------------------------
# Comparison

| repo | registry | policy scopes | ask routing | MCP | web tools | receipts | budgets | sandbox |
|---|---|---|---|---|---|---|---|---|
| OpenCode | Plugin-fed editor registry (`tool.ts`), `Tool.Info` with Effect/zod/JSON schema, namespace, per-tool permission action; no version/risk class | Ordered `{action,resource,effect}` last-match: base -> global -> agent -> session -> saved-always (project) -> plugin hook -> managed deny-only policy | Bus event `permission.asked` + Deferred; once/always/reject(+feedback); TUI/app/ACP/SDK; headless auto-reject or `--auto`; no timeout | Local+remote, 3 timeouts (exec 12 h), OAuth PKCE via credential store, `<server>_<tool>` action w/ `*` resource, server-level policy kill, instructions injected raw | webfetch (5 MiB, 30 s, text only, no SSRF guard), websearch via pluggable provider/MCP (256 KiB), permission on URL/query, no injection defence | Durable event log per tool (input, called, success/failed) + step cost/tokens + file snapshot diff; approvals ephemeral; no hashes | steps cap, shell 2 min, 50 KiB output, CodeMode limits default unlimited; no per-tool spend | None OS-level; lexical paths; CodeMode custom interpreter |
| Pi | `ToolDefinition` (TypeBox, annotations, exposure enum, namespace, reachesTools); built-ins fixed 8; extensions can overwrite | No engine; `tool_call` hook only + `--tools/--exclude-tools` + trust.json for project resources | Extension `ctx.ui.confirm/select` (TUI) or RPC `extension_ui_request` with timeout; none in print/json unless `defaultProjectTrust` | stdio+HTTP, `mcp__server__tool`, 60 s, exposure + toolExposure patterns, OAuth (DCR/CIMD, loopback), 20 KB cap, hints only | None built-in (MCP/bash); injection out of scope | JSONL tree sessions, toolResult + usage, `durationMs`, bounded nestedCalls; no hashes/signing | Output caps, codemode time/heap, bash optional timeout; no spend/rate | Opt-in: whole-process container or sandbox-runtime extension; codemode QuickJS worker/DO |

# Steal list (ranked)

1. Rule triple + ordering semantics from OpenCode: `{action, resource, effect}`, last-match-wins, multi-resource deny>ask>allow, default ask, plus `save` pattern separate from `resource` and a deny-only managed-policy layer applied last. Add what both lack: durable approval receipts, TTL on remembered rules, and ask timeout = deny.
2. Single enforced chokepoint (Pi `tool_call` incl. nested `parentToolCallId`, fail-closed, re-validate after mutation) combined with registry-level visibility filtering using the same ruleset (OpenCode `whollyDisabled`), so policy is not left to each tool leaf.
3. Pi exposure model (direct/deferred/codemode/hidden, per-tool pattern overrides, BM25 `tool_search`, transcript-recorded loads, stable declarations for prompt cache) plus OpenCode CodeMode inline-catalogue budget.
4. Reject executing tool calls from a truncated assistant turn (Pi) and decline-as-defect vs feedback-as-typed-error split (OpenCode) so human "no" is never rewritten into model-trusted text.
5. Command-prefix arity table + tree-sitter per-command resources for shell (OpenCode), but pair it with an OS sandbox seam like Pi's `Operations`/`BashSpawnHook`, since neither project enforces below the process.
6. Bounded nested-call records with usage rollup and `complete:false` honesty (Pi), written into an append-only, hash-chained log (neither does the hash chain).
7. Add what neither has: SSRF guard on fetch, MCP result/instruction sanitisation with provenance tags, per-tool and per-session budgets, and signed/verified tool annotations rather than trusting server hints.
