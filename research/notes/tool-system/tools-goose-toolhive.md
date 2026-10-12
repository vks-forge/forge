# Tool systems: Goose vs ToolHive (source reading)

Pinned commits: Goose `4617040c7b650b37d599bdaa08d3790572c19ae8`; ToolHive `87de960f619a510b6b627c0cb3cb8c97843d660f`.
Paths are relative to each clone root. Goose core is `crates/goose/src` (abbrev `G/`). ToolHive core is `pkg` (abbrev `T/`).
Marks: **UNVERIFIED** = inferred or not visible in the clone. ToolHive's permission-profile structs, registry types and the sigstore verifier live in the external module `github.com/stacklok/toolhive-core` (go.mod:71), which is NOT in the clone, so those are cited from docs/arch only.

---------------------------------------------------------------------------
# PART 1 - GOOSE (block/goose, Rust)

Goose is an in-process agent. Its "tool system" is an ordered chain of inspectors in front of a single dispatch point. MCP servers are extensions; permissions are keyed by tool name only.

## 1. Tool registry / definition model
- Tool = rmcp `Tool` (name, description, input_schema, `annotations` read_only/destructive/idempotent/open_world hints, `meta`). There is no Goose-specific risk class. The only risk signal is MCP `ToolAnnotations.read_only_hint`.
- Extensions are the unit of registration: `ExtensionConfig` enum `Stdio | Builtin | Platform | StreamableHttp` (G/agents/extension.rs:158-257). Each variant has `timeout`, `available_tools` (allowlist) and `bundled`. Stdio has `cmd/args/envs/env_keys/cwd`. StreamableHttp has `uri/headers/socket` plus OAuth `client_id/client_secret_key/scopes` (extension.rs:209-256).
- Public tool name = `<ext_key>__<tool>` unless the extension is first-class/unprefixed; owner is stamped into `tool.meta[TOOL_EXTENSION_META_KEY]` (G/agents/extension_manager/mod.rs:300-345). Owner binding uses metadata, not the flattened name, to resist `ext_a__ext_b` + `ext_b__x` collisions (test at mod.rs:1481-1600). `recover_mangled_tool_name` repairs model-mangled names such as `developer.shell` (mod.rs:443-480).
- Catalogue: bundled-extension JSON validated by `validate_bundled_extensions` (G/agents/validate_extensions.rs:1-60). Platform extensions are a static map `PLATFORM_EXTENSIONS` (G/agents/platform_extensions/mod.rs). `goose-mcp` crate ships autovisualiser, computercontroller, memory, peekaboo and tutorial (goose-mcp/src).
- Versioning / provenance / signatures: none for tools. Registry is a static JSON. Org control is a URL allowlist (`GOOSE_ALLOWLIST`, documentation/docs/guides/allowlist.md:11-36) that matches the install command string; the Rust source does not reference it (only UI test fixtures reference `GOOSE_ALLOWLIST_WARNING`), so enforcement is UNVERIFIED in the Rust core and likely UI/CLI-side.

## 2. Permission / policy model
Modes (goose-provider-types/src/goose_mode.rs:22-32): `Auto` (default), `Approve`, `SmartApprove`, `Chat`.
Per-call answers (goose-provider-types/src/permission.rs:5-11): `AlwaysAllow, AllowOnce, Cancel, DenyOnce, AlwaysDeny`.
Persistent per-tool level (G/config/permission.rs:18-25): `AlwaysAllow | AskBefore | NeverAllow`, stored in `permission.yaml` under two namespaces: `user` and `smart_approve` (permission.rs:43-44).

