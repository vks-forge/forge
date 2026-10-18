---
title: 'Survey: remote sandbox providers and multi-provider abstractions'
id: remote-sandbox-providers-survey
tags:
- agent-sandboxes-forge
- sandbox
- isolation
- software-factory
created: '2026-10-16T12:00:00Z'
updated: '2026-10-16T12:00:00Z'
status: review
type: interim
tier: institutional
content_type: analysis
deprecated: false
summary: 'Profiles 17 remote providers (E2B, Daytona, Modal, Vercel, Cloudflare, Fly/Sprites, Runloop, Morph, CodeSandbox, Blaxel, Beam, Koyeb, SSH VM, Codespaces, Coder) and quotes ComputeSDK, rivet sandbox-agent, vibekit and OpenHands workspace interfaces; derives an LCD (create/destroy/exec-stream/tar put-get/list) plus declared optional capabilities and git-bundle in/out transport.'
---

# C - Remote sandbox providers, existing abstractions, and a proposed SandboxProvider shape

Scope: research only. Sources cited inline. "UNVERIFIED" = not confirmed from a fetched page or cloned source in this run (WebFetch summaries were lossy for several docs). Clones live in the scratchpad `src/` dir (computesdk_computesdk, rivet-dev_sandbox-agent, superagent-ai_vibekit, vercel_sandbox, cloudflare_sandbox-sdk, oh_sdk).

## 1. Provider survey

TS SDK package names for E2B, Daytona, Modal, Vercel, Runloop, Northflank, Beam, Blaxel, CodeSandbox come from the `dependencies` in ComputeSDK provider package.json files (`computesdk_computesdk/packages/<name>/package.json`, github.com/computesdk/computesdk). Others from `npm view`.

