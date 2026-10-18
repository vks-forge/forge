---
title: 'Forge code map: where a sandbox boundary plugs in'
id: forge-sandbox-seams-map
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
summary: 'Read-only map of Forge (main @226a29b + working tree, 2026-10-16): RunRequest.isolation exists but is hardcoded to host; only the Claude driver exists; seams are SpawnFn, prepareRun, WorktreeManager and G1Deps.runCommand; 13 host-coupling assumptions break in a container (loopback hook server, host paths in harness config, MCP opening the host SQLite DB, lexical lowercased path policy, host git on the worktree, host-shell G1).'
---

# Forge code map: where a sandbox boundary plugs in

Read-only exploration of `D:/VIKASH/software-factory`, 2026-10-16. Every
claim carries a file:line. Inferences are labelled.

## 1. Today's facts

- **One driver.** `packages/drivers/src/adapters/` has only `claude/`. Codex,
  OpenCode and Pi are design text (`docs/design/execution-plane.md` ~145-147,
  280-285).
- **`RunRequest.isolation` exists, unused.** Enum
  `['host','wsl2','harness-sandbox','container']` at
  `packages/core/src/schemas/run.ts:56`, field `:113`; the engine hardcodes
  `'host'` at `packages/engine/src/tick/run-request.ts:44`; no driver reads it.
- **`DriverCapabilities.nativeSandbox`** exists; ACP engine reports `false`
  (`packages/drivers/src/adapters/claude/acp/acp-engine.ts:118`).

## 2. Ports and seams

| Seam | Where | Why it matters |
|---|---|---|
| `WorkerDriver` | `packages/core/src/types/ports/driver.types.ts:40-56`: `id, capabilities(), preflight(), start, resume, steer, cancel, events, result` | Stays unchanged; the sandbox sits underneath it. |
| `SpawnFn` | `ClaudeDriverDeps` `driver-deps.types.ts:96-100`, injected `apps/server/src/services/claude-ports.ts:69` (`nodeSpawn`) | The natural point to route the harness process into a sandbox exec. |
| `prepareRun` | `apps/server/src/services/prepare-run.ts` | Writes run files, MCP config and secrets. Needs path translation. |
| `WorktreeManager` | port `core/src/types/ports/worktree.types.ts:38-54`; adapter `packages/git/src/adapters/git-cli/worktree-manager.ts` | README already invites "a remote or sandboxed worktree host" (`packages/git/README.md:134`). |
| `G1Deps.runCommand` | `packages/gates/src/types/g1-deps.types.ts:63`, `g1-gate-factory.ts:20` | Injectable already. Lets project checks run inside the sandbox. |

**Claude driver flow.** `claude-driver.ts:97-148` runs these steps in order:

1. Resolve the binary and credential.
2. Run `prepareRun`.
3. Write the run files.
4. Check settings sources against the host `~/.claude` (`:106`).
5. Run `git.head(cwd)` on the host (`:114`).
6. Build the child env.
7. Hand off to `superviseRun`.

**ACP engine.** It spawns
`node <abs>/@agentclientprotocol/claude-agent-acp/dist/index.js` with
cwd = the run dir (`acp-process.ts:27-31`). It sets
`CLAUDE_CODE_EXECUTABLE` = the host `claude` path (`acp-engine.ts:180-183`) and
speaks ndjson JSON-RPC over stdio (`acp-run.ts:141-146`, `:174-282`).

**Worktrees.**
- Created by host `git worktree add -b` at `<dataHome>/worktrees/<slug>/<ticketId>`
  (`worktree-manager.ts:97-149`, `project-registry.ts:74-79`, `data-home.ts:64-79`).
- Branch is `<type>/<id>-<slug>` (`core/src/domain/branch.ts:42-44`).
- The engine pushes in the verify step (`verify-publish.ts:28-29`). The Worker
  is blocked from `git push` (`tools/src/domain/floors.ts:68`).
- Merge goes through one door, pinned to the gated SHA (`verify-merge.ts:95-115`).

**Concurrency.** Global 2, per project 1, plus per harness and per state
(`core/src/domain/builtin-config.ts:32-33`, `schemas/forge-config.ts:50-61`,
`engine/.../schedule.ts:130-158`).