Decision cascade, `PermissionInspector::inspect` (G/permission/permission_inspector.rs:159-196):
```
Chat      -> skip (no tools)
Auto      -> Allow
Approve|SmartApprove:
  1 user permission (AlwaysAllow/NeverAllow/AskBefore)
  2 SmartApprove && tool annotated read_only_hint=true -> Allow
  3 tool == manage_extensions -> RequireApproval("Extension management requires approval for security")
  4 SmartApprove && no cache (or legacy cached allow) -> defer to LLM read-only judge
  5 else RequireApproval
```
- Patterns/scopes: none. Keys are exact public tool names (`ext__tool`). No argument patterns, path scopes or per-project rules. `remove_extension` wipes entries by `ext__` prefix (permission.rs:280-305).
- Precedence inside the file: `never_allow` beats `always_allow` beats `ask_before` (permission.rs:134-157; test at 379-421).
- SmartApprove LLM judge (G/permission/permission_judge.rs:40-102): a synthetic tool `platform__tool_by_tool_permission` returns `read_only_request_ids`. Requests are labelled "UNTRUSTED TOOL REQUEST DATA", the prompt says to ignore embedded instructions and that "if you cannot make the decision, then it is not read-only". Only negative results are cached by tool name (`cache_non_readonly_decision`, permission_inspector.rs:22-34). Positive results are never cached, because the same tool name can be read or write by argument; "legacy cached allow" is re-judged (test permission_inspector.rs:324,362).
- Approval routing: `needs_approval` becomes an `ActionRequired` assistant message marked `user_only()` carrying tool name, arguments and the optional security message (G/agents/state_machine/ops_tool_approval.rs:107-127). Approval state is event-sourced from the conversation: `ApprovalState::from_messages` scans ToolRequest, ToolConfirmation and ToolConfirmationResponse messages (ops_tool_approval.rs:158-203). Executability is patched onto request meta key `goose.executable` (ops_tool_approval.rs:23,283-289). A second confirmation coordinator serialises concurrent answers and rejects double-answers (G/agents/tool_confirmation_coordinator.rs:20-39,79-92).
- "Remember" semantics: only `AlwaysAllow`/`AlwaysDeny` persist, by tool name (ops_tool_approval.rs:61-70). `AllowOnce` is not remembered. There is a hash-of-arguments store with expiry (G/permission/permission_store.rs:11-127, `ToolPermissionStore`) but it is only re-exported (permission/mod.rs:10) and nothing else references it. **Dead code (verified by grep).**
- Timeouts for human approval: none found (grep "approval.*timeout" over crates/goose/src returned nothing). The turn lock is held while waiting. Elicitation has a timeout path (mcp_client.rs:437).
- Enforcement point: agent-level before dispatch; `ToolApprovalOperation` runs the inspectors (ops_tool_approval.rs:78-101), then `dispatch_tool_call` runs the PreToolUse hooks and `lease.call` (G/agents/state_machine/ops_toolcalling.rs:397-470). No OS or network enforcement. A model call is only executable if the tool was in the advertised list for that inference (`request_was_advertised`, ops_toolcalling.rs:729-755).
- Inspector chain, registered order (G/agents/agent.rs:348-375): `SecurityInspector`, `EgressInspector`, `AdversaryInspector`, `PermissionInspector`, `RepetitionInspector`. Merge rule (G/tool_inspection.rs:170-261): permission result is the baseline; any other inspector can only tighten it (Deny > RequireApproval; an inspector's Allow never loosens). A failing inspector is logged and skipped (tool_inspection.rs:107-114), so inspectors fail open. Missing permission result defaults to needs-approval (permission_inspector.rs:110-113).
- `RepetitionInspector::new(None)` (agent.rs:373): max_repetitions None means the check is effectively disabled by default (tool_monitor.rs:56-62).
- Hooks: plugin `hooks.json` with `PreToolUse` that can deny (exit code 2 or `{"decision":"block"}`), `PreToolUseResult` (observe), `PostToolUse` and others (G/hooks/mod.rs:55-67, 695-705). Denial returns an error to the model before the call (ops_toolcalling.rs:111-157). `on_failure` can be set to block (hooks/mod.rs:389-396).

## 3. Tool exposure to the LLM
- Per-request tool list: extension tools filtered by `available_tools` (empty = all, extension.rs:363-380), prefixed, owner-tagged and schema-normalised (`normalize_input_schema`, extension_manager/mod.rs:300-345; G/agents/tool_schema_normalize.rs, 1068 lines). Cached per `(scope_id, tools_version)` and invalidated by `tools/list_changed` (mod.rs:272-298,2276). Then `is_tool_visible_to_model` drops app-only MCP-Apps tools (G/agents/reply_parts.rs:236-239,548-565) and tools are sorted by name for prompt-cache stability (reply_parts.rs:241-242).
- Per-model differences: `model_config.toolshim` moves tools out of the native tool list into the system prompt as JSON instructions (reply_parts.rs:246-257). Docs: tool-shim.md.
- "Tool inspector" is NOT an LLM that rewrites tool exposure. The LLM-based components are (a) the SmartApprove read-only judge and (b) the optional `AdversaryInspector` (below). A third helper writes UI titles for tool calls (G/tool_call_labels.rs).
- Description budgets: none. Docs say "fewer than 25 tools" (documentation/docs/guides/managing-tools/tool-permissions.md). Code Mode (platform extension `code_execution`, G/agents/platform_extensions/code_execution.rs) replaces all tool schemas with 3 meta-tools (`list_functions`, `get_function_details`, `execute_typescript`) run in a pctx Deno sandbox. **Nested calls go through `lease.call` directly (code_execution.rs:392); that file never invokes the inspection manager (grep for permission/inspect found none), so per-tool permissions do not apply to calls made inside a script. The outer `execute_*` tool is annotated destructive/open-world (test at code_execution.rs:1204-1211) so it is gated as one unit.** UNVERIFIED: whether the outer tool's approval message shows the script.

## 4. MCP integration
- Transports: stdio (optionally via `docker exec` into a session container, G/agents/extension_manager/stdio.rs:23-51), streamable HTTP (+ unix socket), builtin in-process, platform in-process.
- Namespacing: `ext__tool` (above). Collisions between extensions are rejected at selection time ("a selection with colliding keys is refused", mod.rs:1816).
- Per-server allow: `available_tools` only (allowlist). There is no per-server deny list; deny is the per-tool `never_allow`.
- Timeouts: `timeout` per extension, default 300 s (G/config/extensions.rs:10, mod.rs:122-127); enforced via `await_response` (G/agents/mcp_client.rs:616-634).
- OAuth: rmcp OAuth with PKCE and callback validation (G/oauth/mod.rs:88-112). Credentials stored through the Config secret store, key `oauth_creds_<name>` (G/oauth/persist.rs:11-30).
- Result caps: single text content over `GOOSE_MAX_TOOL_RESPONSE_SIZE` (default 200 000 chars) is written to a temp file and replaced by a pointer message (G/agents/large_response_handler.rs:1-48). Shell output truncated the same way (developer/shell.rs:165-203,435-446).
- Sanitisation: `sanitize_unicode_tags` is applied on the ACP path and the prompt manager (acp/server.rs:696, agents/prompt_manager.rs:14). Env var denylist for extension configs (31 keys: PATH, LD_PRELOAD, NODE_OPTIONS, ...) (extension.rs:91-155). Elicitation and roots are supported; sampling is explicitly not advertised (mcp_client.rs:1281-1285).

## 5. Network / web / egress
- There is no web-search or web-fetch tool in the core (grep found no `web_fetch`/`web_search` in platform extensions or goose-mcp). Network happens through the shell tool and MCP servers.
- `EgressInspector` (G/security/egress_inspector.rs): regex-extracts destinations from shell/web tool args (URLs, git remotes, s3/gs buckets, scp/rsync, ssh, docker push, npm/cargo publish), classifies direction, and **only logs**: every result is `Allow` with confidence 0.0 (egress_inspector.rs:~371). It is an observability feature, not a control.
- Prompt-injection defences: `SecurityInspector` (G/security/security_inspector.rs, scanner.rs, patterns.rs) uses regex threat patterns plus an optional remote ML classifier (`SECURITY_PROMPT_CLASSIFIER_ENDPOINT`, `SECURITY_ML_MODEL_MAPPING`). Threshold default 0.8 (scanner.rs:126-129). Confidence fusion (scanner.rs:273-287). A finding above threshold becomes `RequireApproval(message)` (security_inspector.rs:35). **Disabled by default**: `SECURITY_PROMPT_ENABLED` `unwrap_or(false)` (G/security/mod.rs:54-70, documented default false in environment-variables.md:313).
- `AdversaryInspector` (G/security/adversary_inspector.rs): opt-in by creating `~/.config/goose/adversary.md` (lines 36-50). Calls the session LLM with the original task, the last 4 user messages and the tool call; reply must start with ALLOW or BLOCK. Defaults to reviewing only `shell` (line 13) and **fails open** on provider/LLM failure (lines 50, 258-261).
- Extension supply chain: before launching `npx`/`uvx` stdio extensions Goose queries OSV for `MAL-*` advisories and blocks on a hit; unknown ecosystems, HTTP errors and parse errors **fail open** (G/agents/extension_malware_check.rs:44-60,397-476; called at extension_manager/stdio.rs:21).

## 6. Audit / telemetry per tool call
- Each call gets an `execute_tool` tracing span with OTel GenAI fields `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.conversation.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `error.type`, `session.id` (ops_toolcalling.rs:76-88). Content capture is gated by `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` (G/agents/gen_ai_telemetry.rs:10-13).
- Security events: structured `tracing::info!` with `security.event_type, security.action (BLOCK/ALERT/ALLOW), security.confidence, security.finding_id, inspector.name, inspector.reason` (tool_inspection.rs:202-211). Counters like `goose.prompt_injection_user_decisions` (ops_tool_approval.rs:132-138).
- Storage: sessions in the session store (conversation holds the approval messages, so approvals are replayable). Logs to files; OTLP optional (G/otel). Tamper resistance: none (UNVERIFIED for the session DB, but no hashing or signing seen).

## 7. Cost / rate limits / budgets
- `GOOSE_MAX_TURNS` default 1000 (agent.rs:57,578-579); gateway sessions default 5 (environment-variables.md:138). A `<turn-budget>` hint is injected once half the turns are used (G/agents/state_machine/ops_maxturns.rs:20-26).
- No per-tool rate limit, spend budget or concurrency limit found. Context controls: `GOOSE_TOOL_CALL_CUTOFF` (older tool outputs summarised), compaction ops (ops_compaction.rs, ops_tool_pair_compaction.rs). Shell has per-call `timeout_secs` (developer/shell.rs:185,411).

## 8. Sandboxing / isolation
- No OS sandbox for tools. Optional per-session Docker container: stdio extensions run via `docker exec` (stdio.rs:23-51; G/agents/container.rs). The shell tool only detects Flatpak (shell.rs:32). Apps run in a sandboxed webview (platform_extensions/mod.rs:71). Code Mode uses Deno via pctx (see 3). Env-var denylist reduces launch hijacking.

## 9. Extensibility and third-party validation
- Anyone can add stdio/HTTP MCP servers. Controls: URL allowlist of install commands (docs), OSV malware check (fail-open), env denylist, `manage_extensions` always asks in Approve and SmartApprove, but **in Auto mode (the default) tool calls, including manage_extensions, are allowed** (permission_inspector.rs:161 returns Allow before step 3). Plugins add hooks (hooks/mod.rs). No signing, no pinning, no versions.

## 10. Weaknesses and ideas
Weaknesses:
1. Default mode is Auto and the security scanner is off by default; the safe path is opt-in.
2. Permission key is the bare tool name, so one grant covers `shell` for everything (no argument, path or host scoping). The argument-hash store exists but is dead code.
3. Fail-open everywhere on the defence side (inspector error skipped, adversary LLM failure allows, OSV failure allows).
4. EgressInspector is log-only; there is no network control.
5. Code Mode inner calls bypass the inspector chain.
6. No approval timeout or expiry on "Always" grants; no audit chain.
7. `RepetitionInspector` is constructed disabled.

Ideas worth stealing:
- Inspector pipeline with a monotone merge rule (any inspector may only tighten; Deny > Ask > Allow) and per-finding IDs (tool_inspection.rs:170-261).
- Event-sourced approval state living in the conversation (replayable, restart-safe) plus a per-session confirmation coordinator that rejects double answers.
- "Advertised tools" binding: a call is executable only if the tool was in the list sent for that inference (ops_toolcalling.rs:729-755), which defeats hallucinated or stale tool names.
- SmartApprove asymmetry: cache only "not read-only" verdicts, never "read-only" (permission_inspector.rs:22-34), and treat the judge's input as untrusted.
- Stable sorted tool order for prompt-cache hits, and large-result spill to file with a pointer message.

---------------------------------------------------------------------------
# PART 2 - TOOLHIVE (stacklok/toolhive, Go)

ToolHive is not an agent. It is an MCP server runtime, proxy and gateway. Its "tool system" is the policy, isolation and aggregation layer between an MCP client and many MCP servers. There is no human approval step in the proxy; policy is allow/deny only.

## 1. Tool registry / definition model
- Tools are whatever the MCP server advertises; ToolHive wraps them. Registry entries (types in toolhive-core `registry/types`, shown in docs/arch/06-registry-system.md:99-146) carry: `name, description, tier (Official|Partner|Community), status, image, transport, target_port, tools[] (names only), permissions (a permission profile), env_vars (secret flag), args, docker_tags, metadata (stars, pulls), repository_url, tags, provenance{sigstore_url, repository_uri, repository_ref, signer_identity, runner_environment, cert_issuer, attestation}`. Remote servers have `url` and auth. The format migrated to the upstream MCP Registry format with ToolHive extensions under `_meta["io.modelcontextprotocol/registry/publisher-provided"]` (06-registry-system.md:~885-900). Struct source is **UNVERIFIED** (external module).
- Registry providers: local, remote, API, cached, plugins (T/registry/provider_*.go; factory.go). A `PolicyGate` interface lets an embedder veto registry add/remove/update (T/registry/policy_gate.go:34-50). Default is allow-all (policy_gate.go:62-70).
- RunConfig is the portable, versioned workload definition (schema `v0.1.0`; T/runner/config.go; docs/arch/05-runconfig-and-permissions.md:1-20). It holds identity, image or remoteURL, transport, `permissionProfile`, `isolateNetwork`, middleware configs, `toolsFilter`, `toolsOverride`, volumes and secret references.
- Tool risk class: none native. Cedar policies can read MCP tool annotation hints as resource attributes (below).

## 2. Permission / policy model
Three layers.

**(a) Container permission profile** (toolhive-core `permissions`, struct per docs 05:~380; selection code T/runner/config_builder.go:1383-1411):
```go
type Profile struct { Name; Read []MountDeclaration; Write []MountDeclaration;
                      Network *NetworkPermissions; Privileged bool }
```
Network has `Outbound{insecure_allow_all, allow_host[], allow_port[]}`, `Inbound{allow_host}` (limited implementation per docs) and `Mode` (host|bridge|none). Built-ins: `none` and `network`. Resolution order (config_builder.go:1383-1411): explicit object, then `--permission-profile` name or file path, then registry `imageMetadata.Permissions`, then **default `network` (insecure_allow_all)**. So an unlisted server gets full outbound by default. Docs 05:"none Profile - Default profile" contradicts the code and the flag help (run_flags.go:207-212). **Doc/code mismatch.**

**(b) Cedar authorization on MCP traffic** (T/authz/middleware.go, authorizers/cedar/core.go; docs/authz.md):
- Deny-by-default method map `MCPMethodToFeatureOperation` (middleware.go:27-98). Unknown methods are denied (middleware.go:243-253). `elicitation/create`, `sampling/createMessage` and `tasks/*` are denied by design (middleware.go:93-98).
- Actions: `call_tool`, `get_prompt`, `read_resource`, `get_skill`; list operations are filtered per item by the call/get/read policy (docs/authz.md:~175-190; authz/tool_filter.go:17-55; response_filter.go 1719 lines). A protected list without a registered filter is denied before dispatch (middleware.go:305-316).
- Principal = JWT identity. Claims are exposed as `claim_*` attributes and `claimset_*` Sets; group and role claims map to parent entities; `thv_claim_source` states which trust root (request token vs upstream IdP) supplied the claims (cedar/core.go:154-191, 280-320).
- Call arguments are exposed to policy as `arg_<name>` on both resource and context (core.go:1029-1038). Tool annotation hints (`readOnlyHint, destructiveHint, idempotentHint, openWorldHint`) are injected as resource attributes via an `AnnotationCache` filled from `tools/list` responses and consulted on `tools/call` (authz/annotation_cache.go:12-60; core.go:1069-1090).
  - Risk (UNVERIFIED impact): annotations are backend-supplied and therefore only as trustworthy as the backend. The code does reject duplicate or case-aliased hint keys in tools/list so policy sees exactly what the client sees (docs/authz.md:282).
- Decision: `cedar.Authorize` allow/deny only (core.go:591-601). Errors fail closed; denial text is the fixed `"Unauthorized"`, so policy detail is never leaked to the caller (middleware.go:118-140).
- Derived checks (completion/complete, subscriptions) get a 30 s total budget and pass `nil` arguments so caller-chosen keys cannot spoof `arg_*` (middleware.go:340-401).
- "Ask"/approval routing/remember: none in the policy engine. Human-in-the-loop only appears as **vMCP composite-workflow elicitation steps** with `Timeout` (default 5 min) and `OnDecline`/`OnCancel` = skip_remaining|abort|continue (T/vmcp/composer/composer.go:177-201). Elicitation and sampling are unavailable in some Modern-protocol paths (docs/arch/10 §Limitation).

**(c) Tool filter / override** (T/mcp/tool_filter.go): `toolsFilter` is an allowlist (empty = all, tool_filter.go:56-62); `toolsOverride` renames or redescribes (actualToUserOverride/userToActualOverride, lines 36-52). A call to a filtered tool returns the same generic "tool not found" as a nonexistent tool, so it is not an enumeration oracle (tool_filter.go:19-25). In vMCP the filter is **advertising-only**: hidden tools stay routable for composite tools; `defaultToolVisibility: deny` inverts the default (docs/arch/10:229-246).

Validating and mutating **webhooks** are a policy extension point: external HTTP policy decision points, HMAC-SHA256 signed, 10 s default and 30 s max timeout, 1 MB body caps, `failurePolicy` fail|ignore (T/webhook/types.go:19-55; signing.go:14-30).

Enforcement points: HTTP middleware in the proxy, plus a pre-dispatch gate and a "core admission seam" in vMCP that makes list-side and call-side decisions the same function (docs/arch/10:1061-1110), plus container/network enforcement (below). JSON-RPC batches are rejected outright so nested calls cannot skip authz, audit or filter (T/mcp/batch.go:11-25).

## 3. Tool exposure to the LLM
- ToolHive does not build per-request LLM prompts. It controls the `tools/list` result per identity: Cedar filtering, tool filter, overrides, conflict resolution, and (optionally) the optimizer.
- vMCP optimizer: exposes only `find_tool` (semantic search) and `call_tool`, reducing tokens (T/vmcp/optimizer/optimizer.go:1-12). Embedding service via OpenAI-compatible API (key from env var, not config, optimizer.go:~40). Code mode: a virtual `execute_tool_script` Starlark tool; **each inner tool call is re-authorised by its real name** through the same admission seam, with `parallelMax` default 10 and per-call timeout 30 s (T/vmcp/codemode/config.go:1-30; docs/arch/10:1100-1108). A backend tool named `execute_tool_script` fails loud (`ErrReservedToolName`).
- Description budgets: none besides override. Per-model differences: none (not model-aware).

## 4. MCP integration / aggregation (vMCP)
- Pipeline: discovery, parallel query, conflict resolve, merge into a routing table (docs/arch/10:108-127). Discovery runs once per session, 15 s timeout (503/504 on failure, docs/arch/10:~1030).
- Conflict strategies for tools (T/vmcp/aggregator/*_resolver.go): `prefix` (default format `{workload}_`, conflict_resolver.go:~20), `priority` (a collision is won only if every claimant is listed; otherwise all claimants are dropped, no prefix fallback, logged at ERROR), `manual`. Prompts are always prefixed by default; resource URIs are locators, so the first backend in sorted order wins and duplicates are dropped with a warning (capability_conflicts.go:1-60). Design principle stated in code: the advertised name is an authorization identity, so it must be a pure function of (config, backendID, name) and never shift when other backends join. Known gap stated in docs: prefix and manual tool resolution iterate in map order, so a post-prefix collision picks a nondeterministic winner (docs/arch/10:~211-214).
- Backend tool-name translation: the router maps the advertised name back to the backend's original name (docs/arch/10:967-985).
- Per-backend allow/deny: `aggregation.tools[workload].filter/excludeAll`, `excludeAllTools`, `defaultToolVisibility` (docs/arch/10:229-246).
- Auth to upstream (two-boundary model, docs/arch/10:933-966; T/vmcp/auth/converters): token exchange RFC 8693, header injection, OBO, AWS STS, upstream-token injection, unauthenticated; exchanged tokens cached. Incoming: OIDC/JWT, local, anonymous. An embedded auth server can mint ToolHive tokens and accept external subject tokens from `trustedIssuers` (docs/arch/17). Delegation `act` chains are recorded in audit (audit/event.go delegation field).
- Limits: request body cap 8 MiB default, zero never means unlimited (T/bodylimit/middleware.go:29-42); proxy read timeout 30 s default (docs 05:~143). Result-size cap/sanitisation of tool results: **not found** in the proxy (UNVERIFIED; webhooks cap their own 1 MB).

## 5. Network / web / egress
- With `--isolate-network` (default **true**, cmd/thv/app/run_flags.go:302-304) ToolHive builds a per-workload `internal=true` Docker network, a DNS (dnsmasq) sidecar and Squid egress/ingress proxies; the MCP container sits only on the internal network (T/container/docker/client.go:200-260; squid.go:248-277; docs 05:~520-545). Squid ACLs: `dstdomain` from `allow_host`, `port` from `allow_port`, `http_access allow <hostACL> <portACL>` (AND-ed), final `http_access deny all` (squid.go:318-360, 274). `insecure_allow_all` emits `http_access allow all` (squid.go:267-269). Docker gateway/host addresses are denied first unless `--allow-docker-gateway` (squid.go:188-235, 257-264).
- Isolation is dropped with a warning (or error if explicit) for host networking (config_builder.go:1344-1377). Because the default profile is `network` (allow all), the default egress control is "proxy exists but allows everything".
- Enforcement depends on egress being forced through an internal network; the HTTP proxy variables are only the routing path. A workload that ignores them has no route out. This is stronger than env-only proxying. HTTP(S) host filtering is domain-based, with no DNS-rebinding or SNI detail checked (UNVERIFIED).
- Web fetch/search tools: not provided by ToolHive; they are ordinary MCP servers. No prompt-injection scanning of tool results was found (UNVERIFIED across the full tree; grep of pkg/mcp for classification found `classification_response.go` which is about JSON-RPC response classification, not injection).

## 6. Audit / telemetry per tool call
- Audit event (T/audit/event.go:~40-100, built on metal-toolbox/auditevent, NIST 800-53 AU-3 framing): `metadata.auditId (uuid), type, loggedAt (UTC), source{type,value,extra: user-agent, request id}, outcome, subjects{...}, delegation (RFC 8693 act chain, depth-capped 10), component, target{...}, data (optional request/response, capped 1024 B)`, plus `metadata.extra`: duration ms, transport, response size, backend_name, jsonrpc_error_code/message (auditor.go:345-350, 485-490, 690-709). Event types include mcp_tool_call, tools_list, resource_read, prompt_get, workflow_* and step_* (mcp_events.go:16-64). Request/response data off by default; JSON-RPC application errors detected inside 200 responses (config.go).
- Denied calls are audited as outcome `denied` because the gate sits inside the audit middleware (docs/arch/10:1100).
- Storage: stdout or an append-only 0600 file (`LogFile`, config.go GetLogWriter). **No hash chain, signature or WORM**; grep of pkg/audit for hmac/sha256/signature found nothing relevant.
- OTel: spans `{mcp.method.name} {target}` with `gen_ai.tool.name`, `gen_ai.operation.name=execute_tool`, `gen_ai.tool.call.arguments` (sanitised/redacting keys such as password, token, secret, key; telemetry/middleware.go:455-473, 581, 605-606), `mcp.session.id`, `mcp.server.name`, `mcp.client.name`, protocol version; histogram `mcp.server.operation.duration` (middleware.go:117). Legacy attribute names are optionally emitted alongside (run_flags.go:~300).

## 7. Cost / rate limits / budgets
- Redis-backed token buckets (T/ratelimit/limiter.go:81-130): server-shared, per-user, per-tool shared, per-tool per-user. Identity key = JWT subject; per-user limits require auth (limiter.go:52-62). Returns `RetryAfter` (`RateLimitedError`). Infrastructure errors are **fail-open** with an OTel fail-open counter (limiter.go:36-45,65-70). vMCP wraps the same limiter via a decorator (T/vmcp/ratelimit/decorator.go). No token-cost or spend budgets (ToolHive does not see LLM usage; usagemetrics is product telemetry).
- Other bounds: codemode parallel/timeout defaults, authz derived-check budget 30 s, webhook timeouts, discovery 15 s.

## 8. Sandboxing / isolation
- Every server runs in a container (Docker/Podman; Kubernetes via operator). Defaults in code: `CapDrop: ["ALL"]`, `CapAdd: []`, `Privileged: profile.Privileged`, `SecurityOpt: ["label:disable"]` (T/container/docker/client.go:878-885). Read mounts read-only, write mounts read-write, mount declarations are path-traversal validated (docs 05:~430-445; validation lives in toolhive-core, UNVERIFIED). Docs 05 claims `--security-opt no-new-privileges`, but the code shows `label:disable` (SELinux label confinement disabled) and no `no-new-privileges` in this function. **Doc/code mismatch; not verified elsewhere.**
- `.thvignore`-style `ignore.Config` masks files from mounts (client.go getPermissionConfigFromProfile signature, line ~866).
- Secrets are references (`name,target=ENV`); providers: encrypted (AES, KDF), 1Password, environment, keyring (T/secrets/*; docs 05:~190-205). Exports never include values.
- K8s: profile to security context and NetworkPolicy (docs 05:~700-715, via operator; UNVERIFIED in code).

## 9. Extensibility and third-party validation
- Registry tiers and provenance: Sigstore/cosign verification of container images against registry-declared signer identity, source repo and ref (toolhive-core `container/verifier`, called from T/runner/retriever/retriever.go:347-385). **Default is `warn`** (run_flags.go:247; workload_service.go:74): missing provenance, verifier construction failure and verification failure all only warn; only `--image-verification enabled` fails closed (retriever.go:355-383).
- Skills and plugins have OCI artifacts with signature verification, locked trust anchors, key-signed vs keyless handling (T/plugins/pluginsvc/sync.go:486-623; docs/arch/12, 14).
- Arbitrary images and `uvx://`, `npx://`, `go://` protocol schemes auto-build containers (docs 05:~70-95). Operator CRDs (MCPServer, MCPGroup, MCPExternalAuthConfig, rate-limit CRD) give GitOps control (cmd/thv-operator).
- Middleware chain is pluggable (`GetSupportedMiddlewareFactories`, docs 05:~265-285): auth, tokenexchange, upstreamswap, awssts, obo, mcp-parser, tool-filter, tool-call-filter, ratelimit, usagemetrics, telemetry, authorization, audit, recovery, header-forward, validating-webhook, mutating-webhook.

## 10. Weaknesses and ideas
Weaknesses:
1. Secure defaults are weak: default profile `network` (allow-all egress), image verification `warn`, audit off by default, authz opt-in (Cedar configured per workload).
2. Allow/deny only: no ask, no step-up, no time-boxed grants in the proxy.
3. Annotation-based policy trusts backend-declared hints.
4. Audit has no tamper evidence; rate limiter fails open.
5. No result-side scanning (prompt injection, secrets) found in the proxy; response size not capped.
6. Doc/code drift (default profile, security opts). Tool collision order after prefix/manual is nondeterministic.
7. Squid filters at HTTP(S)-domain level; non-HTTP egress relies on the internal network having no route.

Ideas worth stealing:
- One admission function used for list and call, plus a pre-dispatch gate, so "list says yes / call says no" cannot happen (docs/arch/10:1061-1110).
- Filtered or denied tool calls return the same generic error as nonexistent ones, and denial messages are fixed strings (no policy detail leak) (tool_filter.go:19-25; middleware.go:118-140).
- Advertised name is an authorization identity: stable, config-derived names; dropping losers on ambiguity rather than aliasing, so a forbid never gets detached.
- Container-per-tool-server with declarative permission profile (read/write mounts, host and port allowlist), forced through an internal network with an egress proxy; profile shipped inside the registry entry.
- Deny-by-default method map and rejection of JSON-RPC batches so no control can be skipped by shape.
- Webhook policy points with HMAC signatures, bounded timeouts and explicit `failurePolicy`.

---------------------------------------------------------------------------
# COMPARISON

| repo | registry | policy scopes | ask routing | MCP | web/egress | receipts (audit) | budgets | sandbox |
|---|---|---|---|---|---|---|---|---|
| Goose | static bundled JSON + org URL allowlist of install commands; no versions/signatures; OSV malware check (fail-open) | mode (auto/approve/smart/chat) x per-tool-name level (always/ask/never); no arg/path/host scope; hooks can deny | yes: user_only ActionRequired message, event-sourced; AllowOnce/AlwaysAllow/DenyOnce/AlwaysDeny/Cancel; no timeout; remember = tool-name only | stdio/HTTP/builtin/platform; `ext__tool` names; `available_tools` allowlist; OAuth+PKCE; 300 s timeout; 200k-char spill | no web tool; egress inspector logs only; optional regex+ML injection scanner and LLM adversary (both opt-in, fail-open) | OTel gen_ai spans + security events; session log; no tamper evidence | max turns 1000; no rate or cost limits | none by default; optional Docker exec for stdio; Code Mode in Deno (inner calls skip inspectors) |
| ToolHive | registry entries with tier, tools[], permission profile, Sigstore provenance (types in external module); policy gate for registry edits | Cedar per identity: call_tool/get_prompt/read_resource/get_skill, claims, `arg_*`, tool annotation hints; tool filter/override; container profile (mounts, host/port allowlist); webhooks | none in proxy (allow/deny only); vMCP composite elicitation step with 5 min default timeout | proxy for one server; vMCP aggregates N servers with prefix/priority/manual conflict policy, per-backend filter, two-boundary auth (RFC 8693, OBO, STS) | Squid egress allowlist on internal-only network, default profile allow-all; no result scanning found | structured audit event (NIST AU-3 style, delegation chain, backend, duration), stdout/0600 file, no hash chain; OTel spans | Redis token buckets: server, user, tool, tool x user; fail-open; no spend budgets | container per server, cap-drop ALL, RO/RW mounts, internal network; image verify default warn |

# STEAL LIST (ranked for our tool system)
1. Single admission function for list + call + code-mode inner calls, with fixed-string denials and "filtered == nonexistent" (ToolHive core seam; fixes Goose's Code Mode bypass).
2. Monotone inspector pipeline with finding IDs (Goose tool_inspection.rs) feeding a tri-state allow/ask/deny, with explicit fail-closed for the high-risk classes (invert both repos' fail-open defaults).
3. Event-sourced approval records in the conversation/session log, bound to "advertised tools for this inference" and extended with scope (tool + argument pattern + path/host + TTL), reviving the idea in Goose's unused `ToolPermissionStore` (hash of args + expiry).
4. Declarative per-tool-server permission profile (mounts RO/RW, outbound host:port allowlist, privileged=false, cap-drop ALL) shipped in the registry entry and enforced by an internal network + egress proxy; default `none`, not `network`.
5. Receipt per call: ToolHive's audit fields (auditId, subject, delegation chain, target, outcome incl. denied, duration, backend) plus what neither has: hash-chained or signed entries, and policy-decision IDs (Goose finding_id) linking approval to execution.

Secondary: stable config-derived tool namespacing as an authorization identity; token-bucket limits per tool x user; asymmetric SmartApprove caching (cache only "not read-only"); description-budget via a find_tool/call_tool optimizer; webhook policy points with HMAC and explicit failurePolicy; image/registry verification set to fail-closed.

# UNVERIFIED / gaps
- toolhive-core (permissions, registry types, verifier, mount validation) not read; cited from docs only.
- Goose GOOSE_ALLOWLIST enforcement site not found in Rust.
- Goose desktop/CLI approval UI timeouts and the Auto-mode UX not read.
- ToolHive K8s NetworkPolicy generation, result-size limits and any response scanning not exhaustively searched.
- Cedar policy default (no policy = deny) inferred from `cedar.Authorize` semantics and deny-by-default map; not tested.
