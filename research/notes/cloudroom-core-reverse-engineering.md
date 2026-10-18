---
title: 'Reverse engineering: davidondrej/cloudroom-core (0.1.61)'
id: cloudroom-core-reverse-engineering
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
summary: 'cloudroom-core is a Linux-only privileged Rust daemon (one per VM) that runs Codex, Claude Code, Pi, Cursor, OpenCode, Hermes, Devin as stdio subprocesses in full-bypass mode under one shared agent UID; isolation is one VM per agent provisioned by a closed web app; no worktrees, no provider interface; durability and harness-codec patterns are worth copying (Apache-2.0).'
---

# A. Reverse-engineering report: `davidondrej/cloudroom-core`

Target: shallow clone at commit `0735d68` ("Publish core 0.1.61", 2026-10-15), crate `cloudroom` v0.1.61, Rust edition 2024, rust-version 1.89 (`Cargo.toml:1-7`).
Size: about 39.5k lines total. About 24k are Rust in `src/`, about 4.6k are Python/TS tests, plus Python install scripts and helpers.
Method: I read the files with `cat`/`grep` only. I built nothing and ran nothing from the repo. Every repo file was treated as data. `AGENTS.md` and the `SKILL.md` files are described here, not followed.
All paths below are relative to the repo root. `file:N` means a line number. `file:N-M` means a range.

---

## 0. TL;DR for the Forge team

| Question | Short answer |
|---|---|
| What is it? | A single privileged Rust HTTP daemon ("Core"), one per Linux machine. It spawns coding-agent CLIs (Codex, Claude Code, Pi, Cursor, OpenCode, Hermes, Devin, "fx") as long-lived stdio subprocesses. It keeps a durable request queue and journal per session and streams normalized-ish events over SSE. |
| Where does it run? | Linux only: Ubuntu 24.04 with systemd + cgroup v2 (`install/install.sh:21-25`), or a sandbox/container without systemd (`install/sandbox-start.sh`). The hosted product runs **one sandbox VM per agent thread** (`docs/architecture.png`). |
| Who calls it? | The closed-source Cloudroom desktop app (Mac), the Cloudroom website (wakes and sleeps sandboxes, stores history), a TS client in `integrations/bb/client.ts`, and agents themselves through a peer-credential Unix socket (`room-cli`). |
| Isolation boundary | Two Linux users: `cloudroom` (the service) and `cloudroom-agent` (all agents share it). Each harness gets its own cgroup v2 workload for kill, freeze and count, **not for limits**. The real security boundary in hosted mode is "one VM/sandbox per agent". |
| Git worktrees? | **No.** There is no `git worktree` anywhere. A workspace is a plain folder under `/code/<name>`. In hosted mode the Mac app copies the project into a fresh sandbox, "on its own branch" (`src/session/thread.rs:34`). |
| Cross-platform? | Core is Linux-only (unix-only APIs, `/proc`, cgroups, `SO_PEERCRED`). The "mac" module is a **remote-control bridge to the user's Mac**, not a macOS host port. |
| Provider abstraction? | None in Core. The deployment target is single-host. VM and sandbox provisioning lives in the closed web app. Core only exposes `POST /v1/drain` and sleep/wake hooks. |
| License | Apache-2.0 (`LICENSE`, `Cargo.toml:6`, `integrations/bb/package.json`). Reuse, modification and commercial use are allowed if you keep the license and NOTICE text and mark changed files. |

---

## 1. What it is, deployment model, callers

### 1.1 Product framing
- README: "Cloudroom core runs coding agents on your own Linux machine and saves their chat history. It powers the cloud side of the Cloudroom app" (`README.md:7`). It supports "Codex, Claude Code, Pi, and Cursor" and "Agents use your own logins to call their models" (`README.md:9-10`). It is "One Rust service per machine" (`README.md:11`).
- Security claims (`README.md:26-32`):
  - agents run as a separate Linux user without sudo;
  - agents can't read the core's token or history;
  - every API request needs a bearer token;
  - Command Guard blocks "a few disastrous commands";
  - "Agents run without approval prompts, so give each trusted user their own machine."
- Architecture diagram (`docs/architecture.png`, titled "Cloudroom v2, one sandbox per agent, Sept 27, 2026"):
  - "sandboxes (one per agent)", each holding Cloudroom core, the agent, and a "project copy, its own git branch";
  - each sandbox "sleeps after 30 idle min, wakes in ~2.5 s";
  - an always-on "Cloudroom web app (the brain)" does wake/sleep and talks to Supabase (database + files);
  - the Mac app "talks to core directly" and "finds its sandbox" through the web app.

### 1.2 Deployment shapes

| Shape | Evidence | Notes |
|---|---|---|
| systemd VM (self-host) | `install/cloudroom.service:1-29`, `install/install.sh` | `User=cloudroom`, `Delegate=yes`, `AmbientCapabilities=CAP_SETUID CAP_SETGID CAP_DAC_READ_SEARCH CAP_KILL`, `NoNewPrivileges=yes`, `UMask=0077`, `LimitNOFILE=524288`, `KillMode=control-group`, `Restart=on-failure` (`install/cloudroom.service:7-26`). |
| Sandbox without systemd | `install/sandbox-start.sh:1-69` | A root bash supervisor. It parses (never sources) `CLOUDROOM_*` lines from `image.env` and `core.env` (`:22-31`). It creates `/sys/fs/cgroup/cloudroom/agents` (`:37`), drops privileges with `setpriv --reuid=cloudroom ... --ambient-caps=-all,+setuid,+setgid,+dac_read_search,+kill` (`:43-47`), and restarts with exponential backoff up to 30 s (`:52-63`). If `/tmp` is on a different device from `/code`, it bind-mounts a disk folder over `/tmp` in a private mount namespace (`:17-20`). |
| Container mode (no cgroups) | `docs/storage.md:40-48`, `src/workspace/storage.rs:13-30`, `src/runtime/linux.rs:18-24` | `"cgroup_root": null` plus `"agent_sudo": true`. Core runs **as the agent account**. Workloads are tracked by an inherited env var `CLOUDROOM_WORKLOAD=<id>` and signals. "Processes that clear their environment or switch user through sudo escape." This mode is rejected unless `agent_sudo` is set (`src/workspace/storage.rs:52-56`). |

### 1.3 ADR 0001: privileged service
`adr/0001-accept-privileged-core-service.md:3-7`: "Status: accepted (David, 2026-09-20). Keep the core service's existing elevated privileges as an intentional design trade-off ... This accepts the current service design, not root access for agent processes. Existing privilege dropping remains unchanged."
In other words, Core keeps `CAP_SETUID/SETGID/DAC_READ_SEARCH/KILL` so it can:
- move children into cgroups and drop to the agent UID (`src/runtime/linux.rs:305-353`);
- read agent files (`DAC_READ_SEARCH`);
- kill preview SSH sessions (`docs/previews.md:77`).
Only that one ADR is shipped. The code cites about 240 other ADRs (0031, 0113, 0133, 0232, 0237 ...) that live in a private repo.

### 1.4 Install flow (`install/install.sh`)
1. Refuses to run unless root, systemd and cgroup v2 are present. Refuses if `/etc/cloudroom/core.env` already exists. Warns on anything other than Ubuntu 24.04 (`:17-22`).
2. Picks a release asset from the GitHub API and checks its sha256 against `update-manifest.json` inside the tarball (`:34-50`). Note that the checksum comes from the same tarball, so this is an integrity check, not authenticity.
3. Installs Node 24 system-wide if it is missing, checksum-verified against nodejs.org SHASUMS (`:52-61`). Node is needed by the Command Guard and Pi.
4. Creates two users:
   - `cloudroom`: system user, home `/var/lib/cloudroom`, nologin;
   - `cloudroom-agent`: login shell bash.
   It then sets `chmod 700` on both homes, creates `/var/lib/cloudroom/history` (0700, owned by cloudroom), `/etc/cloudroom` (0750, root:cloudroom) and `/code` (0700, owned by agent) (`:63-75`).
5. Writes `core.env` with `CLOUDROOM_TOKEN=$(openssl rand -hex 32)`, `LISTEN=127.0.0.1:9840`, `STORE=self-hosted`, `STATE_DIR`, `ACCOUNT_HOME`, and either `API_URL` or `LOCAL_HISTORY=1` (`:77-90`). Runs `configure.py --storage-only` to write `storage.json` (`:92`).
6. Runs `systemctl enable --now` and polls `/v1/health` (`:94-102`).
The installer does **not** install any harness, log in, or configure TLS or a firewall. Harness login runs separately as `cloudroom-agent` (`docs/setup.md:59-62`).

`install/update.py` handles in-place upgrades:
- waits until there has been no session activity for 10 minutes (`QUIET_MS`, `:33`);
- gates the API port with iptables REJECT rules during the swap (`gate()`, `:164-175`);
- verifies the binary's sha256 against the manifest (`:178-181`);
- pins Claude Code `2.1.281` (`:31`);
- verifies features and sessions, and rolls back on failure (`docs/setup.md:193`).

### 1.5 Callers

| Caller | How | Evidence |
|---|---|---|
| Cloudroom desktop app (Electron, closed source) | HTTPS to Core with bearer token; SSE `/stream`; raw-framed terminal WebSocket | `docs/setup.md:177-179`, `docs/api.md` |
| Cloudroom website ("the brain") | Core *pushes* to it: `/api/core/uploads` (presigned gzip history links), `/records`, `/diagnostics`, `/report`, `/automation`. It wakes the sandbox for cron automations. | `src/session/history.rs:1-3,61-70`, `tests/fake_api.py:35-71`, `src/session/automation.rs:1-3` |
| TS client `@cloudroom/client` | Typed wrapper over every endpoint, Apache-2.0 | `integrations/bb/client.ts` (941 lines), `integrations/bb/package.json` |
| Agents inside the box | `room-cli ...` (the same binary, multi-call) over Unix sockets `/run/cloudroom/mac.sock` and `/run/cloudroom/preview.sock`, authorized by `SO_PEERCRED` UID plus process ancestry | `src/main.rs:12-75`, `src/mac/mod.rs:37,467-499`, `src/preview/mod.rs:28,494-510`, `src/session/thread.rs:121-134` |
| Mac helper daemons (Python LaunchAgents) | `src/sync/client.py` (skills/settings/Codex/Pi login sync), `src/preview/client.py` (SSH or tunnel port forwarding) | `docs/setup.md:217-223`, `docs/previews.md:25` |

