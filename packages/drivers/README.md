# @forge/drivers

`WorkerDriver` implementations: one folder per harness under `src/adapters/`. At present it holds the live preflight probes only.

## Why it exists

Workers run inside third-party harnesses (Claude Code first; Codex, OpenCode, Pi and generic ACP later) that each speak their own protocol. The Director must start, steer, resume and kill a run the same way whatever the harness, and must never trust a harness's own permission bypass. This package is that boundary: one driver per harness, harness JSON normalised to core `RunEvent` / `RunResult`, every quirk contained inside the folder, and tool permission decided on Forge's side by `admit()`. Without it, harness details leak into the engine and each new harness means a core edit. Design: `docs/design/execution-plane.md`.

## What it does

- Public API (`src/index.ts`): nothing exported yet (`export {}`). The target is the core `WorkerDriver` port: `id`, `capabilities()`, `preflight()`, `start()`, `resume()`, `steer()`, `cancel()`, `events()`, `result()`.
- Probes (`__tests__/probes/`): live checks against the real `claude` CLI and ACP adapter on the user's subscription. They cover subscription auth under settings isolation, hooks firing and blocking inside `-p`, the ACP adapter, `strictMcpConfig` suppression and user-hook leakage on ACP. Results and surprises are in `__tests__/probes/RESULTS.md`; artefacts go to the gitignored `.forge/data/probes/`.

## Why this approach

- ACP-first (d-0035, amended by d-0049): the harness's ACP server gives live steering and resume, which the CLI's stream-json lacks. The CLI is an explicit fallback only. Rejected: CLI-first, which is isolated correctly but loses steering and resume; the Agent SDK as primary (x-0001, superseded).
- `@agentclientprotocol/claude-agent-acp@0.89.1` and `@agentclientprotocol/sdk@1.8.0` (exact pins). The Claude adapter is pinned from the maintained package, not the stale Zed one; per-run options travel via `_meta.claudeCode.options`.
- The ACP adapter still reads the user's `settings.json` despite `settingSources: []` (d-0048), so the driver sends `session/set_mode` with `default` after every `session/new` and `session/load`, and answers every `session/request_permission` itself (d-0049). Bypass-permissions as a default is rejected (r-0005).
- Measured facts the driver must build on (d-0048): `--setting-sources ""` loads no settings; `--max-budget-usd` is enforced on subscription and a budget failure returns exit 0 with `subtype: error_max_budget_usd` and no `result`, so check `subtype`, not the exit code; on Windows the shell tool is `PowerShell`.
- Harness auth is the harness's own login (d-0031); `--bare` is API-key only and is not used.
- `@forge/core` for ports and error families; `@types/node@26.6.5` for the probes.

## Requirements

- Node 24.20 and pnpm. Probes need a logged-in `claude` CLI (probed against Claude Code 2.1.296) and spend subscription tokens: each is capped (for example $0.05) and uses `--model haiku`.
- Env: probes run only with `FORGE_PROBES=1`; `pnpm probes` at the root sets it and runs `packages/drivers/__tests__/probes`. Child runs strip `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT`.
- Files: probe output under `.forge/data/probes/` (gitignored).
- `pnpm build` at the root produces `dist/`; the `development` export condition resolves `src/`.
- Normal tests: `pnpm test` at the root skips probes. Re-run `pnpm probes` after every Claude Code upgrade (d-0048).

## Extending

Create `src/adapters/<harness>/`, implement the core `WorkerDriver` port (import only `@forge/core`), export from `src/index.ts`, and run the driver contract test against it before adding adapter-specific tests. `preflight()` must report `missing binary` when the harness is not installed. Add a probe for any new harness assumption before building on it. Harness names appear only inside `packages/drivers`.

## Limits

- No `WorkerDriver` implementation exists yet; the Claude driver (ACP engine plus CLI fallback) is not built.
- A driver contract test (`describeAdapterContract`) does not exist yet in this package.
- User-level hooks and CLAUDE.md may still reach a Worker under ACP; d-0049 accepts this on a single-user box.
- Other harnesses (Codex, OpenCode, Pi, generic ACP) are not started (d-0037).
- The CLI fallback's permission-prompt bridge is unverified.
