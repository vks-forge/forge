# Tool system — catalogue, two gates, one chokepoint, receipts

Status: proposed v2, 2026-10-12 (v1 same day; v2 after source reads of 13 systems)

> **Status (2026-10-15).** The design below is built, with these changes
> from the product shape (d-0085, d-0088, d-0090, d-0117; build plan B7, F1).
> Where the body still says otherwise, this block wins.
>
> | Body says | Now |
> |---|---|
> | Signed catalogue in `.forge/tools/catalog.yaml`, verified from the main checkout's HEAD | The catalogue is a versioned document in the database (`@forge/tools` `CatalogueStore`): every change is a new immutable numbered version with author and reason, compare-and-swap on save, edited in Settings. Nothing is signed; the database lives in the data home, outside every worktree. `.forge/tools/catalog.yaml` in this repo is a readable mirror of the built-in seed, pinned equal by a test. |
> | Grants in `.forge/tools/grants/*.yaml`, floors in `.forge/tools/floors.yaml` | Lane rules and floors are code (`LANE_DEFAULTS`, `FLOOR_RULES`) that no setting lifts. The project grant is `tool_grants` in the project's settings (database, versioned); ticket grants have no source yet. |
> | Project MCP servers declared in `.forge/project.yaml`, signed | Project MCP servers are catalogue entries; no customer repo carries Forge files. |
> | Native tools approved once by the catalogue | Native tool schemas belong to the installed harness build. Each build gets a compatibility check; a new or changed native tool shape is `pending` and `admit()` denies it (`schema_pending`, or `schema_denied`) until the owner approves it in Settings. An unknown build or tool is denied (d-0088). Each run records `catalogue_hash`, the catalogue with the approved native hashes applied. |
> | Floors protect `.forge/**` policy files | Floors protect Forge's data home by absolute path, for every path tool and every word of every shell argv (and `--flag=value` values), plus git options that read outside the worktree, environment reads, credential files and `.git` edits. The hook resolves path-tool arguments on disk, so a junction in the worktree is caught. |
> | Shell allow-list fixed to the JS toolchain | Built per project from its role-tagged checks and ecosystems (d-0095); an interpreter-led or wrapped command gets no allow rule. |
>
> Honest limit (d-0117): the floors are policy over tool arguments, not an OS
> boundary. Code a Worker runs (tests, scripts, a build) runs as the Forge OS
> user and can read the data home and the environment directly. Real isolation
> (separate account or container) is the first item after the realignment.
> Package notes: `packages/tools/README.md`.
Depends on: [`execution-plane.md`](execution-plane.md) §3 (`ToolExposure`), §5 (Factory MCP), §5a (agent YAML `tools`), §6 (permissions); [`verification-plane.md`](verification-plane.md) §2 (receipts); [`memory-system.md`](memory-system.md) §7 (taint); [`self-improvement.md`](self-improvement.md) §2 (tool fields are Tier C).
Evidence: source reads on 2026-10-12 of OpenClaw, Paperclip, OpenCode (v2 Effect core), Pi, Codex (Rust), Goose, ToolHive, Roo-Code, Cline (SDK), OpenHands SDK, Hermes Agent; reports with `file:line` cites in `research/notes/tool-system/`.

## 1. Problem

Not every harness has every tool, not every model can use tools well, and the
same tool has a different name on each harness. Web search is the clear case:
Claude Code has `WebSearch` (empty in this environment), Codex has hosted
search, OpenCode and Pi have none unless an MCP server is added, and the only
search that works on this box is the local SearXNG. If each Worker uses
whatever its harness happens to have, we get four behaviours, no receipts for
the native ones, and egress the gates cannot see.

The thirteen systems read all solve pieces of this. None solves all of it, and
several ship insecure defaults (§15). This design takes the best piece from
each and adds the parts nobody has (§14).

## 2. Verdict

**One versioned catalogue. Two gates (capability, then approval). One chokepoint.
Two receipts per call. Deny wins everywhere.**

- Tools are first-class records with a canonical name, kind, provider,
  **declared risk**, exposure, per-harness support, and a schema hash.
- Anything with network, credentials, or cost is served by a **factory MCP
  server**, identical on every harness, receipted, budgeted, tainted and
  allow-listed in one place. Harness-native network tools are denied.
