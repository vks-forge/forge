---
title: 'Running Forge Workers in sandboxes: cloudroom-core teardown, landscape, and a provider-port design'
id: final_report_agent-sandboxes-for-forge
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
summary: 'Synthesis: cloudroom-core is a Linux-only single-host daemon whose real boundary is one VM per agent (closed control plane); no surveyed project gives Forge a cross-OS, provider-pluggable sandbox. Recommends a core SandboxProvider port with declared capabilities, three workspace modes (host-paths, mounted worktree+commondir, git-bundle in/out), an in-box forge relay that multiplexes ACP, hooks and MCP over exec stdio so loopback-only (d-0093) and no-push-creds (d-0012) survive, and a backend ladder srt -> Docker/microsandbox/WSL2 -> SSH/E2B/Vercel/Cloudflare.'
---

# Running Forge Workers in sandboxes

Research only. No code was written. The evidence lives in four notes, and every
claim below traces to a file:line or URL in one of them:

- [[cloudroom-core-reverse-engineering]]: teardown of the target repo.
- [[local-agent-sandboxes-survey]]: local and self-hosted sandboxes, all three host OSes.
- [[remote-sandbox-providers-survey]]: 17 remote providers and 4 multi-provider abstractions.
- [[forge-sandbox-seams-map]]: where the boundary plugs into Forge today.

Earlier vault notes on the same theme:
[[a-software-factory-needs-one-sandbox-per-agent-upstash-blog]],
[[agency-secure-scalable-sandboxes-for-agents-sierra]],
[[ai-sandbox-pricing-comparison-2026-blog-northflank]],
[[e2b-the-enterprise-ai-agent-cloud]].

## 1. The ask, restated

1. Reverse-engineer `davidondrej/cloudroom-core` and similar projects that run
   agents (Claude Code, Pi, Codex, and others) inside a sandbox.
2. Support Windows, macOS and Linux hosts.
3. Make it an adapter interface, so any third-party server or sandbox provider
   can plug in.
4. Run Forge's harness (Workers) in it with the full codebase as a git worktree.

## 2. What cloudroom-core actually is

| Question | Answer |
|---|---|
| Shape | One privileged Rust daemon per **Linux** machine (Ubuntu 24.04, systemd, cgroup v2). Its HTTP API is plain HTTP on `127.0.0.1:9840` with a bearer token. It streams events over SSE with `Last-Event-ID` resume. |
| Harnesses | Codex (`app-server --listen stdio://`), Claude Code (raw stream-json control protocol), Pi (`--mode rpc` + TS extension), plus Cursor, OpenCode, Hermes, Devin and fx over ACP. All run as long-lived stdio subprocesses. |
| Adapter | `trait Adapter` (`src/runtime/mod.rs:280-309`) is a JSON-lines codec: validate, encode, receive, response, respond, capture, close, closed, clean_exit. A shared process driver owns framing (16 MiB cap), timeouts, the stderr tail and cgroup kill. The verbs (start, steer, interrupt, resume) are `match` arms outside the trait. |
| Isolation | Two Linux users: `cloudroom` for the service and `cloudroom-agent` **shared by all agents**. cgroups are used for freeze and kill only, with no limits and no network policy. Command Guard is a regex check that fails open. Every harness runs in **full bypass**: Claude `--dangerously-skip-permissions` (`claude.rs:65`), Codex `sandbox:"danger-full-access"` (`codex.rs:73`), and ACP permission requests answered `allow_once`. |
| Real boundary | "One sandbox VM per agent", sleeping after 30 idle minutes and waking in about 2.5 s (`docs/architecture.png`). A **closed** web app provisions those VMs. Core has **no provider interface**. |
| Git | **No worktrees.** Each sandbox gets a full project copy on its own branch, and agents "share work through Git". |
| Cross-OS | Linux only (`/proc`, cgroups, `SO_PEERCRED`). The `mac` module is a bridge that lets cloud agents run commands on the user's Mac, not macOS host support. |
| License | Apache-2.0. Reuse is allowed with attribution and change notes. |

**Verdict.** Cloudroom-core is a good *harness runner* and a poor *sandbox*. It
answers "how do I drive eight harness CLIs robustly", not "how do I isolate
them". The isolation and the provider layer, which are exactly what Forge needs,
are the closed parts.

### Worth copying, ranked by value to Forge

1. **Durability.**
   - Request-id idempotency, a receipt fsynced before 202, and "claim before spawn".
   - Uncertain work settles as `unknown_after_restart` and is never resent
     (`src/session/mod.rs:654-944`).
   - Maps to Forge's run state machine: persist the claim before
     `WorkerDriver.start()`.