---

## 2. Architecture

### 2.1 Module map (`src/lib.rs:1-11`)

| Module | Lines | Responsibility |
|---|---|---|
| `main.rs` | 136 | Multi-call binary. With no args it runs `serve()`. Subcommands (`preview`, `mac`, `secret`, `thread`, `feedback`/`report`, `automation`, `files`, `computer-use`) are the agent CLI `room-cli`. `--cursor-driver BINARY` is the built-in Cursor print-mode driver. `--clean-npm-cache`. `--*-skill` prints bundled SKILL.md files (`src/main.rs:12-135`). |
| `lib.rs` | 105 | `FEATURES` capability list (`src/lib.rs:19-58`). `serve()` canonicalizes paths, binds the listener, `Manager::open`, `restore_all`, starts the background loops, then axum with graceful shutdown (`src/lib.rs:61-104`). |
| `config.rs` | 242 | Env-only config. Auto-discovers harnesses (§2.3). |
| `api/mod.rs` | 1415 | The axum router, bearer auth middleware, observability middleware, and all `/v1` handlers. |
| `runtime/` | ~9.8k | Harness adapters, the shared stdio process driver, Linux containment, logins, Command Guard, PTY terminals. |
| `session/` | ~7.3k | `Manager`: session registry, durable journal, state machine replay, queue, receipts, children, teleport, sleep, guard loops, history upload, automations, agent-side thread API. |
| `workspace/` | ~1.3k | `/code` folder registry, filesystem checks, attachments, the disk policy (`storage.rs`), `room-cli files wait`. |
| `sync/` | 449 rs + 1.2k py | Skills/settings/MCP/Codex-login sync with the Mac. `files.py` is a shared, dependency-free privileged file worker that runs as the agent UID. |
| `preview/` | 880 rs + 1k py | Localhost previews of agent dev servers over restricted SSH or a raw HTTP-upgrade tunnel. |
| `secrets/` | 463 | `room-cli secret request` asks the user for env vars through the app form and writes a 0600 dotenv. |
| `mac/` | 726 + 282 | Two-way bridge. The agent runs commands or copies files on the **user's Mac** through a job queue that the Mac helper reads over SSE. The Mac runs commands on the VM (`/v1/vm/run`). |
| `computer_use/` | 339 | `room-cli computer-use` drives Xvfb `:99` plus a pinned "Cua Driver" for GUI testing in the sandbox. |
| `observability/` | ~1.2k | Bounded JSONL diagnostics, resource sampling (`/proc` or cgroup), protected stderr tail capture, upload to the website. |

Dependencies are deliberately small (`Cargo.toml:9-20`): axum 0.8, tokio, serde/serde_json, reqwest (rustls), flate2, tokio-stream, hyper, hyper-util. **There is no libc, nix, sqlx or postgres crate.** Syscalls (`setuid`, `prctl`, `capset`, `kill`, `recvmsg`) are declared through raw `unsafe extern "C"` (`src/runtime/linux.rs:298-303,313-322`; `src/runtime/files.rs:212+`).

### 2.2 Data flow: "start an agent session" end to end
1. **HTTP.** `POST /v1/sessions` with `{request_id, harness?, model?, reasoning?, workspace?, workspace_name?, provider?, command_guard_enabled?, system_prompt?}`.
   - It passes `authenticate`, which accepts `Authorization: Bearer` or `X-Cloudroom-Token` because "some sandbox proxies replace Authorization" (`src/api/mod.rs:470-498`). Comparison is constant-time (`same_token`, `:501`).
2. **`Manager::start`** (`src/session/mod.rs:654-826`):
   - The session id is `cr_{request_id}` (`:668`), so retries are idempotent.
   - It builds a canonical `input` JSON. If a session with that id exists, `retry()` either returns the same receipt or a `request_conflict` (`:714-718`).
   - It refuses when the journal is unwritable, storage is blocked, or no harness is configured (`:719-727`).
   - In parallel (`tokio::join!`) it runs the saved-history lookup on the website, `harness_ready` (login check), and `execution_supported` (model and reasoning against the native catalog) (`:729-748`).
   - It resolves the workspace: `root`, `/code`, a registered `/code/<name>`, or `CLOUDROOM_REPOSITORY` (`:767-785`).
   - It appends a `receipt` record with `state:"accepted"` to the fsynced journal *before* returning (`:796-818`).
   - It then `tokio::spawn`s `launch` and returns HTTP 202 `{session_id, receipt, saving}`.
3. **`Manager::launch`** (`src/session/mod.rs:828-944`):
   - acquires a startup semaphore (at most half the logical CPUs initialize at once, `docs/session-lifecycle.md:39`);
   - waits while storage is blocked;
   - runs `ensure_directory`;
   - clones `Config` and points `config.repository` at the workspace path (`:875`). That is the harness cwd;
   - journals `state: starting` **before** spawning: "Claim before spawning: a crash after this point must not repeat uncertain execution" (`:882-883`);
   - calls `runtime::Handle::spawn_guarded` or `spawn_fork`, records `harness {pid}`, `watch_events`, then `handle.start_session()` (the native handshake with 4x RPC timeout);
   - journals `native_identity`, `state: idle`, finishes the receipt as `completed`, and calls `advance()` to drain the queue.
4. **Runtime spawn** (`src/runtime/mod.rs:423-585`):
   - a per-kind `command()` builds the `tokio::process::Command` (§3);
   - the optional `strip_ai_co_authors` env hook is applied (`:312-332`);
   - `process::Process::spawn` creates the cgroup workload, `attach()`es it (pre_exec: write to `cgroup.procs`, set `NO_NEW_PRIVS`, drop to agent uid/gid, clear ambient caps, `capset` to zero), sets `npm_config_cache`, and spawns (`src/runtime/process.rs:97-115`; `src/runtime/linux.rs:49-59,305-353`).
5. **Process driver loop** (`src/runtime/process.rs:134-266`). One task per harness `select!`s over:
   - stop requests (adapter `close()` frames plus a 4 s grace);
   - child exit;
   - freeze-state changes;
   - outbound calls (busy check, target check, `adapter.encode`);
   - inbound stdout lines, capped at 16 MiB each. It does strict UTF-8 and JSON parsing, `adapter.receive`, `adapter.respond` (auto-replies), and `adapter.response` (RPC correlation);
   - a 250 ms tick calling `adapter.capture()` to tail the harness's native history file.
   On exit it does a final capture drain, cgroup cleanup, and stderr tail collection, then emits `Event::Exited{reason, expected, cleaned_up, details}`.
6. **Prompts.** `POST /v1/sessions/{id}/prompts` → `Manager::command` → receipt `accepted` in the queue → `deliver` → `handle.send_prompt` → adapter-specific RPC. Native turn start and finish events from the adapter move the receipt to `delivered` and then `completed`/`interrupted`/`failed`.
7. **Streaming.** `GET /v1/sessions/{id}/stream` is SSE. Each event is `record`, and its `id` is the sequence, so `Last-Event-ID` resumes exactly (`src/api/mod.rs:1365-1410`). `GET /events?after=N` pages 256 at a time.

### 2.3 Config (`src/config.rs`)
- Required: `CLOUDROOM_TOKEN` (at least 32 visible ASCII chars, `:37-42`), `CLOUDROOM_STATE_DIR`, `CLOUDROOM_ACCOUNT_HOME`, `CLOUDROOM_STORE`, `CLOUDROOM_STORAGE_POLICY` (unless test mode), and either `CLOUDROOM_API_URL` (https, or a loopback http test URL) or `CLOUDROOM_LOCAL_HISTORY=1` (`:212-235`). "A managed install never silently drops to local-only history."
- Non-loopback listen is refused unless `CLOUDROOM_ALLOW_NON_LOOPBACK_HTTP=1`. Plaintext only; TLS is the proxy's job (`:43-62`).
- `CLOUDROOM_UNPROTECTED_TEST_MODE=1` disables the storage policy (`storage=None`), which means no containment and no uid drop. It is loopback only (`:47-69`).
- Harness discovery:
  - **Codex and Pi** are configured by env: `CLOUDROOM_{CODEX,PI}_{BINARY,HOME,MODEL}` and `CLOUDROOM_PI_PROVIDER` (`:91-114`).
  - **Claude** is auto-discovered if `$ACCOUNT_HOME/.local/bin/claude` or `/usr/local/bin/claude` exists **and** `$ACCOUNT_HOME/.claude` is a directory. The default model is `sonnet` (`:115-131`).
  - **Cursor** uses the same rule with `cursor-agent` and `.cursor` (`:132-148`).
  - **ACP harnesses** (`fx`, `opencode`, `hermes`, `devin`) use the same rule with their own home folders (`:149-174`).
- `rpc_timeout` is 30 s, and startup gets 4x (`src/runtime/mod.rs:36-38`).
- Per-session user env vars come from `$STATE_DIR/environment` ("NAME=value" lines). They are read at every spawn and injected after `env_clear()`, with Core's own values winning (`src/runtime/mod.rs:985-993`).

### 2.4 Storage
- **Local journal** (`src/session/outbox.rs`):
  - one file per record, `{id:020}.record`, in `CLOUDROOM_STATE_DIR`, written atomically and fsynced;
  - an exclusive `lock` file (`try_lock`) prevents two cores sharing a dir (`:33-46`);
  - startup checks there are no gaps (`count()`, `:79-101`);
  - cursors `saved` (acknowledged externally) and `uploading` (the batch in flight, so a restart resends the identical batch, `:14-15,62-66`);
  - `snapshot.json` holds the replayed state machine at a sequence. It is written every 20,000 records, on drain and on shutdown (`src/session/state.rs:4-10`, `docs/session-lifecycle.md:58`).