| Provider | TS SDK | Isolation | Persistence / pause | PTY / stdin | Pricing shape | Notes (source) |
|---|---|---|---|---|---|---|
| E2B | `e2b` ^2.26 | "isolated Linux VM"; tech not stated on page (docs.e2b.dev/sandbox) | `timeoutMs` at create, auto-pause on expiry, paused state kept indefinitely, `setTimeout`, `kill()`; Pro 24h, Hobby 1h continuous (docs.e2b.dev/sandbox) | `sandbox.pty.create({cols,rows,onData})`, `sendInput`, `resize`, `connect(pid)` reattach (docs.e2b.dev/docs/sandbox/pty) | per-second sandbox usage (UNVERIFIED) | Template `claude` has Claude Code preinstalled; `claude --dangerously-skip-permissions -p ... --output-format stream-json` via `commands.run` with `onStdout`; git clone with `x-access-token:$GITHUB_TOKEN`; `--resume <session_id>`; outbound network rules available (docs.e2b.dev/agents/claude-code) |
| Daytona | `@daytonaio/sdk` (`@daytona/sdk` in current docs) | Linux containers by default, own kernel/fs/net claimed; VM sandboxes optional; start under 90 ms; default 1 vCPU/1 GiB/3 GiB, org max 4/8/10; regions us, eu (daytona.io/docs/en/sandboxes/) | start/stop/pause/archive/fork/delete, snapshots, WarmPool module (daytona.io/docs/en/typescript-sdk/) | `Pty`/`PtyHandle` modules; Claude Code guide opens a PTY and sends the command into it (daytona.io/docs/en/claude-code-run-tasks-stream-logs-sandbox/) | usage based (UNVERIFIED) | Modules: process, fs, Git, Snapshot, Volume, Secret, LspServer, ComputerUse |
| Modal | `modal` 0.11.0 (`ModalClient`) | gVisor default; optional VM runtime with own kernel (Docker, FUSE); GPU only on gVisor runtime (modal.com/docs/guide/sandboxes) | max lifetime 5 min default, up to 24h; `idle_timeout`; filesystem snapshots for >24h runs (same) | `sb.exec()` returns process with stdin writer, stdout/stderr readers, per-exec timeout, output retained 10 min (modal.com/docs/guide/sandbox-spawn); PTY option UNVERIFIED | per-second CPU/mem/GPU (UNVERIFIED) | Agent SDK cookbook ships a Modal hosting example (code.claude.com/docs/en/agent-sdk/hosting) |
| Vercel Sandbox | `@vercel/sandbox` ^3 | Firecracker microVM; ms start; 19 regions (vercel.com/docs/vercel-sandbox, /docs/sandbox/pricing) | persistent by default: auto-snapshot on stop, auto-resume on next SDK call; `snapshot()`, `fork()`, `stop()`, `extendTimeout()`; snapshot TTL 30d default (vercel.com/docs/sandbox/concepts/persistent-sandboxes) | `runCommand` (detached option), `openInteractive()` returns PTY websocket url+token (vercel_sandbox/packages/vercel-sandbox/src/sandbox.ts:1233) | Active-CPU $0.128/h, mem $0.0212/GB-h, $0.60/1M creations, snapshots $0.08/GB-mo; Pro max session 24h, Hobby 45 min, 10k concurrent (Pro) (vercel.com/docs/sandbox/pricing) | `sandbox.update({networkPolicy:'deny-all', ports, resources, tags})`; max 15 open ports; 8 vCPU/16 GB Pro; auth via OIDC token or access token; async stdout streaming from `runCommand` |
| Cloudflare Sandbox SDK | `@cloudflare/sandbox` | microVM container instance with own kernel/network (developers.cloudflare.com/sandbox/) | Durable Object lifetime, directory backups to R2, sessions, S3 mounts (developers.cloudflare.com/sandbox/api/) | terminal over WebSocket (xterm addon), command streaming | Workers Paid plan + Containers pricing | Has official coding-agent templates for Claude Code, Codex, OpenCode and Pi (cloudflare_sandbox-sdk/examples/coding-agents/README.md); runner clones with `git clone --depth 1`, runs agent, returns `git add --intent-to-add . && git diff` (examples/coding-agents/runner/sandbox.ts:92-101,151-157) |
| Fly Machines | none official; REST + OpenAPI (docs.fly.io/machines/api) | Firecracker VMs (UNVERIFIED on fetched page) | create/start/stop/suspend/delete/wait endpoints; suspend snapshots memory, resume not guaranteed (docs.fly.io/machines/api/machines-resource) | exec endpoint exists in the API but was not in fetched page (UNVERIFIED) | per-second while running | start of an existing Machine "well under a second" (docs.fly.io/machines/overview) |
| Sprites (Fly) | `@fly/sprites` 0.2.3; REST `api.sprites.dev/v1`, bearer auth | "dedicated, hardware-isolated microVM" (docs.fly.io/sprites) | disk persists, 100 GB, auto-sleep (warm/cold), ~1 s CoW checkpoints and restore (fly.io/sprites) | `sprite exec`, API exec, `sprite console` (PTY not confirmed) | CPU $0.0385/CPU-h, RAM $0.021875/GB-h, no compute charge while idle (fly.io/sprites) | per-Sprite HTTPS URL, wakes on request; "connectors" keep provider credentials out of the Sprite (fly.io/sprites); Fly published a Claude Managed Agents integration (docs.sprites.dev/integrations/claude-managed-agents/) |
| Northflank | `@northflank/js-client` 0.11 | Kata/gVisor-class microVM isolation (UNVERIFIED; docs 404) | persistent volumes via config (vibekit `SandboxConfig.persistentVolume`) | UNVERIFIED | per-second plan based | BYO-cloud option (UNVERIFIED) |
| Runloop | `@runloop/api-client` ^1.30 (`RunloopSDK`) | VM "devbox"; first command in a few seconds (docs.runloop.ai/docs/devboxes/overview) | snapshots, suspend/resume (same) | async exec/stream not confirmed | UNVERIFIED | ComputeSDK maps snapshot_id to devbox creation |
| Morph Cloud | `morphcloud` 0.0.20 (npm) | VM instances ("Infinibranch") | snapshots as core primitive; instance branching (cloud.morph.so/docs) | UNVERIFIED | UNVERIFIED | docs landing page only |
| CodeSandbox SDK | `@codesandbox/sdk` ^2.4 | microVM; snapshot restore < 1 s, clone < 2 s; any Dockerfile (github.com/codesandbox/codesandbox-sdk README) | hibernate/resume via `sdk.sandboxes.resume(id)` | `sandbox.connect()` then `client.commands.run` ; terminals UNVERIFIED | per-VM-credit plans (UNVERIFIED) | git/GitHub source control built in |
| Blaxel | `@blaxel/core` ^0.3 | each sandbox an individual microVM, rootfs in memory; resume from standby ~25 ms (blaxel.ai) | auto-pause on inactivity; persistent filesystems + volumes | UNVERIFIED | usage based, $200 free credit | Claude Managed Agents tutorial (docs.blaxel.ai/Tutorials/Claude-Managed-Agents) |
| Beam | `@beamcloud/beam-js` ^1.0 | UNVERIFIED (docs do not state it) | default 600 s lifetime, `keep_warm_seconds=-1`, `update_ttl()`, snapshots | `process.exec()` handle with stdin/streaming | GPU capable | `expose_port()` returns PUBLIC preview URL (docs.beam.cloud/v2/sandbox/overview) |
| Koyeb | `@koyeb/sandbox-sdk` 1.1 (+ `@koyeb/api-client-js`) | "strong isolation" (tech unstated) | ephemeral; background processes; fs upload/download (github.com/koyeb/koyeb-sandbox-sdk-js) | exec returns stdout; PTY UNVERIFIED | plans Starter/Pro/Scale | token auth `KOYEB_API_TOKEN` |
| Hetzner / plain SSH VM | any SSH client (e.g. `ssh2`) | full VM, you own isolation | whole-VM; create/destroy via Hetzner API; no snapshot semantic needed | native PTY via SSH `-t`; stdin streaming | flat hourly VM | most flexible, slowest cold start (tens of seconds), you build lifecycle |
| GitHub Codespaces | REST only | VM-backed dev container | create/start/stop/delete; delete returns 202 | NO command-exec endpoint in REST API (docs.github.com/en/rest/codespaces/codespaces); needs `gh codespace ssh` | per-core-hour + storage | poor fit as headless runner |
| Coder | CLI/SSH (`coder ssh`) ; REST/SDK not confirmed | Terraform-provisioned, depends on template | template decided | SSH with PTY; remote command via `-- cmd` (coder.com/docs/user-guides/workspace-access) | self-host, you pay infra | best for self-hosted fleets |