## 3. Host-coupling assumptions that break inside a Linux container or remote VM

1. **Hook server is loopback only.**
   - The hook POSTs to `127.0.0.1:<port>` (`apps/server/src/services/http/listen.ts:22,44`;
     `host-policy.ts:21`; `run-wiring.ts:46-55`).
   - Inside a box, `127.0.0.1` is the box itself.
   - Every hook then fails closed, and liveness denies all tools
     (`hook-handler.ts:124-125`).
2. **Host absolute paths are baked into harness config:**
   - `hook.js`/`hook.json` (`settings-file.ts:39-46`)
   - `_meta.settings` (`acp-meta.ts:35`)
   - `--settings`/`--mcp-config` (`cli-args.ts:40-43`)
   - `CLAUDE_CODE_EXECUTABLE`
   - the MCP `node.exe` + `apps/mcp/dist/main.js` (`prepare-run.ts:67-68`)
   - the run dir
3. **The MCP server opens the host SQLite DB.**
   - Its env carries `FORGE_DB_PATH` (`prepare-run.ts:72`), and it calls
     `openExistingStorage` (`apps/mcp/src/services/start.ts:47`).
   - The harness launches it, so it would run inside the box.
   - This is the strongest coupling. Mounting the DB in would defeat the isolation.
4. **The ACP adapter runs on the host** with a host Windows cwd in `session/new`
   (`acp-run.ts:201,207`).
5. **Path policy is lexical and Windows-shaped.**
   - `canon` lowercases every path and turns `\` into `/` (`tools/src/shared/path.ts:21-31`).
   - `OUTSIDE_CWD_PATHS` includes `/**` (`floors.ts:58-64`).
   - `realpathSync.native` runs on the server's filesystem
     (`hooks/src/server/path-resolver.ts:39,74`).
   - A container-reported `/workspace/x` is therefore denied unless it is mapped.
   - Lowercasing is also wrong on case-sensitive Linux.
6. **Host git runs on the worktree** in the driver, settle, verify, publish,
   merge and G1 diff (`claude-driver.ts:114`, `run-supervisor.ts:223`,
   `settle.ts:75`, `verify.ts:74,92`, `verify-merge.ts:34,62`).
7. **G1 checks run in the host shell.**
   - `spawn(..., {shell:true})` (`gates/src/adapters/command-runner.ts:65-133`).
   - PATHEXT resolution (`command-resolver.ts:35,52-84`).
   - Windows env allowlist (`gates/src/shared/env.ts:17-40`).
   - This means Worker-written tests execute on the host: the d-0117 gap.
8. **Windows-specific code:**
   - `taskkill` (`process-tree.ts:86-99`)
   - the `.exe`-only binary rule (`claude-binary.ts:25-26`)
   - DPAPI SecretStore via PowerShell (`packages/secrets/.../dpapi`)
   - the `%LOCALAPPDATA%` data home
   - the managed settings path (`settings-sources.ts:20`)
9. **Harness login is the host profile.**
   - `login` mode adds no env and relies on the host `~/.claude` (`harness-resolver.ts:60-80`, `child-env.ts:146-177`).
   - Only `api_key` and `oauth_token` modes carry into a box (`harness-auth.ts:24-37`).
10. **Live run state is an in-memory `Map`** (`claude-driver.ts:86`).
    - Kill uses local PIDs (`process-tree.ts:75-108`).
    - A remote box needs its own handle and kill.
11. **The settings-source check** reads the host `~/.claude` (`claude-driver.ts:106-110`). It only logs.
12. **No filesystem watching** exists, so there is nothing to break.
13. **Worktree add/remove is not locked** in code, although execution-plane.md §6
    says it is serialised.

## 4. Not host-coupled (good news)

- Run HMAC secrets and receipt signing stay on the server. The Worker holds
  only a bearer token (`hooks/src/server/run-secrets.ts`, `receipt-mac.ts`).
- `admit()` is pure (`tools/src/domain/admit.ts:219-238`). Only its inputs
  (cwd, paths) need mapping.