2. **Assert what the harness applied.** Check permission mode, capabilities,
   session id and model at startup, and fail closed on a mismatch. Forge needs
   this most once the harness runs where it cannot see the process directly.
3. **Native-transcript resume** with identity, cwd and model checks, instead of
   re-feeding prompts.
4. **Route native subagents to orchestrator children.** Deny `Task`/`Agent` and
   expose a delegate MCP tool, so every unit of work stays visible to the Director.
5. **Fake harness binaries** for contract tests.
6. **Agent-to-orchestrator channel without a token.**
   - Linux uses `SO_PEERCRED` plus PID ancestry.
   - The Windows equivalent is a named pipe with `GetNamedPipeClientProcessId`
     (inference, not tested).
7. Disable harness auto-update; bounded lines and stderr tails; a disk guard
   that kills the top writer rather than the harness.

### Avoid

- Full bypass with a fail-open guard (conflicts with r-0005).
- Credentials as env vars readable by every tool call.
- One shared agent user.
- Linux-only primitives in the core path.
- Per-agent full repo copies with no merge orchestration.
- Harness-specific event data in the public API.
- Stripping AI co-author trailers by default.

## 3. The landscape in one table

No surveyed project gives a cross-OS, provider-pluggable sandbox **with a
policy layer that stays outside the box**. The pieces exist separately:

| Layer | Best references | Why |
|---|---|---|
| Per-process sandbox, no VM | **anthropics/sandbox-runtime (srt)**, Codex `codex-rs` sandboxes | The only primitives that isolate natively on Windows, macOS **and** Linux. srt: Seatbelt on macOS; bubblewrap + seccomp on Linux; on Windows (alpha) a dedicated `srt-sandbox` user, a WFP egress filter and ACLs. `wrapWithSandboxArgv()` returns `{argv, env}`, so it fits Forge's spawn path. |
| Local microVM or container | **microsandbox** (KVM / Apple silicon / Windows WHP, Apache-2.0); Docker Desktop and Docker `sbx` (closed); devcontainers CLI | microsandbox is the only open microVM runtime on all three hosts. It also has secrets that "never enter the VM" and fork/snapshot. Docker is the most familiar option, and on Windows and macOS a VM hides underneath it. |
| Remote providers | E2B, Vercel Sandbox, Cloudflare Sandbox, Daytona, Modal, Fly Sprites, Runloop, Blaxel, plain SSH VM | All of them can host a headless `claude -p --output-format stream-json` run. Cloudflare ships official Claude Code, Codex, OpenCode **and** Pi runners, with outbound credential injection. |
| Multi-provider abstractions | ComputeSDK, rivet sandbox-agent, vibekit, OpenHands `BaseWorkspace`, Sculptor `Environment` | Their interfaces converge on create/destroy plus exec/files, with optional pause/snapshot/ports. rivet's insight: the provider only provisions and reaches the box, and **a daemon inside it** speaks one protocol (no SSH). Sculptor's: path translation (`to_host_path`/`to_environment_path`) and workspace strategy (`IN_PLACE`/`CLONE`/`WORKTREE`) are first-class. |

**Platform reality** (from [[local-agent-sandboxes-survey]] §2):

- **Windows:** srt-windows (alpha, one-time admin install), the Codex native
  sandbox, WSL2, Docker Desktop, microsandbox (WHP). Claude Code's own
  `/sandbox` is unavailable on native Windows.
- **macOS:** srt/Seatbelt, microsandbox (Apple silicon only), Docker Desktop,
  Apple `container` (macOS 26 on Apple silicon), Lima.
- **Linux:** everything. Firecracker, Kata and E2B self-host need KVM.

## 4. Recommended design for Forge (no code)

### 4.1 One new port, beside `WorkerDriver`, not inside it

Add a `SandboxProvider` port in `core` (rule 2), with one adapter folder per
backend in a new adapter package such as `packages/sandboxes/<name>/`, picked by
config (rule 9, d-0085). Its shape, merged from ComputeSDK, rivet, OpenHands
and Sculptor:

| Layer | Required | Optional (declared in `capabilities()`, never inferred) |
|---|---|---|
| **Provider** | `id`, `capabilities()`, `preflight()`, `create(spec)`, `attach(id)` (returns null if gone), `list(labels)` for orphan sweeps, `destroy(id)` | regions, resource tiers, `maxLifetimeSec` |
| **Sandbox handle** | `exec(argv, {cwd, env, timeoutMs})` with streamed stdout/stderr, **stdin streaming**, `wait()` and `kill()`; `putArchive`/`getArchive` (tar, binary-safe); `toSandboxPath`/`toHostPath`; `status()`; `stop()` | `pty`, `pause`/`resume`, `snapshot`/`fork`, `ports.expose()` (flagging when previews are public), `egress.set(policy)`, `egress.injectCredentials(hostRules)`, `gpu` |
| **Workspace mode** | one declared `gitMode` | `host-paths`, `mount-worktree+commondir`, or `bundle` (see §4.3) |

The `spec` carries: image/template, cpu/mem/disk, non-secret env, egress
policy, timeout, and labels `{forgeRunId, ticketId, projectId}`.

Map errors to `ForgeError` families: quota, timeout, provider-unavailable,
not-found, capability-unsupported (rule 7). Add one contract test,
`describeSandboxContract(makeProvider)`, with capability tests gated by
`capabilities()` (rule 8).

**Drivers stay harness-only.** The driver keeps parsing harness JSON (rule 3).
The provider only moves bytes and processes. Today's `SpawnFn` and `G1Deps.runCommand`
seams ([[forge-sandbox-seams-map]] §2) become "spawn through
`sandbox.exec`". The `host` provider is an identity adapter: same spawn, same
paths, and it is what runs today. That makes the change reversible, and Express
lane keeps working.

`RunRequest.isolation` (already in `core/src/schemas/run.ts:56`) widens from
an enum to a provider id plus a profile chosen per lane (d-0005).

### 4.2 Control channel: an in-box relay instead of loopback callbacks

Today's coupling (seams map §3, items 1-4) is that the hook POSTs to
`127.0.0.1`, the MCP server opens the host SQLite DB, and the ACP adapter runs
on the host.

**Recommendation:** a small **forge relay** process inside the box, started
through `exec`. It multiplexes three channels over that exec's stdin/stdout:

- the ACP JSON-RPC stream;
- hook RPC: the in-box `hook.js` talks to the relay, and the relay forwards to
  the host hook handler;
- MCP stdio frames, bridged to an MCP process that stays **on the host** next
  to the DB.

This is the rivet sandbox-agent idea, but carried over the exec channel rather
than an inbound URL, so:

- **d-0093** (127.0.0.1 only) survives. Nothing ever connects *into* Forge, and
  no network bind changes.
- It works on every provider with exec plus stdin streaming, including plain SSH.
- `admit()`, receipts, HMAC and liveness stay host-side and unchanged. The run
  token travels over the authenticated exec channel.
- Path arguments in hook payloads go through `toHostPath` before `admit()`.
  Separately, the lowercasing in `tools/src/shared/path.ts:21-31` must become
  case-sensitive for Linux boxes (a latent bug).

Where it fits: run both the ACP adapter and `claude` inside the box, since
`CLAUDE_CODE_EXECUTABLE` then points at a box path. Codex `app-server` and Pi
`--mode rpc` are stdio too, so the same relay carries them.

### 4.3 "Full codebase as a worktree": three workspace modes

The worktree stays the unit of work (d-0059, d-0098). How it reaches the box
depends on the backend's declared `gitMode`:

| gitMode | Backends | How | Trade-off |
|---|---|---|---|
| `host-paths` | host, srt, Codex native sandbox | The sandbox is a policy over the host worktree path. The `.git` pointer just works. Deny writes to `.git/hooks` and `.git/config`, and make the `.git` file read-only (srt default). | Cheapest. Engine, G1 and git all keep working on the host. |
| `mount-worktree+commondir` | Docker, microsandbox, WSL2, devcontainers | Create worktrees with `git worktree add --relative-paths` (git 2.48 or later). Mount the worktree read-write and the main repo's `.git` common dir alongside it, with `hooks`/`config` read-only. | Fixes the pointer that breaks when only the worktree is mounted. The agent can write the shared object store and refs, so keep `merge()` as the only door that publishes. |
| `bundle` | remote providers, SSH VM | **In:** Forge builds a `git bundle` (base plus delta; optionally a prebuilt per-repo image or snapshot with only a delta bundle) and sends it with `putArchive`. **Out:** the Worker commits inside the box; Forge runs `git bundle create <base>..HEAD` via exec, fetches it into the host worktree, and validates it (allowed refs, size cap, no changes to `.git/hooks`, `.github/workflows` or submodule URLs). Only then do G1 and `merge()` run. | Workers never hold push **or** clone credentials (d-0012). Works with deny-all egress. Costs bundle time on huge repos. |