Long tail: ComputeSDK alone lists 60+ provider packages (`computesdk_computesdk/packages/`, README lines ~89-110), incl. Runloop, Sprites, Northflank, Mosaic (Firecracker), Novita, Tensorlake, Freestyle, Namespace, Superserve, Upstash, GKE Agent Sandbox. Providers are a commodity; the interface matters more than any pick.

### Running Claude Code (and other harness CLIs) inside them
- Dominant pattern is NOT interactive PTY. It is one-shot headless: `claude -p "<task>" --output-format stream-json --verbose --dangerously-skip-permissions` with stdout streamed line by line, then `--resume <session_id>` for follow-ups (E2B docs.e2b.dev/agents/claude-code; Cloudflare runner example `examples/coding-agents/claude-code/src/index.ts`; Daytona via PTY just to carry the same command, daytona.io/docs/en/claude-code-run-tasks-stream-logs-sandbox/).
- Cloudflare's example sets `ANTHROPIC_BASE_URL` to a gateway, `ANTHROPIC_API_KEY=provided-by-worker` (a dummy), `IS_SANDBOX=1` (required to use skip-permissions as root), and an outbound handler that strips the key and injects the real token (`examples/coding-agents/claude-code/src/index.ts`; `runner/outbound.ts:9-33`).
- Agent SDK hosting guidance: subprocess model, 1 GiB RAM / 5 GiB disk / 1 CPU per agent starting point, outbound HTTPS to api.anthropic.com, transcripts live in `~/.claude/projects` and are lost on container loss unless a SessionStore is used (code.claude.com/docs/en/agent-sdk/hosting). Container cost ~$0.05/h vs token cost dominating (same).
- Anthropic's own isolation menu: sandbox-runtime, Docker hardened, gVisor, Firecracker; recommends a credential-injecting proxy outside the boundary (`ANTHROPIC_BASE_URL`, HTTPS_PROXY, TLS-terminating proxy for other HTTPS) (code.claude.com/docs/en/agent-sdk/secure-deployment).
- Managed Agents "self-hosted sandboxes" is a work-queue model: your worker polls Anthropic, runs tool calls locally; platform guides exist for Cloudflare, Daytona, E2B, Fly, Modal, Vercel, Blaxel, Namespace, Superserve, AWS Lambda MicroVMs, GKE (platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes). Different architecture from Forge (Forge owns the loop), but proves every major provider can host a Claude worker.

## 2. Existing multi-provider abstractions (interface quotes)

