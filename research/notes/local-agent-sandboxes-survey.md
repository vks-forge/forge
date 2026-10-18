---
title: 'Survey: local and self-hosted sandboxes for coding-agent Workers'
id: local-agent-sandboxes-survey
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
summary: 'Compares srt, Codex sandbox, Docker sbx, microsandbox, devcontainers, container-use, OpenHands, Sculptor, rivet sandbox-agent, vibekit across Windows/macOS/Linux; only srt (Windows alpha) and Codex sandbox isolate natively on all three without a VM; documents six fixes for the git worktree .git-pointer problem and sentinel-proxy credential injection.'
---

# B. Local / self-hosted sandboxes for coding-agent Workers (survey for Forge)

Researched 2026-10-16. Sources: shallow clones under `.../scratchpad/src/` (read only, nothing executed), `gh api`, vendor docs. "Verified in code" = read in clone; "docs" = vendor page. Anything I could not confirm is marked UNVERIFIED.

## 1. Per-project profiles

| Project | What / license | Isolation tech | Host OS | Repo into sandbox | Creds in | Network | Agent driven via | Lifecycle |
|---|---|---|---|---|---|---|---|---|
| **Docker Sandboxes (`sbx`)** closed CLI, releases repo `docker/sbx-releases` (license NOASSERTION); docs https://docs.docker.com/ai/sandboxes/ | Standalone product, free local tier; works with Claude Code, Codex, Gemini, OpenCode (README https://github.com/docker/sbx-releases) | microVM, own Linux kernel, own private Docker daemon per sandbox (https://docs.docker.com/ai/sandboxes/architecture/, /security/isolation/) | macOS (brew), Windows (winget/MSI), Linux (apt, needs `kvm` group) per README. Hypervisor per OS: UNVERIFIED (pages don't name it) | 3 modes: direct mount at SAME absolute path (virtiofs); `--clone` (host repo RO at `/run/sandbox/source`, agent edits private clone, `git fetch sandbox-<name>`); mountless (architecture page) | Host-side credential proxy: agent sees sentinel, proxy swaps real secret after request leaves VM; `sbx secret set`, OAuth token stays on host | All outbound TCP via host proxy; presets Open / Balanced / Locked Down; `sbx policy allow network <host>` | `sbx run <agent>` (attached TTY); `sbx ls/stop/rm`, `sbx secret` | stop keeps VM, `rm` destroys; cloud variant has SDK/API |
| **anthropics/sandbox-runtime (srt)** Apache-2.0, https://github.com/anthropics/sandbox-runtime | Wrap ANY process (whole `claude`, MCP server) with FS+net policy; beta | macOS Seatbelt `sandbox-exec`; Linux bubblewrap + seccomp + socat/unix-socket proxies; **Windows (alpha): dedicated `srt-sandbox` local user + WFP egress filter + per-session ACEs** (README L107-109, L740-811; `src/sandbox/windows-sandbox-utils.ts` header) | macOS, Linux, WSL2, Windows alpha (one-time elevated `windows-install`) | No copy: policy over host paths (`allowWrite` the worktree). README L950: worktree `.git` is a file, blocked from modification on Linux; denies `.git/hooks`, `.git/config` | Credential masking/sentinel + MITM TLS-terminate proxy (`credential-*.ts`, `mitm-ca.ts`) | HTTP + SOCKS proxies, domain allow/deny, deny-by-default; on Windows WFP blocks everything except loopback proxy ports | `wrapWithSandbox()` returns string; `wrapWithSandboxArgv()` returns `{argv, env}` (ISandboxManager, `sandbox-manager.ts:2993-3040`); you spawn it | per-process; `reset()` removes ACEs |
| **Claude Code `/sandbox`** (docs https://code.claude.com/docs/en/sandboxing) | Built into Claude Code, sandboxes only shell tools | same srt primitives | macOS, Linux, WSL2; **native Windows = unsandboxed** | in-place on host | n/a | proxy domain allowlist | in-process | per command |
| **OpenAI Codex sandbox** Apache-2.0, https://github.com/openai/codex (`codex-rs/`) | Per-command sandbox inside the agent | Linux: bubblewrap + seccomp + landlock (`linux-sandbox/src/{bwrap,seccomp}.rs`, `sandboxing/src/landlock.rs`); macOS Seatbelt `.sbpl` profiles (`sandboxing/src/seatbelt*.sbpl`); **Windows: 3 modes MXC / elevated (dedicated low-priv users + firewall rule + ACLs) / unelevated (restricted token, ACLs only)** (https://learn.chatgpt.com/docs/windows/windows-sandbox; `sandboxing/src/windows.rs` L29-31 `windows_sandbox_uses_elevated_backend`; crate `windows-sandbox-rs`) | all three natively; Windows MXC needs Win11 24H2/25H2 builds, elevated needs admin setup, unelevated lacks deny-read and has weak network | in-place; writable roots policy | provider auth stays with host Codex | elevated: firewall rule for offline user; unelevated: env-level only | in-process helper binary; ConPTY on Windows | per command |
| **dagger/container-use** Apache-2.0, https://github.com/dagger/container-use | MCP server; each agent gets a Dagger container env + git branch | Docker/OCI containers via Dagger engine (not hardened) | needs Docker; Windows via Docker Desktop (not stated in README, UNVERIFIED) | **Copy in, export out**: container gets `WithDirectory(".", baseSourceDir)` (`environment/environment.go:235`); host side uses a separate "fork repo" + `git worktree add` (`repository/git.go:183,244`); on export it writes `.git` as `gitdir: <forkRepo>/worktrees/<id>` into the exported dir (`repository/git.go:377-385`) and re-creates submodule `.git` files (`:339-352`) | `Secrets` -> `WithSecretVariable(k, dag.Secret(v))` (`environment.go:154-173`); secret URIs resolved on host | per-env config | MCP tools (`container-use stdio`, `docs/agent-integrations.mdx`) - agent's own shell is NOT in the box, only tool calls | env per branch; `cu merge/checkout` |
| **microsandbox** Apache-2.0, https://github.com/superradcompany/microsandbox | Embeddable local microVM runtime (libkrun-style), OCI images, SDKs (Rust/TS/Python/Go/Ruby), MCP server; beta | microVM; **macOS Apple Silicon, Linux KVM, Windows WHP** (README L109-111) | all three natively | Mount kinds `bind`/`named`/`tmpfs`/`disk` (`crates/cli/lib/sandbox_config.rs:232-244`); agent daemon `crates/agentd` in guest | `secrets:[{env, value, allowed_host}]` - "never enter the VM" (README L313-320) | `allowed_hosts`, `allowed_ports` | `sandbox.exec(cmd,args)` SDK; `msb` CLI | create, detached run, snapshot, **fork live sandbox**, restore, metrics (README L119-152) |
| **devcontainers/cli** MIT, https://github.com/devcontainers/cli | Reference impl of devcontainer.json | Docker | any with Docker | bind `workspaceMount`; worktree flag `--mount-git-worktree-common-dir` (`src/spec-node/devContainersSpecCLI.ts:142`: "requires the worktree to be created with relative paths (`git worktree add --relative-paths`)"); ignored when custom `workspaceMount` set (issue https://github.com/devcontainers/cli/issues/1243, open); worktree support issue #796 open | `containerEnv`, secrets via env | Anthropic ref uses `init-firewall.sh` + `NET_ADMIN/NET_RAW` (https://github.com/anthropics/claude-code/blob/main/.devcontainer/devcontainer.json) | `devcontainer exec` | up/exec/rebuild |
| **OpenHands** MIT, https://github.com/OpenHands/OpenHands (now "Agent Canvas"; runs OpenHands, Claude Code, Codex, Gemini, Pi, OpenCode via ACP) | Control center + agent-server | Docker container per conversation (`OH_CONVERSATION_RUNTIME=docker`), or no sandbox | Windows native NOT supported for per-conversation containers (needs WSL2; POSIX uid/gid) - `README.windows.md` L38 | each container mounts the conversation's workspace + persisted state (README Option 3) | env/settings | container net | HTTP agent-server in container | persists across restarts |
| **OpenHands legacy Runtime** (tag 0.59.0) | the classic adapter example | docker / kubernetes / local / remote / cli impls (`openhands/runtime/impl/{docker,kubernetes,local,remote,cli,action_execution}`) | | `sandbox.volumes` string `host:ctr:mode` incl. overlay mode (`docker_runtime.py:261-294`) | | | HTTP "action execution server" | |
| **Sculptor (Imbue)** MIT, https://github.com/imbue-ai/sculptor | Parallel Claude Code/Pi agents UI | local process; container backend experimental (docs/help/experimental/container_backend.md) | macOS/Linux focus | `WorkspaceInitializationStrategy = IN_PLACE | CLONE | WORKTREE` (`sculptor/database/workspace_enums.py:8-19`); WORKTREE = `git -C user_repo worktree add -b` sharing user `.git` (`worktree_strategy.py:34-60`) | | | PTY (`pty_helper.py`, `spawned_pty_process.py`) | |
| **vibekit** MIT, https://github.com/superagent-ai/vibekit | SDK running claude/codex/opencode/gemini in provider sandboxes | providers: e2b, daytona, modal, beam, blaxel, northflank, cloudflare, dagger (local) | local = Dagger/Docker | provider-specific clone | envs passed to `create()` | provider | `commands.run()` | pause/resume/kill |
| **rivet sandbox-agent** Apache-2.0, https://github.com/rivet-dev/agents (`sandbox-agent/`) | Rust daemon run INSIDE any sandbox; HTTP+SSE universal API for Claude Code, Codex, OpenCode, Cursor, Amp, Pi | none itself; providers: docker, local, e2b, daytona, modal, vercel, cloudflare, sprites, computesdk | via Docker/any | `docker.ts` has `binds?: string[]` (`providers/docker.ts:14`) | | | HTTP/SSE not SSH ("SSH breaks TTY handling and streaming", README) | create/destroy/reconnect/pause/kill |
| **textcortex/claude-code-sandbox** (archived) | Docker + Claude `--dangerously-skip-permissions` | Docker | any w/ Docker | **copies repo into container**, new branch per session; auto credential discovery (Keychain, `gh auth`, env) incl. mounts (README L27-30, L280-295) | forwarded | | web terminal | |
| **E2B infra (self-host)** Apache-2.0, https://github.com/e2b-dev/infra | Full control plane | Firecracker microVMs, nftables egress + SNI allow/deny | **Linux + KVM only** ("Embed" = single machine); Terraform GCP/AWS/Azure | template snapshot + file API | | | envd in VM | pause/resume from snapshot |
| **Coder** AGPL-3.0, **Daytona** (repo archived 2026-07), **Lima** Apache-2.0, **Colima** MIT, **Apple `container`** Apache-2.0 (macOS 26 + Apple silicon only), **gVisor/Firecracker/Kata** Apache-2.0 | infra layers | VM/containers | Lima: macOS/Linux (Windows = use WSL2); Apple container: macOS 26 only; Firecracker/Kata: Linux KVM | - | - | - | - | - |
| Worktree-orchestrator UIs: **Crystal/Nimbalyst** (MIT), **Claude Squad** (AGPL-3.0), **Superset**, **vibe-kanban** (Apache-2.0), **emdash** (Apache-2.0), **mux** (AGPL) | Run agents in host git worktrees; no real sandbox isolation (I did not read their code; UNVERIFIED beyond repo descriptions) | none | | host worktree | | | | |

Pi (earendil-works/pi) ships no sandbox of its own; its doc lists Plain Docker (`-v "$PWD:/workspace"`), Docker Sandboxes, OpenShell, Gondolin (host Pi, tools routed to a local micro-VM) (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md). It warns not to mount `~/.pi/agent`.

## 2. Cross-platform matrix (what works for Forge's Worker host)

| Isolation primitive | Windows host | macOS host | Linux host | Needs VM? |
|---|---|---|---|---|
| srt (Seatbelt / bwrap / Windows user+WFP+ACL) | alpha, native, one-time admin install, x64+arm64 | native, no deps | native, needs bwrap+socat | no |
| Codex-style per-process sandbox | native (3 modes; MXC needs Win11 24H2+; elevated needs admin) | Seatbelt | bwrap/landlock | no |
| Docker Desktop containers | yes (WSL2/Hyper-V VM underneath) | yes (VM underneath) | native | VM on Win/macOS |
| Docker Sandboxes `sbx` microVM | winget/MSI | brew | apt + KVM | microVM everywhere |
| microsandbox microVM | WHP | Apple Silicon | KVM | microVM everywhere (Intel Mac unsupported) |
| Apple `container` | no | macOS 26 + Apple silicon | no | VM per container |
| Lima / Colima | no native (use WSL2) | yes | yes | VM |
| WSL2 distro | yes | - | - | VM (Codex doc recommends WSL when native sandbox insufficient) |
| Firecracker / Kata / gVisor / E2B-self-host | no (WSL2 nested KVM possible, UNVERIFIED) | no | KVM required (gVisor: no KVM needed) | microVM / user-space kernel |
| Claude Code `/sandbox` | NOT supported native | yes | yes | no |

Takeaway: no single primitive spans all three hosts without a VM except (a) srt (Windows is alpha) and (b) the Docker-family/microsandbox which hide a VM. Realistic tiering: Tier 0 policy-only (today), Tier 1 srt per Worker process (no VM, cheapest, Windows alpha), Tier 2 container or microVM (`sbx`/microsandbox/Docker) with worktree mounted, Tier 3 remote provider.

## 3. Worktree into sandbox: the `.git` pointer problem

A linked worktree's `.git` is a file `gitdir: <main>/.git/worktrees/<id>`; the admin dir also has `commondir` -> main `.git`. Mount only the worktree and git fails (`fatal: not a git repository`). Patterns observed:

1. **Give up git inside; commit on host.** Docker Sandboxes: host worktree mounts "only the worktree directory", sandbox "can't resolve the `.git` pointer file and has no Git access"; agent can't commit/branch/status (https://docs.docker.com/ai/sandboxes/workflows/git/). Simplest, but breaks agents that run `git diff/commit`.
2. **Clone mode, fetch back.** Docker `--clone`: host repo RO at `/run/sandbox/source`, private clone inside, host fetches `sandbox-<name>` remote; "not a Git worktree linked to your host checkout" (same page). textcortex: copy + branch per session. Cleanest isolation (the agent cannot corrupt host `.git`) but costs a clone and a fetch/merge step.
3. **Mount the common dir too, with relative paths.** devcontainers CLI `--mount-git-worktree-common-dir` + `git worktree add --relative-paths` (git >= 2.48), so `gitdir:` resolves relative to the mount layout (`devContainersSpecCLI.ts:142`). Caveat: broken with custom `workspaceMount` (issue #1243), and VS Code open issues (microsoft/vscode-remote-release #11478, #11588). Needs both worktree and main `.git` mounted preserving relative layout, giving the agent write access to the shared object store and refs of ALL branches.
4. **Same absolute path inside.** Docker direct mode passes the host dir "at the same absolute path" (architecture page) so an absolute `gitdir:` pointer still resolves if the main repo is ALSO mounted at its host path. (Windows drive paths `C:\...` do not exist in a Linux guest, which is why relative paths or rewrite are needed.)
5. **Rewrite the pointer on the way in/out.** container-use keeps a private "fork repo" and rebuilds `.git` as `gitdir: <forkRepo>/worktrees/<id>` on export (`repository/git.go:377-385`), i.e. the container never sees the real pointer; sync is copy-in / patch-out.
6. **Per-agent worktree with shared `.git` on host, process sandbox (no mount issue).** Sculptor WORKTREE mode, srt, Codex: sandbox is a policy over host paths, so the pointer just works. srt/Codex additionally mark `.git` file read-only and `.git/hooks`, `.git/config` denied (srt README L950, `linux-sandbox-utils.ts:259,412`).

Recommendation for Forge: adapter capability `gitMode: 'host-paths' | 'relative-worktree+commondir' | 'clone-and-fetch' | 'no-git'`. For local VM/container backends prefer pattern 3 (create worktrees with `--relative-paths`, mount worktree RW and `.git` common dir; consider mounting `objects`/`refs` RW but `hooks` and `config` RO) or pattern 2 for untrusted work; for remote providers pattern 2/5 (push a branch/bundle in, fetch a branch out).

## 4. Credential injection patterns

1. **Sentinel + host-side swap proxy** (strongest): Docker `sbx` (credential proxy), microsandbox (`secrets[].allowed_host`), srt (credential masks + MITM TLS terminate). Real key never in the guest. Needs CA trust in the guest (srt Windows doc: CA must be in the sandbox user's `CurrentUser\Root`).
2. **Env var into container** (`containerEnv`, `-e ANTHROPIC_API_KEY`): devcontainers, Pi plain Docker, container-use env/secret config. Simple; guest can exfiltrate. Anthropic's doc warns `--dangerously-skip-permissions` containers do not prevent exfiltration of `~/.claude` credentials and says to avoid mounting `~/.ssh` / cloud cred files, prefer repo-scoped short-lived tokens (https://code.claude.com/docs/en/devcontainer).
3. **Named volume for agent home** with `CLAUDE_CONFIG_DIR` set (devcontainer: `source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume`; `.claude.json` lives outside `~/.claude` so set the env). Pi: volume `pi-agent-home:/root/.pi/agent`. Per-Worker volume rather than host dir.
4. **Long-lived token**: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` / `ANTHROPIC_API_KEY` as env (devcontainer doc).
5. **Auto-discovery and copy** (textcortex): Keychain, `gh auth` - convenient, widest blast radius.
6. **Git creds**: `sbx secret set github --command 'gh auth token'` (dynamic command), Anthropic cloud: separate proxy holds GitHub token and issues scoped creds.

## 5. Driving the agent process

- Attached PTY: `sbx run`, Sculptor (`pty_helper.py`), Claude Squad (tmux; not read).
- Exec API (non-interactive): microsandbox `sandbox.exec`, vibekit `commands.run(cmd,{background,onStdout,onStderr})`, OpenHands `Runtime.run(action)`.
- In-sandbox daemon exposing HTTP/SSE: rivet sandbox-agent (explicit: SSH breaks TTY/streaming), OpenHands agent-server, E2B envd, microsandbox agentd.
- Wrapper returning argv+env for local spawn: srt `wrapWithSandboxArgv()` - the easiest to fit Forge's existing WorkerDriver (spawn child with wrapped argv; stdio unchanged).
- MCP tools only (container-use): agent's own bash stays on host, so not a real boundary for the harness itself.

## 6. Internal abstractions worth quoting

- **srt** `ISandboxManager` (`src/sandbox/sandbox-manager.ts:2993`): `initialize(runtimeConfig)`, `isSupportedPlatform()`, `checkDependencies()`, `wrapWithSandboxArgv(command, binShell?, customConfig?, abortSignal?, cwd?, options?) -> Promise<{argv:string[]; env:NodeJS.ProcessEnv}>`, per-command network allow list `registerCommandNetworkAllow`-style API keyed by unguessable `commandId` (>=128-bit), `reset()`.
- **rivet sandbox-agent SDK** `SandboxProvider` (`sandbox-agent/sdks/typescript/src/providers/types.ts:1-60`): `name`; `create(): Promise<string>`; `destroy(id)`; optional `reconnect(id)`, `pause(id)`, `kill(id)`, `getUrl(id)` or `getFetch(id)`, `getInspectorUrl`, `ensureServer(id)`, default cwd. Second variant `packages/sandbox-adapter/src/index.ts:58-75`: `name`, `cwd?`, `create(ctx)`, `connect(ctx,id) -> Sandbox|undefined` (undefined = gone), `suspend?`, `destroy?`.
- **vibekit** (e.g. `packages/beam/src/index.ts:22-44`): `SandboxInstance{sandboxId; commands.run(cmd,{timeoutMs,background,onStdout,onStderr}); kill(); pause(); getHost(port)}`, `SandboxProvider{create(envs, agentType, workingDirectory); resume(sandboxId)}`. Copy-pasted per provider package (no shared core).
- **Sculptor** `Environment(BaseModel, abc.ABC)` (`sculptor/interfaces/environments/base.py:39-352`): `get_workspace_path`, `get_working_directory`, `get_initialization_strategy() -> IN_PLACE|CLONE|WORKTREE`, `to_host_path/to_environment_path`, `run_process_in_background`, `run_process_to_completion`, `run_setup_subprocess`, `is_alive`, `exists/read_file/write_file/delete_file_or_directory`, `supports_terminal`, `start_terminal_manager`, `close`, `destroy(is_killing)`. Note path translation + file ops + terminal as first-class.
- **OpenHands legacy `Runtime`** (`openhands/runtime/base.py` @0.59.0): `class Runtime(FileEditRuntimeMixin)` L90; abstract `connect()` L993, `run(CmdRunAction)` L1043, `read/write/edit`, `copy_to(host_src, sandbox_dest, recursive)` L1079, `list_files`, `copy_from(path)` L1091. Selected by config to docker/k8s/local/remote/cli. Shows the "exec + file I/O + copy in/out" minimal surface.
- **Codex**: `WindowsSandboxLevel` + `SandboxType` selected per platform, `WindowsSandboxFilesystemOverrides{read_roots_override, write_roots_override, additional_deny_read_paths, additional_deny_write_paths}` (`sandboxing/src/windows.rs:13-26`) - a resolved policy compiled per backend.

## 7. Patterns worth copying for Forge

1. **Two-layer interface**: `SandboxBackend` (provision/connect/pause/resume/destroy/snapshot, declared `capabilities()`) separate from `Exec` (spawn with stdio/PTY, file ops, path translation). Mirror Sculptor's `to_host_path/to_environment_path` and rivet's optional `pause/reconnect/ensureServer` (absent -> fall back to destroy).
2. **Declarative resolved policy** compiled by each backend (Codex overrides struct, srt allow/deny lists): `{readRoots, writeRoots, denyRead, denyWrite, network:{allowDomains,denyDomains}, secrets:[{env, valueRef, allowedHost}]}`. Forge's existing policy layer feeds this; backends that cannot enforce a field must declare so (fail closed).
3. **Sentinel credential + host proxy** for any microVM/container tier; env injection only as a labeled lower tier.
4. **argv-wrapping process sandbox (srt) as the zero-VM tier** - fits Windows hosts with admin install; keep a `windows-install` preflight check in the UI. Codex's Windows backend shows same design (dedicated low-priv users + firewall + ACL), validating the approach.
5. **Worktree creation with `--relative-paths`** (git >= 2.48) + common-dir mount; make worktree gitMode a backend capability; protect `.git/hooks`, `.git/config`, `.mcp.json`, `.claude/commands|agents` as read-only (srt default denies).
6. **Run an in-sandbox agent daemon speaking HTTP/SSE** for remote providers (rivet sandbox-agent, microsandbox agentd) instead of SSH; `local` provider is the same daemon as subprocess ("Embedded Mode").
7. **Per-Worker named volume for harness home** (`CLAUDE_CONFIG_DIR` / Pi agent dir) rather than mounting the user's real `~/.claude`.
8. **Unguessable per-invocation id binds a connection to a network allow list** (srt proxy username) - lets the Director grant a Worker temporary egress.
9. **Fork/snapshot for warm Workers** (microsandbox `msb fork`, E2B snapshot-resume): snapshot a toolchain-ready image, fork per ticket.
10. **Reconcile on restart**: srt crash-recovery pass removes stale ACEs on next `initialize()`; Forge should sweep orphan sandboxes/ACLs/worktrees at boot.

## 8. Caveats / not verified

- Docker `sbx` hypervisor per OS, min Windows build: not stated on fetched pages; sbx is closed-source (no code read).
- Windows + container-use / Docker: relies on Docker Desktop, not stated by project.
- Codex Windows MXC details come from vendor doc summary only (WebFetch of https://learn.chatgpt.com/docs/windows/windows-sandbox); crate source skimmed (lib.rs, identity.rs names), not audited.
- Crystal/Claude Squad/Superset/vibe-kanban/emdash/Conductor/terragon: only repo descriptions and licenses checked; no sandbox code read. Terragon-oss describes itself as a former remote orchestrator (https://github.com/terragon-labs/terragon-oss). `coder/agentapi` repo is archived. `daytonaio/daytona` archived, license unreported by GitHub. Conductor and "agentbox" not located.
- Licenses via `gh api repos/<r> --jq .license.spdx_id`; claude-code-sandbox reports none; Superset and sbx-releases report NOASSERTION.
- Clones live in `.../scratchpad/src/` (sandbox-runtime, container-use, microsandbox, vibekit, sculptor, claude-code-sandbox, agents, codex(sparse), oh-legacy). Other dirs there belong to other agents.