- **External history**: the website issues short-lived upload links. Core PUTs gzip JSONL per session per batch, with `If-None-Match: *` semantics, and treats a conflicting existing file as a hard `conflict` (`src/session/history.rs:1-3,26,129+`; `tests/fake_api.py:40-47,58-61`). Uploads batch for 30 s or 1,024 records (`src/session/guard.rs:7-10`).
- **The PostgreSQL SQL in `docs/database/*.sql` is legacy.** The current Core has no DB driver (no postgres crate in `Cargo.lock`). `Cargo.toml:14` says "History, diagnostics, and feedback go to the website over HTTPS (ADR 0232)". `docs/dashboard.md:44` says "Cores don't read the database". Some docs still say readiness checks "both history tables" (`docs/dashboard.md:35`, `docs/api.md:17`), which is stale. The SQL shows the website-side schema anyway:
  - `cloudroom_records(store, session_id, sequence, record text)`;
  - `cloudroom_diagnostics(store, run_id, sequence, timestamp_ms, record jsonb)`;
  - RLS is enabled and Supabase `anon`/`authenticated` grants are revoked in the same transaction (`docs/database/0001-session-records.sql:10-29`).
- **Workspaces**: `/code` (owned by agent, 0700) plus a JSON registry under `$STATE_DIR/workspaces` (`src/workspace/mod.rs:36-60`).
- **Disk policy** (`docs/storage.md`, `src/workspace/storage.rs`):
  - warn at 5 GB free;
  - block new work and freeze workloads below 2 GB;
  - resume above 2.5 GB;
  - after 30 s frozen, kill the process group with the largest `/proc/PID/io write_bytes`, never the harness's own group (`src/runtime/linux.rs:129-168`, `src/session/guard.rs:5-6`).
  - The policy file and every ancestor directory must not be agent-owned, group/world-writable, or a symlink (`src/workspace/storage.rs:57-66`).

---

## 3. Harness adapter layer (`src/runtime/*`)

### 3.1 Division of responsibility
`docs/harnesses.md:3`: "Cloudroom owns processes, durable requests/queues, recording, replay and recovery. Harnesses own their agent loop, tools, inference, retries and compaction. Runtime's shared process driver handles bounded stdio, shutdown and Linux containment; each adapter owns its protocol and native history."

### 3.2 The trait (verbatim, `src/runtime/mod.rs:280-309`)
```rust
// Protocol differences stay here, not in Session Management or the process driver.
trait Adapter: Send {
    fn validate(&self, _method: &str, _params: &Value) -> io::Result<()> { Ok(()) }
    fn encode(&mut self, id: u64, method: &str, params: Value, request: Option<&str>) -> Value;
    fn receive(&mut self, value: &Value, raw: String, progress: &mut Progress) -> io::Result<Vec<Event>>;
    fn response(&self, value: &Value) -> Option<(u64, io::Result<Value>)>;
    fn respond(&self, _value: &Value) -> Vec<Value> { Vec::new() }
    fn capture(&mut self) -> io::Result<Vec<Event>>;
    fn capture_pending(&self) -> bool { false }
    fn close(&mut self) -> Vec<Value> { Vec::new() }
    fn closed(&mut self, _value: &Value) -> bool { false }
    fn clean_exit(&self, code: Option<i32>) -> bool { code == Some(0) }
}
```
- This is a **wire-codec trait**: one JSON line in, one JSON frame out. Every harness must speak JSON lines on stdio.
- The higher-level verbs (`start_session`, `send_prompt`, `steer`, `interrupt`, `compact`, `rewind`, `goal`, `system_message`, `usage`, `child_result`) are **not** on the trait. They are big `match self.kind` dispatches in `Handle` (`src/runtime/mod.rs:642-854`). Adding a harness therefore touches the `Kind` enum, `config.rs`, and about 10 match arms.
- The normalized output is the `Event` enum (`src/runtime/mod.rs:189-219`): `Authentication`, `ChildRequest`, `Record{kind, data, native}`, `Started{request, native_turn, auto}`, `Finished{request,status,error}`, `Compacted`, `Exited{reason, expected, cleaned_up, details}`.
- `Progress` (`:239-278`) is the per-process turn tracker (native id, active request, started/finished, last usage/text, model, background processes, `auto`). It is published via a `watch` channel.
- Capabilities are declared per kind (`Handle::capabilities`, `:631-641`). The ACP family has no compact, rewind, notice, subagents or usage (`src/runtime/cursor.rs:47-51`).
- The docs admit "Output records are not yet harness-neutral. Kinds are shared, but `data` differs by harness" (`docs/api.md:62`).

### 3.3 Common spawn environment (`src/runtime/mod.rs:977-1004`)
- `env_clear()`, then the user environment file, then:
  - `PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.cargo/bin:$HOME/go/bin` (system tools first, ADR 0119);
  - `HOME=<agent home>`, `LANG=C.UTF-8`;
  - cwd = workspace;
  - stdin/stdout/stderr piped, `kill_on_drop`.
- Core's token and DB/admin env vars are never inherited (`docs/harnesses.md:26`).
- Optional git hook that strips AI `Co-authored-by` trailers. It injects `GIT_CONFIG_COUNT=3` plus `hook.cloudroom-strip-ai-co-authors.command/event` for `prepare-commit-msg` and `commit-msg`, filtering claude/anthropic/cursor/codex/openai/... lines. It needs Git 2.54+ (`src/runtime/mod.rs:311-332`).
- The workload's npm cache goes to `policy.cache_dir/npm` (`src/runtime/process.rs:108`).

### 3.4 Per-harness spawn, protocol and quirks