For remote boxes, the host worktree remains the copy of record that Forge's
engine, settle and merge code operate on. That keeps seams-map §3 item 6 (host
git) valid without modification.

### 4.4 Credentials

`login` mode (the host `~/.claude`) does not carry into a box. In order of
preference:

1. **Sentinel plus host-side injecting proxy.** The box sees a dummy key; the
   host proxy swaps in the real one (Docker `sbx`, microsandbox, srt, Cloudflare
   `interceptOutboundHttps`). Forge already plans a Bifrost gateway (d-0009).
   Pointing `ANTHROPIC_BASE_URL` at a host-side gateway reached through the relay
   is the natural fit.
   - **Unverified:** whether subscription OAuth (`CLAUDE_CODE_OAUTH_TOKEN`)
     works through a base-URL proxy. A probe must check this before it is relied on.
2. A per-run harness home (a volume with `CLAUDE_CONFIG_DIR`, Pi's agent dir)
   seeded with a setup-token or API key from the SecretStore. Never mount the
   user's real home.
3. Env var injection. Weakest; label it as such in the UI.

### 4.5 Backend ladder (per-OS, smallest first)

| Step | Backend | Windows | macOS | Linux | Closes |
|---|---|---|---|---|---|
| 0 | `host` (identity) | yes | yes | yes | nothing; today's behaviour behind the port |
| 1 | `srt` process sandbox | alpha (admin install) | yes | yes (bwrap) | the d-0117 gap, for files and network, without a VM |
| 2 | `docker` | Docker Desktop | Docker Desktop | native | real OS boundary, toolchains in an image, G1 inside the box |
| 2b | `microsandbox` / `wsl2` | WHP / WSL2 | Apple silicon | KVM | microVM boundary; no Docker licence question |
| 3 | `ssh-vm` (lowest common denominator) | any | any | any | "any third-party server" (Hetzner, own box) |
| 4 | `e2b`, `vercel`, `cloudflare`, then `daytona`, `modal` | n/a (remote) | | | managed fleets; snapshot, pause and egress policy |

Step 3 is the generic "attach any server" adapter: plain SSH plus the relay. It
covers any provider that can hand out an SSH box. ComputeSDK could serve as a
long-tail catch-all adapter later, but its string-only fs and untyped options
argue against using it as Forge's core interface.

## 5. Conflicts and open decisions for the owner

| # | Decision needed | Recommendation | Records touched |
|---|---|---|---|
| 1 | Default local backend on Windows: srt-windows (alpha), Docker Desktop, or WSL2 | srt for Standard lane now; Docker or microsandbox for Full lane and untrusted repos | d-0005, d-0117, execution-plane §6 |
| 2 | Accept an in-box relay carrying ACP, hooks and MCP over exec stdio (keeps loopback-only) | yes | d-0093, d-0033 |
| 3 | Workspace modes: host-paths / mount+commondir / bundle; switch worktree creation to `--relative-paths` | yes; check minimum git 2.48 in preflight | d-0059, d-0098 |
| 4 | Credential mode in a box: proxy injection first, per-run home second | yes; probe OAuth through a base-URL proxy first | d-0031, d-0087 |
| 5 | Run project checks (G1) inside the sandbox via `G1Deps.runCommand` | yes; this is what actually closes d-0117 | d-0074, d-0117 |
| 6 | First remote adapter after SSH: E2B, Vercel or Cloudflare | Cloudflare (four-harness examples, credential interception) or E2B (claude template, PTY reattach); re-verify pricing first | none yet |
| 7 | Never use `--dangerously-skip-permissions` in a box, unlike every vendor example | keep `set_mode default` plus the hook door; the box is defence in depth, not a replacement | r-0005, d-0049 |

## 6. Gaps in this research

- **Unconfirmed from primary pages:** pricing for E2B, Daytona, Modal, Runloop,
  Morph and Northflank; the Fly exec endpoint; Modal's PTY; Northflank's
  isolation.
- **Docker `sbx`:** closed source, and the hypervisor it uses on each OS is unknown.
- **Codex Windows sandbox:** MXC details come from vendor docs only.
- **Code not read:** Crystal, Claude Squad, vibe-kanban, Conductor, Mastra, LangChain/agno.
- **Archived repos:** `daytonaio/daytona` is archived on GitHub (verified with
  `gh`), so the Daytona self-host status needs checking. The textcortex
  claude-code-sandbox repo is also archived.
- **Not tested:** the relay design (§4.2) is a design inference. A spike should
  prove ACP plus hook plus MCP multiplexing over E2B or Docker exec before any
  slice is cut.