1. ComputeSDK (github.com/computesdk/computesdk). Most complete.
   - `packages/provider/src/types/provider.ts:129` `Provider<TInstance,TTemplate,TSnapshot>`: `readonly name: string; readonly instances: ProviderInstanceManager; readonly template?: ProviderTemplateManager; readonly snapshot?: ProviderSnapshotManager;` (optional managers = capability declaration by presence).
   - `provider.ts:88` `ProviderInstanceManager`: `create(options?)`, `getById(id)`, `list()`, `destroy(id)`.
   - `provider.ts:117` `ProviderSnapshotManager`: `create(instanceId, opts?)`, `list()`, `delete(id)`.
   - `packages/computesdk/src/types/universal-instance.ts:372` `Instance`: `instanceId`, `runCommand(command, RunCommandOptions)`(395, with `cwd, env, timeout, background, onStdout, onStderr`), `startProcess(command, StartProcessOptions): ProcessHandle`(403; handle has `write`, `closeStdin`, `status`, `wait`, `kill`, lines 104-114), `getInfo()`, `getUrl({port, protocol})`(409), `destroy()`, `filesystem: InstanceFileSystem`(415: `readFile, writeFile, readdir, mkdir, exists, remove`, lines 142-148), optional `egress`.
   - `CreateInstanceOptions` (line 302): `ephemeral, timeout, templateId, snapshotId, runtime, image, egress` plus a free-form `[key: string]: any` escape hatch. Egress model: `InstanceEgressOptions {injectorUrl, credentialedHosts, mode:'passthrough'|'allowlist'}` (lines 251-270).
   - Weakness: filesystem is string-only (no binary/stream/bulk upload), no PTY, no resource-state/pause, no capability flags.
2. rivet-dev sandbox-agent (github.com/rivet-dev/sandbox-agent). `sdks/typescript/src/providers/types.ts:1-70` `SandboxProvider`: `name`, `create(): Promise<string>`, `destroy(id)`, optional `reconnect`, `pause`, `kill`, `getUrl`, `getFetch`, `getInspectorUrl`, `ensureServer`, `defaultCwd`. Implementations: e2b, daytona, modal, vercel, cloudflare, docker, sprites, local, computesdk, agentcomputer (`providers/*.ts`). Design point: provider only provisions a box and exposes a URL to a daemon (sandbox-agent server) running inside, which speaks one ACP/HTTP protocol to harnesses (Claude, Codex, OpenCode, Pi...). So the provider surface is tiny: create, destroy, reach.
3. vibekit (github.com/superagent-ai/vibekit). `packages/sdk/src/types.ts:316` `SandboxProvider { create(envs?, agentType?, workingDirectory?): Promise<SandboxInstance>; resume(sandboxId) }`; `SandboxInstance { sandboxId; commands.run(cmd,{timeoutMs,background,onStdout,onStderr}); kill(); pause(); getHost(port) }` (lines ~285-323). Providers: e2b, daytona, modal, northflank, cloudflare, dagger, beam, blaxel. Minimal LCD; note `pause()` required there.
4. OpenHands software-agent-sdk (github.com/OpenHands/software-agent-sdk). `openhands-sdk/openhands/sdk/workspace/base.py:28` `BaseWorkspace`: `execute_command(command, cwd, timeout=30.0)`(172), `file_upload(src,dst)`(195), `file_download(src,dst)`(215), `git_changes(path)`(235), `git_diff(path)`(249), `pause()`(262) and `resume()`(273) raising NotImplementedError by default. Implementations in `openhands-workspace/openhands/workspace/{docker,remote_api,apptainer,agent_sandbox,cloud}`. Notable: git status/diff are first-class workspace operations; pause/resume are optional by default-throw. (The classic `openhands/runtime/*` classes are no longer in the OpenHands/OpenHands main branch, which is now frontend-only.)
5. Cloudflare coding-agents runner (`cloudflare_sandbox-sdk/examples/coding-agents/runner/sandbox.ts`) is not an abstraction but is the reference flow Forge needs: clone, run one task, read diff, with credential-injecting outbound interception (`sandbox.ts:204-205` `interceptAllOutboundHttp`, `interceptOutboundHttps("*")`).
6. Not cloned/verified: Mastra workspace sandboxes, LangChain/agno sandbox tools, open-codex/codebuff, AI SDK. Skipped for budget; the four above already cover the design space.

## 3. Synthesis