| Harness (`Kind`) | Binary / discovery | Exact launch | Protocol | Resume / fork | Notes |
|---|---|---|---|---|---|
| **Claude Code** (`claude-code`) | `~/.local/bin/claude` or `/usr/local/bin/claude` + `~/.claude` (`src/config.rs:115-131`) | `claude --settings '{"fastMode":false,"enableWorkflows":false}' -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --replay-user-messages --dangerously-skip-permissions --permission-prompts none --no-chrome --model M --append-system-prompt <INSTRUCTIONS[+system_prompt]> --disallowedTools AskUserQuestion,EnterPlanMode,ExitPlanMode,Agent,Task,Workflow,SendMessage --mcp-config '{"mcpServers":{"cloudroom":{"type":"sdk","name":"cloudroom"}}}' [--settings '{"attribution":{"commit":"","pr":""}}'] --session-id UUID` (`src/runtime/claude.rs:31-102`). With the guard on, the first `--settings` instead carries a `PreToolUse` hook (§4.5). | Native stream-json **control protocol** without the SDK: `control_request`/`control_response`, `initialize` with a `SubagentStart` hook callback and `sdkMcpServers:["cloudroom"]` (`:240-248`), `apply_flag_settings` for effort (`:292-299`), user frames with `uuid`/`shouldQuery`/`isSynthetic` (`:699-748`). | `--resume ID`. Fork: `--resume SRC --fork-session --session-id NEW [--resume-session-at CHECKPOINT]` (`:89-100`). Rewind = spawn a replacement process (`src/runtime/mod.rs:746-773`). | Validates `system/init`: requires the capabilities `msg_lifecycle_v1` and `interrupt_cancel_queued_v1`, `permissionMode=="bypassPermissions"`, and fast mode off (`claude.rs` ~`:814-833`). Any frame with `parent_tool_use_id` is a fatal "unmanaged Claude subagent" (~`:806`). Hook callbacks get `continue:false` and permission requests get `deny` (~`:769-778`). Delegation goes through an in-process MCP server exposing one tool `delegate` (~`:622-683`). Tool-input deltas are not recorded (`docs/session-lifecycle.md:59`). |
| **Codex** | `CLOUDROOM_CODEX_BINARY`, `CODEX_HOME` (`src/config.rs:91-114`) | `codex app-server --listen stdio://` with `CODEX_HOME` (`src/runtime/codex.rs:14-20`). With the guard: `sh -c ... exec codex -c 'hooks={PreToolUse...,state...}' app-server --listen stdio://` (`src/runtime/command_guard.rs:8-12,50-61`). | Codex app-server JSON-RPC: `initialize{clientInfo, capabilities.experimentalApi}` then `initialized` (`codex.rs:22-25`); `model/list` paged (`:27-68`); `thread/start\|resume\|fork` with `{"cwd","model","approvalPolicy":"never","sandbox":"danger-full-access","ephemeral":false, developerInstructions?, config.model_reasoning_effort?}` (`:71-95`); `turn/start`, `turn/steer`, `turn/interrupt`, `thread/compact/start`, `thread/goal/*`, `thread/inject_items` (developer message as a context-only notice) (`:172-289`). | Resume reads the rollout JSONL under `CODEX_HOME/sessions`. Tail capture by byte offset (`codex.rs:615-700`). Fork via `thread/fork` with `last_turn_id`. | On interrupt it also calls `thread/backgroundTerminals/terminate` for each background process (`:300-323`). The `codex-code-mode-host` helper is counted as harness, not a background job (`src/runtime/linux.rs:275-281`). Device-code login via `account/login/start {type:"chatgptDeviceCode"}` (`src/runtime/auth.rs:394`). |
| **Pi** (`@earendil-works/pi-coding-agent`) | `CLOUDROOM_PI_*` | `/bin/sh -c '<version check >= 0.85.1 via sort -V>; umask 077; mkdir -p DIR; set -C; : > SESSION; printf %s CONTEXT_TS > HELPER; exec pi --mode rpc --session SESSION --session-dir DIR --provider P --model M -e HELPER [--append-system-prompt S]'` with `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, `PI_TELEMETRY=0` (`src/runtime/pi.rs:17,31-92`). | Pi `--mode rpc` JSON. Core writes a bundled TS extension (`pi-context.ts` plus the guard source) that registers `cloudroom_context` (context-only notices), `cloudroom_snapshot` (fsync before rewind ack), `cloudroom_child_result`, and a `cloudroom_subagent` tool that writes `cloudroom_child_request` frames to **stdout**, reusing the RPC pipe as the private channel to Core (`src/runtime/pi-context.ts:7-80`). | The session file is created exclusively and empty; Pi initializes it. Resume checks header identity, workspace, model, provider and version, and "never creates a missing file or silently migrates" (`docs/harnesses.md:142`). | `apply_thinking` before each turn (`src/runtime/mod.rs:666-673`). Interactive extension dialogs are auto-cancelled (`docs/harnesses.md:150`). |
| **Cursor** | `cursor-agent` + `~/.cursor` | Core re-execs **itself**: `cloudroom --cursor-driver <cursor-agent>` (`src/runtime/cursor.rs:53-63`). That driver runs one `cursor-agent -p --trust --force --output-format stream-json --stream-partial-output --resume CHAT --model VARIANT` per prompt with `--disable-auto-update` (`src/runtime/cursor_print.rs:93,216-218`), and talks ACP back to Core. | A "small ACP subset", because Cursor's real ACP mode can't set reasoning (`docs/harnesses.md:120`). | Native SQLite chats at `.cursor/chats/<md5(cwd)>/<id>`. Core snapshots chunks through `cursor-history.py` (`docs/harnesses.md:126`). | API key in `.cursor/cloudroom-api-key`, passed as `CURSOR_API_KEY` (`src/runtime/cursor_auth.rs:18-43`). No Command Guard (`docs/harnesses.md:124`). |
| **OpenCode** | `opencode` + `~/.local/share/opencode` | `opencode acp` with `OPENCODE_DISABLE_AUTOUPDATE=1`, `OPENCODE_CONFIG_CONTENT={"autoupdate":false,"permission":{"question":"deny"}}` (`src/runtime/opencode.rs:31-50`) | Shared ACP `cursor::Protocol` with a `Flavor` struct (`src/runtime/cursor.rs:20-45`) | `session/load` | Works with OpenCode 1 and 2 (`docs/harnesses.md:132`). |
| **Hermes** | `hermes` + `~/.hermes` | `hermes acp` with `HERMES_YOLO_MODE=1`, `TERMINAL_ENV=local`, `HERMES_ACP_SKIP_CONFIGURED_MCP=1` (`src/runtime/hermes.rs`) | ACP | ACP | |
| **Devin** | `devin` + `~/.local/share/devin` | `devin acp` with `XDG_DATA_HOME=~/.local/share` (`src/runtime/devin.rs`) | ACP | ACP | |
| **fx** | `fx` + `~/.fx` | `fx acp` with `FX_PERMISSION_MODE=full-access`, `FX_AUTO_UPGRADE=0` (`src/runtime/fx.rs`) | ACP | ACP | |

ACP details (`src/runtime/cursor.rs`):
- `initialize{protocolVersion:1, clientCapabilities:{fs:{readTextFile:false,writeTextFile:false}, terminal:false}}`. Core requires `agentCapabilities.loadSession==true` (`:84-102`).
- `session/new|load {cwd, mcpServers:[]}` (`:71-82`). The model is chosen with `session/set_config_option` (`:120-148`).
- **`session/request_permission` is auto-answered with the `allow_once` option** unless Core is closing or cancelling (`:559-576`).
- `cursor/ask_question` is skipped, `cursor/create_plan` is rejected, unknown client methods get -32601 (`:577-596`).

### 3.5 Auth handling

| Harness | Mechanism | Evidence |
|---|---|---|
| Claude | (a) Native subscription login. Core spawns a tool-free `claude -p --no-session-persistence --tools "" --setting-sources user --settings '{"disableAllHooks":true}' --strict-mcp-config --mcp-config '{"mcpServers":{}}'` and sends a `claude_authenticate {loginWithClaudeAi:true}` control request. The user pastes the OAuth code into the app, and Core forwards it (`src/runtime/claude_login.rs:222-260`). (b) A one-year `claude setup-token` OAuth token plus plan, stored in `$STATE_DIR/claude-oauth-token`. (c) An API key in `$STATE_DIR/claude-api-key`. (b) and (c) are injected as `CLAUDE_CODE_OAUTH_TOKEN` + `CLAUDE_CODE_SUBSCRIPTION_TYPE`, or `ANTHROPIC_API_KEY` (only one of them) (`src/runtime/claude.rs:104-145`). A login fingerprint triggers restarts when credentials change (`:115-122`, `src/runtime/mod.rs:600-604`). | |
| Claude monitor | `claude auth status --json` at startup and every 5 min. Records `credentials` and `last_request` states. It "does not renew idle logins, read/copy token files" (`docs/observability.md:32-41`, `src/runtime/claude_auth.rs:1,18-19`). A Teleport probe does a real inference "Reply with exactly: OK" because "`auth status` can report logged in for a token Anthropic rejects" (`src/runtime/claude.rs:156-182`). | |
| Codex | Device code via app-server `account/login/start`; import of `auth.json` (64 KiB max, created only if absent, mode 0600); `account/read`, `account/rateLimits/read`. After a usage limit and an account switch, Core restarts quota-stopped sessions and sends `keep working` (`docs/harnesses.md:54-76`, `src/runtime/auth.rs`). | |
| Pi | The Mac helper copies missing providers from `~/.pi/agent/auth.json` (only after first-run consent). `!command`/`$VAR` keys are resolved on the Mac first. `POST /v1/accounts/pi/key` sets a single key. `/setup` copies `models.json`, `extensions/` and runs `pi install` for remote packages (`docs/harnesses.md:66-72`, `src/runtime/pi_auth.rs`). | |
| Cursor | Browser login on the VM with `NO_OPEN_BROWSER=1`, or an API key verified with `--list-models` (`docs/harnesses.md:116-118`). | |
| Shell terminals | The PTY shell gets the agents' Claude, Codex and Cursor logins as env (`src/runtime/terminal.rs:135-146`). | |

### 3.6 Skills injection
- **Claude selected skills.** Structured prompt `content` carries skill mentions (UTF-16 offsets, `origin: user|project`). Before each send, Core loads `SKILL.md` bodies from `~/.claude/skills` or `<repo ancestors up to .git>/.claude/skills`, reading under the agent's identity, and splices them in as literal text (`src/runtime/claude_skills.rs:29-47,146+`; `docs/harnesses.md:44-48`). A missing or oversize skill produces a `prompt_warning`.
- **Bundled Cloudroom skills.** `cloud-preview`, `cloud-mac`, `cloud-secrets`, `room-cli` and `cloud-computer-use` are compiled in (`include_str!`). They are printed via `--preview-skill` and similar flags (`src/main.rs:82-101`). `install/previews.py:105-113` copies them into the harness skill dirs without overwriting existing ones.
- **System instructions.** For Claude, a fixed `INSTRUCTIONS` string is appended to the system prompt: no native subagents, use `room-cli thread spawn`, no Fast mode, rewind is history-only (`src/runtime/claude.rs:13`). For Codex: `developerInstructions` (`src/runtime/codex.rs:76-78`). For Pi: `--append-system-prompt`. For ACP: prepended per prompt (`cursor::instructions`, `src/runtime/cursor.rs:173`).
- **Sync.** Skills, settings (whitelisted keys per harness) and MCP servers (one-way Mac to VM, rejected if they look secret-bearing or path-bearing) sync from the Mac (`src/sync/files.py:21-64`).

### 3.7 Version checks
- **Pi**: a shell-level `sort -V` check against `PI_MINIMUM = "0.85.1"` before `exec` (`src/runtime/pi.rs:17,56`).
- **Claude**:
  - startup fails unless `system/init` lists the required capability strings (feature detection, not a version number);
  - `claude_version::ensure` runs `claude install <version> --force` so the cloud Claude matches the Mac's version (ADR 0133), deferred while busy (`src/runtime/claude_version.rs:1-69`);
  - `DISABLE_AUTOUPDATER=1` (`src/runtime/claude.rs:130`);
  - `update.py` pins `2.1.281`.
- **Others**: auto-update is disabled by env or flag (`OPENCODE_DISABLE_AUTOUPDATE`, `FX_AUTO_UPGRADE=0`, `--disable-auto-update`). Docs record tested versions (Codex 0.154/0.155.1, Claude 2.1.278-2.1.281, OpenCode 1.18.34 / 2.0.22).

### 3.8 Event and stream parsing
- The driver enforces: one line at most 16 MiB (`MAX_LINE`), valid UTF-8, valid JSON. Otherwise it kills with the reason "invalid or oversized harness frame", "malformed harness JSON", and so on (`src/runtime/process.rs:16,186-192`).
- Adapters map native frames to `Record` kinds: `text_delta`, `thinking_delta`, `item_started`, `item_completed`, `tool_delta`, `tool_snapshot`, `native_event`, `native_record`, `usage`, `checkpoint` (`docs/api.md:58-60`). `native` keeps the raw line.
- **Two capture streams.** Live stdout events, plus a 250 ms tail of the harness's on-disk transcript (Codex rollout, Claude `projects/*.jsonl`, Pi session JSONL, Cursor SQLite). Native records are validated before journaling: "Malformed native history fails that session without writing invalid checkpoints" (`docs/session-lifecycle.md:55`).
- Files under agent control are opened through `files::open`. It canonicalizes the parent, refuses paths outside the root, then **spawns `python3 -I files.py` as the agent uid** to do `O_NOFOLLOW` opens and passes the FD back via `SCM_RIGHTS` (`src/runtime/files.rs:117-210`). This prevents a privileged Core from being tricked through symlinks into reading protected files.
- **Process generation check**: "A process-generation check rejects old replies/events" (`docs/harnesses.md:144`). `Handle::same_process` compares watch channels (`src/runtime/mod.rs:608-610`).

### 3.9 Resume and kill
- Resume: `check_resume_history` requires a non-empty native file under the harness home (`src/runtime/mod.rs:880-911`). `recover_records` replays native history into records (`:913-951`). `GET /v1/sessions/{id}/recovery` is a read-only preflight (`docs/session-lifecycle.md:44-50`).
- Kill path (`src/runtime/process.rs:149-266`):
  1. `request_shutdown` sets the stop flag. If the workload is frozen it writes `cgroup.kill` immediately (`:408-415`).
  2. The adapter's `close()` frames are written (Pi clears queues; ACP sends `session/cancel`).
  3. A 4 s `SHUTDOWN_GRACE`, then `child.kill()`.
  4. Then `Workload::stop` writes `cgroup.kill` and waits for `populated 0` (`src/runtime/linux.rs:205-218`).
  If cleanup is unconfirmed: "workload exit unconfirmed; refusing replacement".
- At startup, `reconcile` clears the whole validated cgroup subtree before admitting work (`src/runtime/mod.rs:1006-1011`). "Saved PIDs or similar command text never authorize killing a process" (`docs/session-lifecycle.md:42`).

---

## 4. Sandbox and isolation model

### 4.1 The actual boundary

| Layer | What it gives | What it does not |
|---|---|---|
| Service vs agent Linux users | Core runs as `cloudroom` and agents as `cloudroom-agent`, uid/gid != 0 (enforced in `as_agent`, `src/runtime/linux.rs:323-325`). The state dir, token and `core.env` are 0700/0600 and owned by the service. | **All agents on a host share one UID.** Agents can read each other's workspaces, harness homes, credentials and native transcripts, and can signal or ptrace each other (subject to the Yama ptrace setting). `docs/previews.md:79`: "Hostile code on the same Mac account or the shared VM agent account is not isolated per agent." |
| `PR_SET_NO_NEW_PRIVS` + empty capability sets | Children can't regain caps or use setuid binaries (`src/runtime/linux.rs:342-346`). | Skipped when `agent_sudo` is true (`:58`), i.e. in hosted sandboxes, where "agents keep sudo" (`docs/setup.md:207`). |
| cgroup v2 workload per harness process | Atomic freeze (`cgroup.freeze`) and kill (`cgroup.kill`), process counting, no escape via `setsid`/double fork (`src/runtime/linux.rs:18-24,63-108,169-218`). | **No resource limits**: no `memory.max`, `pids.max` or `cpu.max` writes anywhere (they are only *read* for metrics, `src/observability/system.rs:105,296`). The disk is guarded by polling, not quotas (`docs/storage.md:18`). |
| VM/sandbox per agent (hosted) | The real security boundary. "If their agents may have sudo, the container is the security boundary anyway" (`docs/storage.md:42`). The computer-use module says "The sandbox is the boundary" (`src/computer_use/mod.rs:3-4`). | Lives in the closed web app; not in this repo. |
| Network | Nothing. There are no netns or egress rules. Agents have full outbound internet. The only iptables use is the update-time API gate (`install/update.py:164-175`). The API itself is loopback-only by default (`src/config.rs:43-62`). | |
| Harness permission modes | Every harness runs in **full bypass**: Claude `--dangerously-skip-permissions --permission-prompts none` with an asserted `bypassPermissions`; Codex `approvalPolicy:"never", sandbox:"danger-full-access"`; ACP `allow_once` auto-select; Hermes `YOLO_MODE`; fx `full-access`. | Native harness sandboxes (Codex seatbelt/landlock, Claude sandbox) are deliberately **off**. |

### 4.2 Filesystem layout

| Path | Owner / mode | Purpose |
|---|---|---|
| `/usr/local/lib/cloudroom/cloudroom` | root 0755 | Binary (also symlinked as `/usr/local/bin/room-cli`, `install/previews.py:112-113`) |
| `/etc/cloudroom/core.env` | cloudroom 0600 (dir root:cloudroom 0750) | Token, settings |
| `/etc/cloudroom/storage.json` | protected, not agent-writable | `agent_uid`, `agent_gid`, `cache_dir`, `cgroup_root=/sys/fs/cgroup/system.slice/cloudroom.service/agents`, thresholds (`install/configure.py:40-41`) |
| `/var/lib/cloudroom/history` (`CLOUDROOM_STATE_DIR`) | cloudroom 0700 | Journal records, snapshot, `claude-oauth-token`, `claude-api-key`, `environment`, diagnostics, `harness-diagnostics/stderr*.jsonl` (0600), workspaces registry, preview registry |
| `/home/cloudroom-agent` | agent 0700 | `.claude`, `.codex`, `.pi/agent`, `.cursor`, `.local/share/opencode`, ... |
| `/code`, `/code/<name>` | agent 0700 | Workspaces |
| `/var/cache/cloudroom-agent` | agent 0700, recreated by `ExecStartPre` | npm cache (safe-cleanup target) |
| `/run/cloudroom/{mac,preview}.sock` | dir 0711, sockets 0666 | Agent-only API; authorization by peer UID (`src/mac/mod.rs:478`, `src/preview/mod.rs:475`) |

### 4.3 Secrets handling (`src/secrets/mod.rs`)
- An agent runs `room-cli secret request NAME... --write-env PATH`. Over `mac.sock`, Core:
  - checks the caller is the agent UID;
  - walks the peer PID's `/proc/*/stat` ancestry, up to 64 levels, to find which harness process (and so which session) asked (`src/secrets/mod.rs:107-125`, `src/session/thread.rs:121-134`);
  - records a `secret_request` (names and descriptions only) so the app shows a form;
  - holds a oneshot until the app `POST /v1/sessions/{id}/secrets/{request}` delivers the values.
- The CLI then writes a 0600 dotenv and reconciles add, update and unchanged entries (`src/secrets/mod.rs:301-430`).
- Names are limited to 1-50 unique values; each value is at most 16 KiB (`:26-93`).
- The bundled skill tells agents never to `cat` the file afterwards (`src/secrets/cloud-secrets/SKILL.md`). That is advisory only.
- Values never go into journal records. They do pass through Core memory.

### 4.4 Process supervision
- systemd `Restart=on-failure` or the `sandbox-start.sh` loop.
- Inside Core:
  - one tokio task per harness (§3.9);
  - the startup semaphore;
  - the idle sleeper, which checks every 5 s and puts a session to sleep after 30 min of no activity (`src/session/sleep.rs:4-6`). A session stays awake while it has a running turn, queue, busy children, or *extra processes in its cgroup beyond the launch count* (`docs/session-lifecycle.md:25`; `src/session/sleep.rs:8-60`);
  - the storage guard loop;
  - the uploader;
  - the auth monitor (`src/lib.rs:74-84`).
- Stderr is drained continuously in 8 KiB reads, keeping only the last 16 KiB. It is saved privately at exit and never enters records or API (`src/runtime/process.rs:16-68`; `docs/observability.md:43-61`).
- **Terminals** (`src/runtime/terminal.rs`): a PTY shell per `id`. It is reached by HTTP upgrade (`Upgrade: websocket`, but with **custom raw framing**: kind byte + BE u32 length + data), keeps a 1 MiB replay buffer, and reconnects with `since` (`docs/api.md:80`, `src/runtime/terminal.rs:1-4`).

### 4.5 Command Guard (`src/runtime/command_guard.rs` + `command-guard.mjs`)
- **Regex accident prevention, explicitly "not a sandbox"** (`docs/harnesses.md:103-105`; `command-guard.mjs:3`). Rules (`command-guard.mjs:6-24`):
  - `rm` of `/`, `~`, `$HOME`, `/home/*`, `/Users/*`, `/root`;
  - `--no-preserve-root`;
  - `mkfs`;
  - `diskutil erase*`;
  - `dd of=/dev/sd*` and `> /dev/sd*`;
  - `gh repo delete`;
  - the classic fork bomb.
- It fails open: "a guard error allows the command" (`docs/harnesses.md:100-101`), and the hook ends in `|| true` (`command_guard.rs:33`).
- **Injection trick.** Core runs `/bin/sh -c 'guard=$(node --input-type=module -e "$PREPARE" DIR claude|codex); exec harness <flag> "$guard"'`. The prepare script writes a content-addressed hook file (`sha256.mjs`, 0600) into the harness home and prints either Claude `--settings` JSON with `hooks.PreToolUse` (matcher `Bash`) or a Codex `-c hooks={...}` TOML including a **pre-trusted `hooks.state` hash**, so Codex doesn't prompt to trust the hook (`command_guard.rs:18-62`; `command-guard.mjs:43-56`). There is no persistent wrapper process.
- Pi gets the same `checkCommand` source inlined into its extension on the `tool_call` event (`pi-context.ts:8-12`).
- Cursor and the other ACP harnesses get no guard (`docs/harnesses.md:124`).
- The JS file must stay byte-identical with the GUI copy (`docs/harnesses.md:110-112`).

---

## 5. Session lifecycle (`src/session/*`, `docs/session-lifecycle.md`)

### 5.1 States
`pending`, `starting`, `resuming`, `starting_turn`, `running`, `interrupting`, `closing`, `idle`, `sleeping`, `suspended`, `rewinding`, `closed`, `failed`, `process_lost`, `waiting_for_files`, `saved_history_only` (`docs/api.md:64`).
For the dashboard these are collapsed into queued, working, waiting, stopped, failed and unknown (`docs/dashboard.md:37`, `src/session/mod.rs:151`).

### 5.2 Receipts and the queue
- Receipt lifecycle: `accepted` → `delivered` → one of `completed`, `interrupted`, `failed`, `unknown`, `unknown_after_restart` (`docs/api.md:11`). Uncertain work "is never resent" (`docs/session-lifecycle.md:40`).
- "Acceptance and queue membership come from one fsynced receipt" (`:33`).
- Queue editing:
  - `edit` uses `expected_revision`, i.e. optimistic concurrency (`docs/api.md:36`);
  - `cancel`, `reorder`, `steer` (in-turn guidance), `interrupt` (current turn only; the queue continues);
  - `stop`/`resume` pause the queue;
  - `close` fails the unrun receipts.
- State is rebuilt by replaying journal records through `state.rs::apply` (660 lines), starting from the snapshot (`src/session/state.rs:74-80`).

### 5.3 Restart and recovery
- Normal shutdown leaves sessions in `suspended`. On restart, a session relaunches only if it has queued work or activity in the last 30 minutes (`docs/session-lifecycle.md:28`; `src/session/sleep.rs` `restores_awake`).
- An unexpected exit gets **one** recovery attempt after confirmed cleanup. A failed native resume becomes `process_lost`. There is "no restart loop or fresh-conversation fallback" (`docs/session-lifecycle.md:38`).
- An explicit retry is `POST /resume` with a new `request_id`, after preflight (`:50`).

### 5.4 Sleep
- Covered in §4.4.
- `POST /sleep` sleeps on demand. The next prompt, a Teleport update, or `resume` wakes the session with the same native conversation (`docs/session-lifecycle.md:23-28`).

### 5.5 Children, side chats and forks (`src/session/children.rs`, `thread.rs`)
- `POST /v1/sessions` with `parent_session` + `prompt` creates `cr_child_{request_id}`. It shares the parent's folder, guard and system prompt.
- Each finished child turn queues a `notice_…` prompt to the parent quoting up to 4,000 chars of the reply (`src/session/children.rs:156`; `docs/api.md:25`).
- Allowed child harnesses: Codex, Claude, Pi, OpenCode, Hermes, Devin (`src/session/children.rs:140-147`).
- **"Own sandbox" children** (ADR 0229), via `room-cli thread spawn`:
  1. Core records a `child_request` and **waits up to 60 s for the app** to start the child in a new sandbox with a code copy on its own branch (`src/session/thread.rs:3-4,33-41`).
  2. If no answer arrives, it falls back to running the child locally, and keeps sharing the sandbox for 5 minutes.
  3. Each request's outcome is decided once, so a late app answer gets 409 (`docs/api.md:26`).
- Native subagents are disabled (Claude `Agent`/`Task` are disallowed, the `SubagentStart` hook is denied). Delegation is rerouted to managed children through the in-process MCP `delegate` tool (Claude) or the `cloudroom_subagent` Pi tool.
- **Side chat (fork)**: `fork:{session, before?, last_turn_id?}` copies a Claude/Codex conversation and leaves the source read-only (`docs/api.md:27`; `src/runtime/mod.rs:174-180,383-421`).

### 5.6 Teleport (`src/session/teleport.rs`)
- "A transfer is staged before one durable activation makes it executable" (`:1`). It moves a local Mac conversation into the cloud.
- The `Manifest` holds the harness, native id, model, provider, reasoning, guard, workspace, a file list (`path`, `size`, `sha256`, `kind: native|context|project|attachment`, `executable`, `symlink`), a `handoff` prompt, and queued prompts (`:16-89`).
- The flow is `prepare` → chunked `upload` per file index (1 MiB body limit per call, `src/api/mod.rs:71-74`) → `activate`.
- `teleport/check` probes the exact model (Claude inference probe) before anything moves (`src/runtime/mod.rs:124-135`).

### 5.7 Outbox, journal and history
- §2.4 covers these.
- `history_upload` and `history_fault` diagnostics are recorded (`docs/observability.md:13`).

### 5.8 Automation and reports
- `room-cli automation create --cron|--at|--in ...` is forwarded to the website. The website runs a per-minute cron, wakes the sandbox and sends the prompt. "Core never parses cron" (`src/session/automation.rs:1-3,19`).
- `room-cli feedback MESSAGE` sends the report to the website, "straight to David" (`src/session/report.rs:1-2`).

---

## 6. Workspace, git, file transfer, previews, Mac bridge

### 6.1 Git and worktrees
- **No git worktrees.** The only hit for "worktree" is `"worktreesSupported":false` in the sync view (`src/sync/mod.rs:213`). The only git invocations Core makes are read-only: `symbolic-ref --quiet --short HEAD` and `rev-parse --verify HEAD` for `GET /sessions/{id}/workspace` (`src/workspace/mod.rs:255-286`).
- Workspaces are "cloud folders":
  - `workspace:"PROJECT_ID"` creates an empty directory under `/code`;
  - "No Git repository, local source folder, archive upload, or sync worker is required. The agent can clone a repository ... after starting" (`docs/setup.md:211`);
  - `workspace:"root"` means `/code` itself.
- Isolation of parallel work comes from **separate sandboxes**, not separate checkouts. Hosted children get "a copy of your code (commits and uncommitted changes), on its own branch. It doesn't see your later edits; share work through Git" (`src/session/thread.rs:34`). The copy is done by the Mac app, using `POST /v1/vm/run/raw` bulk copies, which are blocked under disk pressure (`src/mac/mod.rs:521-530`), or Teleport. The agent waits with `room-cli files wait`, which polls a `<folder>.cloudroom-files` status file written outside the repo "so Git never sees it" (`src/workspace/files.rs:1-3`).
- Project files no longer sync: "Project files, unpublished Git changes, and project `.env` files no longer sync. Use Git or explicit message attachments" (`docs/setup.md:221`).

### 6.2 Attachments
- `POST /sessions/{id}/attachments?...` takes a raw body: images up to 10 MiB, files up to 25 MiB. Chunked `upload_parts` uses at most 8 MiB per part. Clients use 4 MiB because "some sandbox proxies drop requests over about 8 MB" (`docs/api.md:45-46`).
- Attachments are written under the agent identity via `files.py` (`op: attach`).

### 6.3 Previews (`src/preview/mod.rs`, `docs/previews.md`)
- The agent runs `room-cli preview 3000`. The registration is allowed only if the port is non-privileged and its IPv4 loopback listener is **owned by the agent UID** (`docs/previews.md:72`).
- **Mode A: restricted SSH.**
  - A dedicated `cloudroom-preview` account with `AllowTcpForwarding local`, `PermitOpen 127.0.0.1:*`, `PermitTTY no` (`install/previews.py:67-79`).
  - Keys are checked by an `AuthorizedKeysCommand`, `cloudroom --preview-authorized-keys` (`src/main.rs:102-107`).
  - Revocation kills SSH sessions via pidfds using `CAP_KILL` (`docs/previews.md:77`).
- **Mode B: tunnel.** `GET /v1/previews/PORT/tunnel?device=ID` with `Upgrade: websocket` (or a fallback `cloudroom-tunnel`). It is a **raw byte pipe after `101`, without WebSocket framing**: "the `websocket` name only gets it through proxies that relay nothing else" (`docs/previews.md:20`).
- The Mac helper exposes `http://p3000-<id>.localhost:PORT` with Host and Origin checks (`docs/previews.md:14,74`).

### 6.4 Mac bridge (`src/mac/mod.rs`, `transfer.rs`)
- This is not macOS support for Core. It is **remote control of the user's real Mac from cloud agents** (ADR 0113, `src/mac/mod.rs:1`).
  - The agent calls `room-cli mac run 'CMD' [--write]` or `pull`/`push` (2 GiB compressed limit) over `mac.sock`.
  - Core queues a job. The Mac helper consumes `GET /v1/mac/jobs` (SSE), must ack within 10 s, and posts results to `/v1/mac/results/{id}` (hex-encoded stdout/stderr, 16 MiB each, `part` reports for big output) (`src/mac/mod.rs:36-52,202-316`).
  - The user's access mode (Off, Read-only, Ask first, Full) is enforced on the Mac side (`src/mac/cloud-mac/SKILL.md`).
- In the reverse direction, `POST /v1/vm/run` runs `bash -lc CMD` on the VM as the agent, inside a storage-guard workload. It is still allowed when storage is blocked, as an "emergency way in" (`src/mac/mod.rs:515-585`).

---

## 7. HTTP API surface (`src/api/mod.rs:27-110`, `docs/api.md`)

All of `/v1/*` uses the bearer token (or `X-Cloudroom-Token`) and `Cache-Control: no-store`. The default JSON body limit is 64 KiB, with per-route overrides.

| Group | Endpoints |
|---|---|
| Health | `GET /v1/health`, `GET /v1/ready`, `GET /v1/capabilities`, `GET /v1/dashboard`, `POST /v1/drain {hold}` |
| Sessions | `GET/POST /v1/sessions`, `GET /v1/sessions/{id}`, `GET .../requests/{request}`, `GET .../workspace`, `GET .../recovery`, `POST .../{prompts,edit,cancel,reorder,steer,compact,goal,rewind,attachments,interrupt,stop,sleep,detach,resume,close}`, `POST .../children/{request}` (app answers child request), `POST .../secrets/{request}` |
| Events | `GET .../events?after=N` (256/page), `GET .../stream?after=N` (**SSE**, event `record`, `id`=sequence, `Last-Event-ID`) |
| Accounts | `/v1/accounts/codex{,/login,/import,/switched,/cancel}`, `/v1/accounts/claude{,/version,/{login,cancel,complete,token}}`, `/v1/accounts/cursor{,/{login,cancel,key}}`, `/v1/accounts/pi{,/import,/setup,/key}` |
| Workspaces / sync | `GET /v1/workspaces/{id}`, `GET /v1/settings`, `POST /v1/sync`, `GET /v1/sync/{id}`, `GET|PUT /v1/sync/{id}/file` |
| Teleport | `POST /v1/teleports` (16 MiB), `POST /v1/teleports/check`, `GET /v1/teleports/{id}`, `POST .../activate`, `POST .../cancel`, `POST .../files/{index}` (1 MiB) |
| Previews | `GET/POST /v1/previews`, `POST /v1/previews/{host,device,report}`, `DELETE /v1/previews/device/{id}`, `GET/DELETE /v1/previews/{port}`, `GET /v1/previews/{port}/tunnel` (raw upgrade) |
| Terminals | `GET /v1/terminals/{id}?cols&rows&session&since&command` (raw-framed upgrade), `DELETE /v1/terminals/{id}` |
| Mac / VM | `GET /v1/mac/jobs` (SSE), `POST /v1/mac/results/{id}`, `POST /v1/vm/run`, `POST /v1/vm/run/raw` |
| Agent socket (`/run/cloudroom/mac.sock`, peer-UID auth, no token) | `/jobs`, `/jobs/{id}`, `/status`, `/secrets`, `/title`, `/reasoning`, `/archive`, `/children[/{id}[/messages|/stop|/archive]]`, `/report`, `/automation`, `/computer-use/event` (`src/mac/mod.rs:479-487`, `src/session/thread.rs:108-118`) |
| Agent socket (`preview.sock`) | `/previews`, `/previews/{port}` (`src/preview/mod.rs:477-478`) |

Conventions:
- Commands are async: 202 means saved, not done. `request_id` (1-64 chars `[A-Za-z0-9_-]`) is an idempotency key. Reuse with different content gives `request_conflict`.
- Errors are `{"error","code"}` with stable codes. Some 409s are temporary (`docs/api.md:7-12,85-94`).
- Capabilities are feature flags: "a missing flag means unsupported" (`docs/api.md:12`, `src/lib.rs:19-58`).
- There is **no real WebSocket** anywhere. Streaming is SSE plus raw HTTP-upgrade byte pipes.

---

## 8. Cross-platform story
- **Core is Linux-only.** Evidence:
  - `std::os::unix::*` everywhere;
  - `/proc` scanning (`src/runtime/linux.rs:241-297`; `src/secrets/mod.rs:107-125`);
  - cgroup v2 files;
  - `SO_PEERCRED` (`src/preview/mod.rs:494-500`);
  - `tokio::signal::unix` in `serve` (`src/lib.rs:88-91`);
  - `/bin/ps` (`src/runtime/mod.rs:1017`);
  - `as_agent` returns "disk protection requires Linux" on other OSes (`src/runtime/linux.rs:354-363`).
- Without a storage policy (`UNPROTECTED_TEST_MODE`) it may run on macOS for dev tests. Hints: the Homebrew node path in `command_guard.rs:45` and `files.rs` handling of macOS `/var` aliases (`src/runtime/files.rs:131`). It still won't compile on Windows (unix-only imports).
- **No Windows support at all.** No `cfg(windows)` code exists.
- The "mac" module (§6.4) and Python helpers (`src/sync/client.py`, `src/preview/client.py`, which use launchd/plist) run on the **user's Mac as a client**. The desktop app is "for Apple Silicon Macs (Linux alpha)" (`README.md:37`).
- Hosted "Local threads" (agents on the Mac itself) are handled by the closed GUI, not by this repo.

## 9. Provider abstraction
- **None in this repo.** Core is a single-host daemon. It has no interface to create, destroy or snapshot VMs. The "store" is a label plus a bearer to one website.
- Things Core offers to an outside provisioner:
  - `CLOUDROOM_INSTANCE`, a sandbox name that prefixes diagnostic run ids (`src/config.rs:190-206`);
  - `POST /v1/drain {"hold":true}`, which refuses new work and reports whether anything still runs, before a stop (`docs/setup.md:207`);
  - idle sleep at 30 min, plus terminal activity reported on the dashboard to keep a sandbox awake (`docs/dashboard.md:46`);
  - an image-level `/etc/cloudroom/image.env` read by `sandbox-start.sh`;
  - `configure.py` used by "Full managed setup" (`docs/storage.md:32`);
  - "The public SSH host key is read at pairing time, not copied from a template's machine identity" (`docs/previews.md:39`). This implies template images.
- The external history API is a small, pluggable HTTP contract ("Any server that answers the same five calls can stand in for it", `docs/setup.md:76`). The five calls are `GET /api/core/records`, `POST /api/core/uploads` (presigned PUT links), `POST /api/core/diagnostics`, `POST /api/core/report` and `POST /api/core/automation` (`tests/fake_api.py:40-70`). Auth is `Authorization: Bearer <CLOUDROOM_TOKEN>` plus `X-Cloudroom-Store` and `X-Cloudroom-Instance` (`src/session/history.rs:61-70`). **The same token authenticates inbound API calls and outbound website calls.**
- The sandbox vendor is not named. Hints are "sandbox proxies" that rewrite `Authorization` or drop bodies over 8 MB, and "containers without cgroups". The architecture says "cloud · our hosting · US West".

## 10. Tests and observability (brief)
- **Rust tests:**
  - `tests/adapters.rs` (5) and `tests/runtime.rs` (14+) drive real `Handle`s against **fake harness binaries written in Python** (`tests/core_fixture.py`, 1,155 lines; `tests/pi_fixture.py`) by pointing `HarnessConfig.binary` at them (`tests/adapters.rs:31-57`);
  - `tests/journal.rs` (killed writer, gaps fail closed);
  - `tests/terminal.rs`, `tests/storage.rs`;
  - about 17 inline `#[test]`s in `src/`, for example the disk top-writer kill (`src/runtime/linux.rs:390-439`).
- **Python E2E:**
  - `core_e2e.py` (`--foundation`, `--fixture`, real Codex);
  - `pi_e2e.py`, `pi_http.py`, `cursor_http.py`;
  - `storage_e2e.py --disposable --mixed` (tmpfs, real cgroups, sudo, CI creates `cr-service-test`/`cr-disk-test` users);
  - `disk_writers.py` (privileged container);
  - `previews_ssh.py --disposable`, `sync_e2e.py`, `workspaces.py`, `install.py`.
- **CI** (`.github/workflows/ci.yml`): ubuntu-24.04, actions pinned by SHA, `persist-credentials: false`, then fmt, clippy `-D warnings`, test and build, then the disposable sudo e2e suites and `node --test integrations/bb/client.test.ts`.
- The docs repeatedly say fixtures are "not real-inference evidence" (`docs/harnesses.md:52`).
- **Observability** (`docs/observability.md`):
  - one internal module with local JSONL, 8 MiB rotation and 0600 permissions;
  - uploads every 5 min, 1,024-record queues, overflow counted;
  - kinds: `api`, `api_summary`, `agent_start`, `agent_exit`, `auth_health`, `computer_use`, `history_upload`, `resources` (10 s, `/proc` or cgroup), `cpu_minute` (top-5 programs, `idle_burn`), `storage_stale`, `diagnostics`;
  - an explicit no-PII rule: no prompts, paths or URLs;
  - raw stderr is kept separately and protected (§4.4);
  - `X-Cloudroom-Diagnostic-Id` response headers correlate requests.

---

## 11. Assessment for Forge

### 11.1 Strengths
1. **Durability semantics are excellent and explicit.** Idempotent `request_id`s, receipts fsynced before 202, "claim before spawn", `unknown_after_restart` instead of replay, one recovery attempt with no loops, a journal gap check, and an exact-batch re-upload. This is the most transferable part (`src/session/mod.rs:654-944`, `src/session/outbox.rs`, `docs/session-lifecycle.md`).
2. **A clean split between process driver and protocol codec** (`process.rs` vs the `Adapter` trait). The driver owns bounded framing, timeouts, pause-aware RPC deadlines (`src/runtime/linux.rs:365-388`), shutdown escalation, stderr tail and cgroup cleanup, so adapters stay small (Hermes 106 lines, Devin 135).
3. **Harness hardening at the boundary.** Startup asserts the harness actually applied the requested mode (Claude `permissionMode`, capability strings, session identity, model). Unmanaged native subagents are refused by failing the stream. Auto-updaters are disabled and versions pinned. Interactive tools are disallowed so harnesses ask in plain chat.
4. **Native-history-first.** Core tails each harness's own transcript and resumes with native `--resume`/`thread/resume`/`session/load`, not by re-feeding prompts. Validation of identity, workspace and model on resume prevents silently starting a fresh conversation.
5. **Privileged-but-careful file access.** It opens agent-controlled paths as the agent uid in a helper and passes back the FD via `SCM_RIGHTS` (`src/runtime/files.rs:117-210`). This is a neat confused-deputy defense when the orchestrator has more privilege than the agents.
6. **Agent-to-orchestrator channel without tokens.** A Unix socket with `SO_PEERCRED` UID check plus a PID-ancestry lookup to identify the calling session (`src/session/thread.rs:121-134`). Agents never hold the admin token.
7. **cgroup v2 per workload** for atomic freeze and kill and accurate "background jobs keep it awake" signals. A disk guard that freezes and kills the top writer instead of the harness.
8. **Small dependency surface**, a tiny Apache-2.0 TS client, a feature-flag capability discovery, and stable error codes.

### 11.2 Weaknesses
1. **Linux-only and single-host.** No provider interface; the VM orchestration is in a closed web app. Nothing reusable for Windows or macOS hosts.
2. **No per-agent isolation on a host.** One shared `cloudroom-agent` UID. Isolation is outsourced to "one VM per agent", which Forge can't assume on a laptop.
3. **No resource limits** (memory, pids, cpu) despite owning cgroups. No network policy. All harnesses run in full bypass mode.
4. **The trait is too low-level.** The verbs are `match` arms over 8 kinds in `Handle` (`src/runtime/mod.rs:642-854`), so a new harness touches the enum, config and many arms. Event `data` is not harness-neutral (`docs/api.md:62`).
5. **No git worktree model.** Parallelism means full copies in separate sandboxes. Merge-back is "share work through Git", with no orchestration of branches, merges or conflicts.
6. **Docs drift.** The PostgreSQL docs and readiness text are stale after ADR 0232/0237. About 240 ADRs referenced in comments are private.
7. **Heavy coupling to the closed Cloudroom app and website**: teleport, children-in-own-sandbox, automations, feedback "straight to David" (`src/session/report.rs:1`).

### 11.3 Security risks observed

| Risk | Evidence | Severity (for a multi-agent host) |
|---|---|---|
| Credentials exposed to agent processes via env. `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and `CURSOR_API_KEY` are set in the harness env, so every tool subprocess (same UID) can read `/proc/self/environ` or `env`. The comment "Only core can read this file" protects the file, not the secret. | `src/runtime/claude.rs:104-145`, `src/runtime/cursor_auth.rs:18-43`, `src/runtime/terminal.rs:135-146` | High (exfiltration by a prompt-injected agent) |
| Shared agent UID: agents read each other's repos, transcripts and harness logins. | `docs/previews.md:79`, `install/install.sh:69` | High unless one VM per agent |
| Full-bypass permissions everywhere, plus ACP `allow_once` auto-approval. | `claude.rs:65-67`, `codex.rs:73`, `cursor.rs:559-576`, `hermes.rs` (`HERMES_YOLO_MODE`) | High (by design; they accept it) |
| Unrestricted egress, no netns or firewall. | none found (grep) | Medium-High |
| Command Guard is regex-only and fails open (`|| true`). It is trivially bypassed (e.g. `find / -delete`, `python -c`). | `command_guard.rs:33`, `docs/harnesses.md:100-105` | Low as a control (honestly labelled) |
| The privileged service holds `CAP_SETUID/SETGID/DAC_READ_SEARCH/KILL` (ADR 0001). A Core RCE equals reading any file and becoming any non-root user. | `install/cloudroom.service:17-18` | Medium |
| Plaintext HTTP. The bearer may arrive in a custom header; the same token is used outbound to the website, so whoever runs the website can drive the core. | `src/config.rs:43-62`, `src/api/mod.rs:470-498`, `src/session/history.rs:61-70` | Medium (architectural trust) |
| The installer's checksum comes from inside the same downloaded tarball (no signature). | `install/install.sh:34-50` | Low-Medium (supply chain) |
| Agent sockets are 0666. Auth relies on peer UID, which is correct, but any local user can connect and probe. | `src/mac/mod.rs:478`, `src/preview/mod.rs:475` | Low |
| `mac run` gives cloud agents a shell on the user's real Mac (gated by a user-chosen mode). A prompt-injected cloud agent gets a path to the laptop. | `src/mac/cloud-mac/SKILL.md`, `src/mac/mod.rs:1` | High if enabled at "Full" |
| The co-author-stripping git hook rewrites commit messages to remove AI attribution by default (`strip_ai_co_authors` default true). | `src/runtime/mod.rs:311-332`, `src/runtime/mod.rs:362` | Policy/ethics concern, not a vulnerability |

### 11.4 Patterns worth copying into Forge

| # | Pattern | Where | How it maps to Forge |
|---|---|---|---|
| 1 | **Request-id idempotency + fsynced receipt before 202 + "claim before spawn" + never resend uncertain work** (`unknown`/`unknown_after_restart`) | `src/session/mod.rs:668,714-818,882-883`; `docs/session-lifecycle.md:30-42` | Ticket and run state machine: persist the claim before `WorkerDriver.start()`. Settle uncertain runs as `unknown`, never auto-retry. |
| 2 | **Two-layer adapter: a generic process driver + a per-harness codec trait** (validate/encode/receive/response/respond/capture/close/closed/clean_exit) | `src/runtime/mod.rs:280-309`, `src/runtime/process.rs` | Put framing, timeouts, stderr tail and kill escalation in one shared driver. Put the higher-level verbs (`start`/`send`/`steer`/`interrupt`/`compact`/`resume`) **on the interface too**, unlike Cloudroom's match arms. |
| 3 | **Assert the harness applied what you asked** (permission mode, capability list, session id, model) and fail closed on mismatch | `src/runtime/claude.rs` ~`:806-833` | Contract-test this in every Claude/Codex/Pi driver. |
| 4 | **Exact CLI recipes** (§3.4): Claude stream-json control protocol flags, Codex `app-server --listen stdio://` JSON-RPC methods, Pi `--mode rpc` + extension, ACP `initialize`/`session/new\|load`/`set_config_option`/`request_permission` | §3.4 tables | A ready reference for drivers. Note Cloudroom avoids the Claude SDK and speaks the raw control protocol. |
| 5 | **Tail native transcripts + native resume** instead of replaying prompts; validate identity, cwd and model on resume; never create a missing session file | `codex.rs:615-700`, `pi.rs`, `docs/harnesses.md:140-144` | Worker resume across Forge restarts. |
| 6 | **Bounded everything**: 16 MiB line cap, 16 KiB stderr tail kept privately, 256-record pages, body limits per route | `process.rs:16-68`, `api/mod.rs` | Driver and HTTP boundaries. |
| 7 | **Pause-aware RPC deadlines**: a frozen workload doesn't burn its timeout | `src/runtime/linux.rs:365-388` | Useful if Forge ever suspends workers. |
| 8 | **Content-addressed, injected safety hooks** without a wrapper process: `sh -c 'guard=$(node -e PREP); exec harness --settings "$guard"'`, plus a pre-trusted Codex hook hash | `src/runtime/command_guard.rs:18-62`, `command-guard.mjs:43-56` | Forge's `admit()` policy hook could be injected the same way into Claude `PreToolUse` / Codex hooks / Pi `tool_call`, failing **closed** rather than open. |
| 9 | **Reroute native subagents to orchestrator-managed children** (disallow `Agent`/`Task`, deny the `SubagentStart` hook, expose an MCP `delegate` tool over the control channel) | `claude.rs:79-85,~622-683,~769-772`, `pi-context.ts:52-79` | Keeps every unit of work visible to the Director. |
| 10 | **Agent-to-orchestrator Unix socket with `SO_PEERCRED` + PID ancestry** to attribute calls to a session without handing agents a token | `src/session/thread.rs:121-134`, `src/secrets/mod.rs:107-125` | On Linux/macOS (macOS has `LOCAL_PEERCRED`/`getpeereid`). On Windows use a named pipe with `GetNamedPipeClientProcessId`. |
| 11 | **Open agent-controlled paths as the agent and pass the FD back** (confused-deputy defense) | `src/runtime/files.rs:117-210` | Whenever the orchestrator reads worktree files with more privilege than the worker. |
| 12 | **Secret request flow**: the agent asks by name, the user fills a form out of band, values are written 0600 to a dotenv and never journaled | `src/secrets/mod.rs` | Forge's `SecretStore` UX. |
| 13 | **Disk guard**: warn/pause/resume hysteresis, then kill the top-writing tool group, never the harness | `docs/storage.md:5-18`, `src/runtime/linux.rs:129-168` | Long-running workers filling disks. |
| 14 | **Capability flags + stable error codes + "missing flag means unsupported"** | `src/lib.rs:19-58`, `docs/api.md:85-94` | Forge's `driver.capabilities()` and HTTP API. |
| 15 | **Fake harness binaries for tests** (a Python script speaking the protocol, plugged into the binary path) | `tests/adapters.rs:31-57`, `tests/core_fixture.py` | Contract tests per `WorkerDriver` without inference. |
| 16 | **Disable harness auto-update and pin/verify versions** (`DISABLE_AUTOUPDATER`, `OPENCODE_DISABLE_AUTOUPDATE`, Pi `sort -V` min check) | §3.7 | Driver launch env. |
| 17 | **SSE with `id`=sequence and `Last-Event-ID` resume** | `src/api/mod.rs:1365-1410` | Forge's run event stream to the UI. |

### 11.5 Patterns to avoid (for Forge's goals)

| # | Anti-pattern | Why / Forge alternative |
|---|---|---|
| 1 | Linux-only primitives (`/proc`, cgroups, `SO_PEERCRED`, raw `extern "C"` syscalls) in the core path | Forge must run on Windows/macOS/Linux. Put containment behind a `Sandbox`/`ProcessContainer` port with per-OS adapters: Windows Job Objects (+ AppContainer/restricted tokens), macOS process groups + `sandbox-exec`/containers, Linux cgroups/bubblewrap. |
| 2 | Shared agent UID across all agents | Use per-worktree or per-run isolation (per-run OS user or container, or at least distinct harness homes) so one worker can't read another's credentials or worktree. |
| 3 | Credentials in the harness environment (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`) | Readable by every tool call. Prefer harness-native credential files in an isolated per-run home, or a broker/proxy that injects auth outside the sandbox. |
| 4 | Full bypass permissions + auto `allow_once` with only a fail-open regex guard | Forge's "one door" `admit()` should be enforced on the orchestrator side (hook/MCP permission callback) and **fail closed**. Keep native harness sandboxes on where available. |
| 5 | Copy-the-whole-repo-into-a-new-VM for parallelism, with no git orchestration | Forge's model (git worktrees + `merge()` door) is cheaper and auditable. Keep the branch-per-worker idea, but make merge an orchestrator responsibility. |
| 6 | Verbs as `match kind` arms outside the adapter | Adding a harness should be a new folder only. Put all verbs on the driver interface and declare capabilities. |
| 7 | Harness-specific `data` in public events | Normalize to `RunEvent` at the driver boundary. Keep `native` raw alongside for debugging only. |
| 8 | One token used inbound and outbound (to the website) | Separate credentials per direction and per audience. |
| 9 | Plaintext HTTP with TLS delegated to a proxy, plus a custom-header fallback | For a local orchestrator, bind loopback only. Any remote access should be TLS/mTLS by default. |
| 10 | Behaviour switched by many env vars + filesystem auto-discovery of harnesses | Conflicts with Forge's config-as-data rule (code.md rule 9). Discovery is fine as a *suggestion* that seeds DB config, not as the source of truth. |
| 11 | Stripping AI co-author trailers from commits by default | Provenance should be preserved, or at most be an explicit user setting. |
| 12 | Unsigned release checksums carried inside the same tarball | Sign releases (minisign/cosign) if Forge ships an installer. |

### 11.6 License and reuse
- `LICENSE` is the full Apache License 2.0 text (201 lines). `Cargo.toml:6` says `license = "Apache-2.0"`, and the TS client `integrations/bb/package.json` also says Apache-2.0. `README.md:55` reads "Licensed under Apache 2.0" and "pre-release software".
- **Reuse is permitted**: copying, modification, redistribution and commercial use, including porting snippets such as the Claude flag set, the Codex app-server method list, the Command Guard regexes, or the fd-passing helper idea. Obligations:
  - include the license;
  - keep any NOTICE content (none present at this commit);
  - state changes in modified files;
  - don't use the Cloudroom trademarks.
  The Apache patent grant applies. A TypeScript port of design patterns needs no attribution, but copied code (for example `command-guard.mjs`) should carry the Apache header and attribution.
- Caveat: the desktop app, website and ~240 referenced ADRs are not in this repo, and their licenses are unknown.