- A run's effective tool set is an **intersection**, never a union:
  `floors − (project ∩ lane ∩ agent ∩ harness-supported ∩ model-capable)`,
  with deny winning at every layer and each decision carrying its provenance.
- **Policy runs at one admission function** used for list-build, each call,
  nested and code-mode calls, and `tool_search` unwrap, so "list says yes,
  call says no" and "inner call skips the gate" cannot happen.
- Grants are policy. They change only through the ledger (Tier C), never
  through the self-improvement loop, memory, a Worker request, or a hook.

This is the "Auto-Policy, not Auto-Skill" line: a skill says how to use a
tool, the catalogue says whether the tool exists for this run at all.

## 3. Tool kinds

| Kind | Examples | Provider | Receipt source |
|---|---|---|---|
| **harness-native** | read, edit, write, grep, glob, shell | the harness | PreToolUse / PostToolUse hook (Claude), app-server events (Codex), plugin (OpenCode), extension `tool_call` (Pi), ACP permission stream |
| **factory-core** (MCP) | `get_ticket`, `list_comments`, `add_comment`, `ask_director`, `report_blocked`, `finish` | Factory MCP server, per-run token | server-side |
| **factory-capability** (MCP) | `web_search` (SearXNG, pluggable backends), `web_fetch` (allow-listed, proxied, SSRF-guarded), `docs_lookup`, `code_graph` (graft), `memory_search`, `memory_get`, `memory_related` (Workers: read-only, active decisions and rejected approaches of the agent's slice, scope forced by the server; the Director reads through the same index), `db_query_readonly` | Factory MCP server, each tool individually grantable | server-side |
| **project** (MCP) | servers added as catalogue entries (database, versioned) | proxied through the factory MCP mux | server-side |
| **gate-only** | test runner, lint, typecheck, mutation, SAST | dispatcher, outside the Worker | `gate_results` |

Gate-only tools are listed so nobody grants them to a Worker by accident: the
Worker may run `pnpm test`, but the result that counts is the dispatcher's own
run.

## 4. Definition model

Taken from Codex (`ToolExecutor` spec + handler, exposure enum), Pi
(`reachesTools`, exposure overrides), OpenHands (spec/runtime split, declared
resources), Paperclip (schema hash, quarantine).

```yaml
# catalogue entry (stored in the database as a versioned document; yaml shown for readability)
- name: shell
  kind: harness-native
  risk: exec                     # read | write-cwd | exec | network | credential | destructive  (declared, not inferred)
  exposure: direct               # direct | deferred | codemode | hidden
  reaches_tools: []              # for meta-tools (tool_search, codemode) so policy sees reach before the run
  resources: [cwd]               # declared resources for concurrency; undeclared = serialised
  cost_class: free               # free | metered
  taints: false
  schema_hash: sha256:...        # changes → quarantine until reviewed
  support:
    claude-code: { native: Bash, mechanism: allow-flag,     enforced: harness }
    codex:       { native: shell, mechanism: sandbox,       enforced: os }
    opencode:    { native: bash,  mechanism: permission-map, enforced: in-tool }
    pi:          { native: bash,  mechanism: extension,     enforced: hook }
    acp:         { native: "*",   mechanism: request_permission, enforced: attribution-only }
- name: web_search
  kind: factory-capability
  risk: network
  exposure: deferred
  cost_class: metered
  taints: true
  support: { "*": { mechanism: mcp, enforced: server } }
  denies_native: [claude-code:WebSearch, claude-code:WebFetch, codex:web_search]
```

Rules:

- **Risk is declared on the definition** and verified, not inferred from the
  command text at call time (Hermes's weakness) and not self-declared by the
  acting model (OpenHands's weakness). MCP annotations (`readOnlyHint`,
  `destructiveHint`) are treated as *claims*: a new or schema-changed tool
  claiming read-only starts `quarantined` and is probed by the weekly
  capability job before it is visible (Paperclip quarantine + OpenHands
  `is_usable` probes).
- **Versioning**: `schema_hash` and `version` per tool; every receipt pins
  them. Nobody surveyed versions tools; we do.
- **Exposure** (Codex/Pi): `direct` tools are always in the prompt (cap 12 per
  run for cache stability), `deferred` are reachable through `tool_search` +
  `tool_describe` + `tool_call` (two-tool progressive disclosure), `codemode`
  only from inside a sandboxed script, `hidden` never shown. Config can only
  subtract exposure.
- **Declared resources** (OpenHands): parallel tool calls take sorted locks on
  declared resources; a tool with no declaration is serialised.
- **Catalogue is sealed per run**: the set is computed at dispatch, hashed, and
  the hash goes into the run record. Mid-run catalogue changes are not
  allowed (prompt-cache stability, Codex/Hermes).

Content lives in git (d-0008); the DB holds the index, hashes, probe results
and grants.

## 5. Policy engine

Five layers, evaluated in order, each able only to **tighten**. Every layer
emits a decision record with its source (OpenClaw provenance, Goose finding
IDs).

### 5.0 Floors (unbypassable)

Hermes's pattern: a hardline list (`rm -rf /`, credential files, Forge's data
home, `git push`, package publish, destructive DB statements) plus the
operator's deny globs, matched on **normalised and de-obfuscated** input
(Unicode NFC, quote and escape stripping, `$(...)` expansion detection).
Evaluated before lane, before agent YAML, before any hook, before "yolo", and
**inside containers too** (Hermes skips approvals in containers; we do not).
Tested as an invariant: no configuration can make a floor pass.

### 5.1 Capability gate (visibility)

Narrowing-only layered scopes (OpenClaw pipeline, Paperclip profile):

```
visible(run) = catalog
             ∩ grants[project]      (may only narrow the global catalogue)
             ∩ grants[lane]         (§12 defaults)
             ∩ agent.tools.allow − agent.tools.deny
             ∩ support[harness]     (unsupported → dropped; logged on the ticket)
             ∩ caps[model]          (no tool_use → run refused at preflight)
             − deny(any layer)      (deny wins)
```

A tool that is filtered is reported to the model exactly like a tool that does
not exist (ToolHive): same fixed error string, no policy detail leaked.
Enforced twice: at list build and again at execution (Roo's two-gate model),
so a model that hallucinates a tool name from training data hits the same
wall.

### 5.2 Call-time rules

OpenCode's rule triple with Codex's aggregation:

```yaml
# lane rules (excerpt; built in, shown as yaml for readability)
standard:
  - { action: shell, resource: "pnpm test*",   effect: allow }
  - { action: shell, resource: "pnpm add *",   effect: ask,   save: "pnpm add <pkg>" }
  - { action: shell, resource: "git push*",    effect: deny }
  - { action: edit,  resource: "migrations/**", effect: ask }
  - { action: web_fetch, resource: "https://docs.*", effect: allow }
```

- `{action, resource, effect}`; multiple matches resolve deny > ask > allow;
  no match = **ask** (OpenCode default is allow; we invert).
- Shell commands are parsed (tree-sitter bash, OpenCode) into per-command
  resources; **longest-prefix** match per sub-command; **any denied
  sub-command denies the chain**; pipes to interpreters, `eval`, `$(...)`,
  heredocs and redirections to policy paths force `ask` (Roo dangerous
  expansions); `bash -c`, `python -c`, `node -e`, `git` are on a **banned
  "always allow" list** so no remembered approval can ever cover them (Codex).
- `save` pattern is separate from `resource` so a remembered approval is
  narrower than the rule that triggered it (OpenCode).
- A **managed deny-only layer** is applied last (OpenCode managed policy,
  Codex `requirements.toml`): operator rules that can only tighten.
- Rules carry their own `match` / `not_match` test cases and are validated at
  load (Codex `prefix_rule`); a rule file that fails its tests does not load.

### 5.3 Inspectors (monotone pipeline)

Goose's `tool_inspection` shape with OpenHands's ensemble fusion:

| Inspector | Input | Output | Fail mode |
|---|---|---|---|
| Pattern / AST analyzer | executable fields only | risk ≥ declared | closed |
| Injection scanner | all string fields, Unicode-normalised | finding → `ask` | closed on high-risk classes |
| Path normaliser | path args resolved against cwd, symlinks, `..`, junctions | outside cwd → deny unless granted | closed |
| Secret scanner | args and, post-call, results | redact in receipt; block if a credential leaves cwd | closed |
| Guardian reviewer (Standard/Full only, optional) | call + ticket context, **not** the Worker's prose | `{risk, authorization, reason}` structured | closed; 60 s, 2 attempts; 3 consecutive denials → interrupt run |

Each inspector can only raise the decision (allow → ask → deny) and attaches
a `finding_id`. Ensemble = max severity; exception = HIGH; UNKNOWN fails
closed. The guardian runs on a different model family from the Worker, with
its own read-only tool policy, and never invents a risk level on error
(Codex guardian). SmartApprove-style caching caches only "not read-only"
verdicts (Goose asymmetry).

### 5.4 Approval

Decision vocabulary and consent contract (Hermes, OpenClaw, Paperclip, Cline):

- Answers: `once` | `session` | `always(scope, ttl)` | `deny(reason)` |
  `cancelled`. Silence is never consent. A withdrawn prompt is `cancelled`,
  not attributed to the user.
- An approval is **bound to the canonical-argument hash + tool schema hash +
  policy fingerprint** (Paperclip, Codex). Retry with a different hash is a
  new ask. `always` creates a narrow, expiring, revocable rule in the `save`
  pattern's shape, never wider; it lands in the session's grants file with
  provenance and is visible in the Ticket screen.
- **Timeout = tighten.** Express: 10 min then deny. Standard: 4 h then
  Blocked with reason (existing `interactions` timeout). Never auto-allow on
  timeout (OpenClaw `askFallback`). Codex, OpenCode, Goose and OpenHands have
  no timeout at all; we always do.
- **Unattended mode per lane**: Express runs `unattended: deny` (no human in
  the loop, so an ask is a deny with a receipt); Standard/Full route to
  Needs-you. The engine detects at dispatch whether a human can answer and
  fails fast otherwise (OpenClaw unavailable-surface detection, Hermes
  `unattended_mode`).
- The deny reason is relayed to the model as a typed tool error that states
  **what did not happen** ("file NOT modified", Cline); denials are excluded
  from the Worker's mistake counter; a denial circuit breaker (3 consecutive)
  interrupts the run and opens a Needs-you item, editing only tool-result
  text so prompt cache survives (Hermes).
- User "no" is never rewritten into model-trusted text: a decline is a
  typed error, feedback is a separate typed message (OpenCode).

### 5.5 Chokepoint and hooks

- One `admit(call, context)` function is the only path to execution. It is
  called for the list build, for every top-level call, for every nested call
  (`parent_call_id`, Pi), for every call made from inside code-mode scripts
  (Goose's bypass), and after `tool_search` unwraps to the real tool name
  (Hermes). Policy sees the real tool, never the wrapper.
- `before_tool` hooks (Cline) may rewrite input, inject context, skip, or
  stop, and run **before** approval so the human never reviews a doomed call.
  Mutated input is re-validated against the schema (Pi's gap). Hooks are
  trusted by a hash of their normalised config (Codex): unknown or changed
  hooks do not run. A hook that throws or times out **fails closed** (Codex
  and Cline fail open; we invert).
- Tool calls from a **truncated** assistant turn are refused (Pi).
- Tools registered by project MCPs or plugins cannot shadow catalogue names
  (Hermes registry hygiene); the catalogue name is the authorization
  identity (ToolHive).

## 6. Exposure to the model

- ≤ 12 `direct` tools per run; everything else `deferred` behind
  `tool_search` (BM25 over name + description, Pi) / `tool_describe` /
  `tool_call`. Loads are recorded in the transcript so a resumed session sees
  the same set (Pi).
- **Hash-diffed catalogue transitions** (Codex `top_level_tools`): the run
  stores `{tool → hash}`; on resume only added, changed or removed tools are
  re-sent, keeping the prompt-cache prefix stable and making drift
  observable.
- **Names-first fair-share truncation** of deferred-tool summaries under a
  hard byte budget with an explicit "N omitted" line (Codex
  `tools_budget`). Description cap 1 KB, schema cap 5 KB per tool.
- Per-model routing: `model_caps` carries `tool_use`, `parallel_tool_calls`,
  `structured_output`, `min_lane`, and `included/excluded_tools` (Roo, Cline
  routing rules). A model that cannot call tools cannot be a Worker; a cheap
  model may serve Express only.
- `security_risk` and `summary` fields come **first** in tool-result schemas
  so they survive output truncation (OpenHands).

## 7. Rendering per harness and coverage honesty

| Harness | Native tools | Factory / project MCP | Enforcement reality |
|---|---|---|---|
| Claude Code | `--allowedTools` / `--disallowedTools` patterns; `--permission-mode`; `--bare`; PreToolUse hook as chokepoint | `--mcp-config <per-run.json> --strict-mcp-config` | hook + flags; **no OS sandbox on Windows** |
| Codex | permission profile (`:read-only` / `:workspace` / custom), `--ask-for-approval`, exec-policy prefix rules; native search set to `disabled` | app-server `dynamicTools` / `mcp_servers` | OS sandbox; **Windows unelevated = write-only restriction, env-var network block is advisory**; elevated = ACL deny-reads + WFP |
| OpenCode | `opencode.json` permission rules (last-match) + managed deny-only layer | `opencode.json` `mcp` block, per-run file | in-tool checks, lexical paths, **no OS sandbox** |
| Pi | `--tools` + gating extension on `tool_call` (incl. nested) | extension-registered MCP client | hook only; fail-closed on throw |
| ACP | `session/request_permission` answered from the effective set | `session/new { mcpServers }` | attribution-only; adapter-dependent |

Every decision receipt (§10) records `enforced_by: os | harness | hook |
in-tool | server | attribution-only` (OpenClaw coverage honesty). A harness
that cannot enforce a deny for a tool makes that tool **unsupported** there,
not allowed by accident. Lane policy (§12) uses this: Full-lane network and
install tools require `enforced ∈ {os, server}`.

## 8. MCP governance

Hermes's bundle plus Paperclip's quarantine and ToolHive's aggregation:

- Names `mcp__<server>__<tool>`, capped at 64 chars with a hash suffix;
  collisions across servers resolved by catalogue priority, losers dropped
  rather than aliased (ToolHive) so a deny never detaches from its name.
- Per-server `include` / `exclude` globs; per-server `trust: full |
  untrusted`; `untrusted` servers get only read-annotated tools, and every
  write-annotated tool starts quarantined.
- Per-server timeouts (connect 30 s, call 300 s), circuit breaker after 3
  failures, connection identity digest that includes credentials so a changed
  server is a new server.
- Auth by reference (`credentialRef` into DPAPI); OAuth tokens never in the
  Worker environment.
- **Results**: size cap 50 KB inline with head + tail truncation; full output
  spilled to disk under its content hash and addressable by URI (OpenHands,
  Cline); wrapped in a **random-ID untrusted envelope** with delimiter
  defanging (OpenClaw, Hermes); server `instructions` are never injected raw.
- JSON-RPC batches rejected; method map deny-by-default (ToolHive).
- Project MCP servers run as separate processes under the Worker's
  low-privilege context with a declarative permission profile (mounts RO/RW,
  outbound host:port allow-list, default `none`) shipped in the catalogue
  entry (ToolHive); default profile is `none`, not `network`.

## 9. Web and egress

- `web_search`: factory MCP tool over SearXNG with a pluggable backend
  interface (OpenClaw provider plugins: brave, exa, tavily later). Query
  logged; results returned as snippets only; `taints: true`.
- `web_fetch`: allow-listed domains per project, **SSRF guard** (private and
  link-local ranges, DNS rebinding re-check after resolve, redirect
  re-validation, max 5 redirects; OpenCode and Cline have none, Hermes and
  OpenClaw do), 2 MB cap, HTML-to-text, no cookies, no credentials, random-ID
  untrusted envelope. This is the only sanctioned egress for Workers in any
  lane.
- **Credential broker** (Codex network proxy): if a Full-lane ticket needs an
  authenticated API, the Worker sees a dummy token and the factory proxy
  swaps the real secret per host and path. Secrets never enter the tool
  process.
- Taint: any `taints: true` result marks subsequent turns `origin: untrusted`
  for memory (`memory-system.md` §7); G1's claim matcher ignores claims
  sourced from tainted turns.

## 10. Receipts

Two receipts per call (OpenClaw), hash-chained (nobody does this), linked by
IDs:

```
tool_decisions   id, run, seq, tool, version, schema_hash, args_hash, decision (allow|ask|deny),
                 layer (floor|capability|rule|inspector|approval|hook), rule_id, finding_ids[],
                 approver (auto|user|guardian), approval_ref, enforced_by, ts, prev_hash, hash
tool_effects     decision_id, state (not_started|read_completed|failed_no_effect|mutation_committed|uncertain),
                 result_hash, result_ref (spill path), duration_ms, cost_usd, checkpoint_ref, ts, prev_hash, hash
```

- `args` and results are stored as hashes plus redacted summaries, never raw
  (Paperclip); full results live in the spill store by content hash.
- HMAC with the run secret the harness never sees (`verification-plane.md`
  §2); `prev_hash` chains both tables per run. An audit-write failure is
  **fail-closed**: the call does not execute (Paperclip).
- A **checkpoint before every mutating call** (Roo shadow git): the worktree
  manager records a lightweight ref (`refs/factory/<run>/<seq>`) so any
  mutation is revertible and G1 can diff per call, not only per run.
- A `SecurityAnalysisEvent` is emitted for every inspector verdict even when
  no ask happens (OpenHands), so the Ticket screen can show why a call was
  allowed.
- `enforced_by` makes coverage honest: `attribution-only` receipts are shown
  in a different colour and never count as a gate.

## 11. Budgets and concurrency

- Per run: `maxTurns`, `maxUsd` (existing), plus a **rolling request and
  cost window** that forces an ask when exceeded and re-reads live policy at
  approval time (Roo, Cline).
- Per tool: token buckets per `(tool, run)` and `(tool, project)` that **fail
  closed** (ToolHive's fail open inverted); metered tools debit the run's
  `maxUsd` through the same counter as model calls.
- Per result and per turn: size budgets scaled to the model's context (Hermes)
  with spill-to-disk.
- Timeouts per tool class: exec 10 min Express / 60 min Full, MCP call 300 s,
  fetch 30 s.
- Concurrency: resource-declared locks (§4); unsafe or undeclared tools are
  serialised; a read/write lock keyed on `parallel_tool_calls` (Codex) so no
  per-tool queue code is needed.

## 12. Lane defaults

| Tool class | Express | Standard | Full |
|---|---|---|---|
| read / grep / glob / code_graph / docs_lookup | allow | allow | allow |
| edit / write inside cwd | allow | allow | allow |
| edit under `migrations/`, `auth/`, policy paths | deny | ask | ask |
| shell: test, lint, typecheck, git (no push) | allow | allow | allow |
| shell: package install | deny | allow-list (lockfile-known registries) | ask |
| web_search | deny | allow, metered, taints | allow, taints |
| web_fetch (allow-listed, proxied) | deny | allow-list | ask |
| db_query_readonly | deny | per project grant | per project grant |
| project MCPs | deny | per project grant | per project grant |
| ask_director / report_blocked / finish | allow | allow | allow |
| memory_search, memory_get, memory_related | deny | allow | allow |
| harness-native network | deny | deny | deny |
| unattended mode | `deny` | Needs-you, 4 h | Needs-you, 4 h |
| guardian reviewer | off | on for ask-class calls | on for all exec/network |

Director's fixed grant: the memory index, `code_graph`, `web_search`,
`docs_lookup`, read-only repo access. Never `shell` on the product repo.

The three memory tools (`memory_search`, `memory_get`, `memory_related`) are read-only, take no project, status or scope input (the
server builds the scope from the run's agent: its tag slice and whether it sees rejected approaches, d-0078), see only active
decisions and rejected approaches (never proposals, outcomes or superseded records, not even by id), carry author and origin on every
record, cap their answers (2,500 / 4,000 / 1,200 characters) and log every call. Express Workers get none of them: their request
stays byte-identical and they keep the pasted block (d-0168).

## 13. Who may change grants

| Change | Tier | Path |
|---|---|---|
| Add a tool to the catalogue | C | new catalogue version in Settings (author + reason recorded) |
| Project grants a project MCP or widens a lane default | C | project settings `tool_grants`, new settings version |
| Agent spec `tools.allow/deny` (database, versioned) | C | `execution-plane.md` §5a, `self-improvement.md` §2 |
| Edit a floor or the banned-always list | C + typed confirmation | not editable: floors are code (`FLOOR_RULES`) |
| Narrowing anything | A | any reviewed commit |
| `always(scope, ttl)` from an approval | session grant, expires | written by the engine with provenance; visible on Ticket |
| Worker asks for a tool it does not have | never granted at runtime | `ask_director` → Needs-you → user edits grants → new run |

Protected-path shield (Roo): edits to `.forge/**`, `CLAUDE.md`, `AGENTS.md`,
`.claude/**`, `.codex/**`, `opencode.json` always ask, in every lane, under
every auto-approve setting. The self-improvement loop may propose a skill that
*uses* a tool; it may not propose a grant. The janitor may not touch `tools/`.

## 14. What this design has that none of the thirteen has

1. Hash-chained decision + effect receipts with `enforced_by` honesty.
2. Risk declared on the definition and verified by probe, instead of inferred
   from command text or self-declared by the acting model.
3. Floors + capability gate + call-time rules + monotone inspectors +
   bound approvals, all behind one admission function that also covers
   nested and code-mode calls.
4. Approval timeout that always tightens, and unattended mode per lane so no
   gate waits on nobody.
5. Per-tool versioning with schema-hash quarantine, for native and MCP tools.
6. MCP results wrapped in the untrusted envelope (OpenClaw and Hermes wrap web
   results only).
7. Per-tool dollar and request budgets enforced at the tool boundary.
8. Checkpoint before each mutation linked to the decision receipt.
9. Fail-closed as the default for hooks, scanners, rate limiters and audit
   writes.

## 15. Anti-patterns seen in the field (do not repeat)

| Anti-pattern | Where seen |
|---|---|
| Default policy allows everything | OpenCode, Goose `Auto`, OpenHands `NeverConfirm`, ToolHive `network` profile, Cline SDK unlisted tools auto-approve, Paperclip Claude adapter `dangerouslySkipPermissions` |
| Hooks, scanners, rate limiters fail open | Codex hooks, Cline hooks, Goose injection scanner and OSV check, ToolHive rate limiter |
| Approvals never time out | Codex, OpenCode, Goose, OpenHands |
| Annotations trusted as facts | Pi, OpenHands, ToolHive, Codex MCP `auto` |
| Code-mode or custom tools skip the gate | Goose Code Mode, Roo custom tools, Pi nested calls before fix |
| Containers skip approvals | Hermes |
| Lexical path checks, no symlink/junction resolution | OpenCode, Roo `fileRegex` not applied to commands |
| Fetch without SSRF guard | OpenCode, Cline |
| Audit without tamper evidence | all thirteen |
| Approval keyed on tool name only, not args | Goose, Cline, Roo MCP |
| Risk inferred from shell regex | Hermes |
| Model grades its own risk | OpenHands `LLMSecurityAnalyzer` |

## 16. Walking-skeleton slice (M0)

Catalogue with `read`, `edit`, `write`, `grep`, `glob`, `shell`, `get_ticket`,
`add_comment`, `ask_director`, `report_blocked`, `finish`, `web_search`,
`docs_lookup`; floors file; lane grants; capability gate; call-time rules with
a **simple shell tokenizer** (split on `&&`, `;`, `|`, `$(`, backticks),
longest-prefix per segment, `ask` on anything unparsed; tree-sitter bash moves
to M1 pending Windows verification (d-0038); approval with hash binding,
timeout and unattended `deny` for Express; one admission function; Claude Code
renderer; decision + effect receipts (HMAC, chained); checkpoint-before-mutate
via the worktree manager; effective set stored per run and shown on the
Ticket screen. The catalogue and grants are read from the database, never from
files inside the Worker's cwd.

Deferred to M1+: inspectors beyond pattern/AST and path normaliser, guardian
reviewer, `web_fetch` proxy and credential broker, project MCPs and
quarantine probe, `tool_search` deferral, hash-diffed transitions, per-tool
token buckets, Tools screen, other harness renderers (with d-0016 they land
before M0 closes).

## 17. Comparison matrix (as read, 2026-10-12)

| System | Registry | Policy scopes | Ask routing | MCP | Web / egress | Receipts | Budgets | Sandbox |
|---|---|---|---|---|---|---|---|---|
| OpenClaw | in-code catalogue + plugins | profile → provider → global → agent → group → sender, deny-wins, provenance | gateway RPC to channel UI; `askFallback` tighten; 30 min | `server__tool`, globs, OAuth | search + fetch, SSRF guard, random-ID envelope | decision + effect receipts | caps only | Docker/Podman off by default |
| Paperclip | Postgres catalogue, schema hash, quarantine | company → project → routine → agent → issue, low-trust intersect | 409 + retry with approved id, fixed expiry | gateway + endpoint | none first-party | invocation hashes, redacted | rate + budget policies | plugin drivers |
| OpenCode v2 | plugin registry | ordered rules, last-match, managed deny layer | bus event, once/always/reject+feedback, no timeout | `<server>_<tool>`, OAuth | fetch no SSRF | durable event log | steps cap | none |
| Pi | `ToolDefinition` + exposure | none; `tool_call` hook only | extension UI; none in json mode | `mcp__s__t`, 20 KB cap | none | JSONL tree | output caps | opt-in container |
| Codex | `ToolExecutor` + exposure bitset, hash-diffed catalogue | profile → approval mode → Starlark prefix rules → admin requirements | hooks → guardian → user; no user timeout | per-tool approval, deferred | hosted search modes, proxy + credential broker | OTel + JSONL | token budget | Seatbelt / bwrap / Windows restricted token or WFP |
| Goose | bundled JSON | mode × per-tool level; inspectors | ActionRequired, event-sourced, no timeout | `ext__tool`, allowlist, OAuth | none; egress inspector logs | OTel + security events | turns | none; Deno code mode |
| ToolHive | registry entries with permission profile, Sigstore | Cedar authz, tool filter | none (allow/deny) | vMCP aggregation | Squid egress allow-list | NIST-style audit event | Redis buckets, fail open | container per server, cap-drop |
| Roo-Code | tool groups per mode, `fileRegex` | mode → groups; longest-prefix commands; rolling request/cost ask | approve/deny/ask/timeout | per-server allow, `mcp--s--t` | none | checkpoint per mutation | request/cost window | `.rooignore` |
| Cline SDK | `AgentTool` presets | `{enabled, autoApprove}` + `beforeTool` hooks | serial callback, diff preview | `server__tool`, oversized cache | fetch no SSRF | `autoApproved` flag | output caps | none |
| OpenHands SDK | spec/factory registry, declared resources | `ConfirmRisky{threshold, confirm_unknown}`, analyzers ensemble | WAITING state, run() again | same abstraction, bare names | — | per-event JSON | iterations, budget after step | Docker (no cap-drop) |
| Hermes | self-registering toolsets | floors → yolo → allowlist → unattended → patterns → guardian → human | gateway buttons, 300 s fail-closed | trust tiers, circuit breaker, spill | pluggable search, SSRF guard, envelope | SQLite + JSONL | iteration budget, size budgets | docker / ssh / modal; skips approvals inside |

## 18. Sources

- Source reports with `file:line` cites: `research/notes/tool-system/tools-{openclaw-paperclip,opencode-pi,codex,goose-toolhive,roo-cline,openhands-sdk,openhands-hermes}.md`
- Commits read: OpenClaw `9ef7808`, Paperclip `762d680` (no `server/` in clone), OpenCode `5683367`, Pi `7bd01fb`, Codex `f605162`, Goose and ToolHive (see report), Roo `b867ec9`, Cline `03ffa9e`, OpenHands SDK `e3a2682`, Hermes (see report)
- Claude Code CLI flags — https://code.claude.com/docs/en/cli-reference
- Codex config and app-server — https://developers.openai.com/codex/config, /codex/app-server
- OpenCode permissions and MCP — https://opencode.ai/docs/permissions/, /mcp-servers/
- Pi — https://github.com/earendil-works/pi
- ACP — https://agentclientprotocol.com/protocol/overview
- Auto-Policy, not Auto-Skill — https://arxiv.org/abs/2608.25091
- Skill-Use (boundary = forbidden tool calls) — https://arxiv.org/abs/2608.04828
- Local SearXNG — `D:\VIKASH\free-web-search\`, `http://localhost:8888`

Unverified: Codex Linux sandbox internals and MXC backend; ToolHive core types
(external module, cited from docs); Paperclip runtime (docs only); Goose
allowlist enforcement site; Cedar default-deny inferred; Windows behaviour of
tree-sitter bash binding.