### Lowest-common-denominator (every credible provider, incl. plain SSH)
create(image/template, env, resources, timeout) ; destroy ; exec(argv|shell, cwd, env, timeout) returning exit code + streamed stdout/stderr chunks ; write file / read file (binary-safe; bulk upload of a tar is the portable form) ; status/get-by-id ; list (for GC of leaked boxes). Everything else must be expressed as a tar through exec/stdin if a provider lacks it.

### Optional capabilities (declare, never infer; matches code.md rule 3)
| Capability | Who has it | Forge use |
|---|---|---|
| `stdinStream` (write to running process, close stdin) | E2B, Vercel (partial), Modal, Beam, SSH, ComputeSDK ProcessHandle | steering/interactive harness turns |
| `pty` | E2B, Daytona, Vercel `openInteractive`, Cloudflare terminal, SSH | only needed for TUI harnesses; headless `-p stream-json` mode does not need it |
| `detachedProcess` + reattach | E2B `pty.connect`, Vercel `detached`, Modal, Koyeb | survive control-plane restart, resume tailing |
| `pause/resume` (memory-state) | E2B, Blaxel, Fly suspend, CodeSandbox, Modal (fs only), Runloop | long human-in-loop waits |
| `snapshot/fork` (fs) | Vercel, Daytona, Modal, Sprites, CodeSandbox, Runloop, Morph, Cloudflare backups | prebuilt repo+deps base, rework from last state |
| `autoPersist` (stop keeps disk) | Vercel (default), Sprites, Blaxel | cheap rework cycles |
| `portPreview` | most; Beam previews are PUBLIC, so auth must be flagged | dev-server previews |
| `egressPolicy` (allowlist/deny-all) | Vercel `networkPolicy`, Cloudflare outbound handlers, E2B rules, Modal (UNVERIFIED), ComputeSDK `egress` | enforce "Workers have no push creds, only reach model gateway + remote" |
| `egressInject` (credential-injecting proxy) | Cloudflare `interceptOutboundHttps`, Sprites connectors, Vercel credential brokering (per Vercel KB title) | token never enters box |
| `gpu` | Modal, Daytona (Earth region), Beam | rare for coding agents |
| `maxLifetime` (hard cap, reported) | E2B 1h/24h, Vercel 45m/24h, Modal 24h, Beam 600 s default | scheduler must know to checkpoint |
| `regions[]`, `resourceTiers` | all | placement |

### Proposed provider interface (prose, no code)
Split into three layers so a weak provider can still participate:
1. `SandboxProvider` (factory, config-selected, one folder per impl under `packages/drivers`-sibling adapters, e.g. `packages/sandboxes/<name>/`): `name`, `capabilities(): CapabilitySet` (typed object of the table above with limits, e.g. `{pty:true, maxLifetimeSec:86400, egressPolicy:'allowlist'|'deny-all'|'none', snapshot:'fs'|'memory'|'none'}`), `create(spec) -> SandboxHandle`, `attach(id) -> SandboxHandle|null`, `list(tagFilter)`, `destroy(id)`. `spec` = image/template ref, cpu/mem/disk, env (non-secret), egress policy, timeout, labels (forgeRunId, ticketId for GC), region.
2. `SandboxHandle` (core required set): `id`, `exec(argv, {cwd, env, timeoutMs, stdin?}) -> ExecHandle`, `putArchive(destPath, tarStream)`, `getArchive(srcPath) -> tarStream`, `readFile/writeFile` (bytes), `stop()`, `extendTimeout()`, `status()`. `ExecHandle`: async iterable of `{stream:'stdout'|'stderr', chunk}`, `wait() -> {exitCode, signal}`, `kill(signal)`, optional `writeStdin/closeStdin`. Output is plain bytes; Forge's driver (not the provider) parses harness JSON (rule 3).
3. Optional capability objects present only if declared: `pty`, `snapshots {create, restore, delete}`, `pause {pause, resume}`, `ports {expose(port) -> {url, authRequired}}`, `egress {set(policy), injectCredentials(hostRules)}`.
Keep the surface close to rivet's "provision + reach" idea where possible: a bootstrapped in-box Forge agent daemon (like sandbox-agent) is an alternative implementation of `exec/putArchive` that works on any provider with just create+URL; use it as the fallback adapter for providers lacking good exec streaming. Add a shared contract test (`describeSandboxContract`) that runs LCD tests for every adapter and capability tests gated by `capabilities()`.
Errors: map to ForgeError families (quota, timeout, provider-unavailable, not-found, capability-unsupported), never provider messages (rule 7).

### How repo state travels in
Constraint: Workers never hold push credentials.
- Preferred: Forge (control plane) creates a git bundle or tar of the worktree and pushes it with `putArchive`. A bundle of `base..HEAD` plus the base commit is private-repo safe, needs no network from the box, works on every provider with a file API or stdin, and matches deny-all egress. Cost: size for big repos; mitigate with a prebuilt per-repo snapshot/image containing the repo at a recent commit, then bundle only the delta.
- Alternative: clone inside the box from the git host using a short-lived, read-only, repo-scoped token (GitHub App installation token with `contents:read`). Cloudflare and E2B examples do this (`runner/sandbox.ts:92-101`; E2B `x-access-token:$GITHUB_TOKEN`). Risk: the token lives in env/.git/config and is exfiltratable by prompt injection. Better: do the clone through an egress-injecting proxy so the token is added outside the box (Cloudflare `outbound.ts:27-31` does exactly this for github.com) and the box sees none. Only use when the provider declares `egressInject`.
- Avoid: rsync/scp of a live worktree (needs SSH reachability, ships `.env`, ignores git object model, Anthropic's guidance lists `.env`, `.npmrc`, `*.pem` as leak risks, code.claude.com/docs/en/agent-sdk/secure-deployment). If used for the plain-SSH backend, filter with `git ls-files` plus tar.
- Always set `git config user.name/email` inside the box and remove any host credential helpers; mount no `~/.ssh` or `~/.config`.

### How results come back
- Primary: inside the box the Worker commits to a local branch; Forge runs `git bundle create out.bundle <base>..HEAD` (or `git format-patch --stdout`) via `exec`, then `getArchive`. Forge fetches the bundle into the host worktree repo (`git fetch out.bundle`), verifies it (see below), and only Forge's merge door (`merge()`, rule 6) pushes to the remote. Bundle preserves commits, authorship and binary files; patch is simpler but loses binaries unless `--binary` and loses commit structure.
- Fallback when only a diff is wanted: `git add --intent-to-add . && git diff --binary` as Cloudflare's runner does (`runner/sandbox.ts:151-157`), OpenHands `git_diff` is the same idea (`base.py:249`).
- Not recommended: giving the box a push token to a scratch branch. It breaks the "no push credentials" rule and expands blast radius.
- Verify on receipt: reject refs outside the expected branch, size cap, scan for changes to `.git/hooks`, `.github/workflows`, submodule URLs and lockfile oddities before the gates run; apply in a fresh worktree on the host so hook payloads never execute in the user's tree.
- Also pull out the harness artifacts: stream-json transcript, `~/.claude/projects` session file (needed for `--resume` and lost on box destruction, per Agent SDK hosting doc), test reports.

### Lifecycle guidance for Forge
- Treat the box as disposable, state of record is the bundle plus transcript in Forge's DB; use provider pause/snapshot only as an optimization.
- Tag every box with the Forge run id and sweep orphans (limits: Vercel auto-removes dead sandboxes after 14 days; E2B/Beam hard lifetimes mean the scheduler must reconcile).
- Plan for max lifetime (Hobby tiers 45-60 min) by declaring `maxLifetimeSec` and checkpointing before expiry.
- Default egress: deny-all except model endpoint (via injecting proxy) and, if cloning in-box, the git host read path only.

## 4. Gaps / caveats
- Pricing for E2B, Daytona, Modal, Runloop, Morph, Northflank, Fly exec details not captured; WebFetch returned partial pages. Re-verify before committing to a default provider.
- Fly `exec` endpoint, Modal PTY flag, Northflank isolation, Morph exec/branch API were not confirmed from primary pages.
- Mastra, LangChain, agno, open-codex/codebuff not examined.
- Suggested first adapters by value: (1) plain Docker/SSH LCD (other agent), (2) E2B (mature PTY/pause/streaming, `claude` template), (3) Vercel Sandbox (snapshots, openInteractive, networkPolicy), (4) Cloudflare (best credential-injection pattern, official four-harness examples), then Daytona/Modal. ComputeSDK could be a catch-all adapter for the long tail but its string-only fs and untyped escape hatch argue against making it the core interface.
