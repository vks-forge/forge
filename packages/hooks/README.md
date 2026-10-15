# @forge/hooks

The harness-neutral receipt ingress of Forge: the server handler that answers a Worker's hook posts, decides each tool call with `admit()` and appends the signed receipt, plus the in-memory registry of each run's token and HMAC secret and the liveness recorder. The harness-side hook script lives in the driver that owns the harness (Claude: `@forge/drivers`, d-0056).

## Why it exists

A Worker runs inside a third-party harness (Claude Code CLI or the ACP adapter) that decides for itself what to run. Forge must still decide every tool call with `admit()` and keep proof of what happened that the Worker cannot forge. The harness offers one place to intervene: it runs our command on SessionStart / PreToolUse / PostToolUse and obeys the exit code. Claude Code's default when such a hook crashes, times out or is missing is to let the tool run (probe 2), so without this package either policy is bypassable by an outage, or receipts are written by the harness side and are untrustworthy.

Actors: the harness (runs the hook, untrusted), the hook script (tiny, holds only a bearer token; owned by the harness's driver), the Forge server (holds the run secret, policy and chain; this package), the driver (writes the per-run files). A Worker run can outlive a server restart (d-0092): the resumed process is a new Worker under a new token and a new secret generation, and the receipts of the process before it must stay verifiable (d-0100).

## What it does

```
harness --stdin JSON--> hook script (driver) --POST {event,payload,seq}, Bearer token--> server
                                              <-- {decision, reason, receipt_hash} ------ createHookHandler
exit 0 allow | exit 2 deny/ask/any failure (reason on stderr)         admit() + HMAC receipt chain
```

- `createRunSecretRegistry({ store?, newSecret?, max? })` (`RunSecretRegistry`): per-run bearer token (memory only) and HMAC secrets (d-0100). `register(runId, token, generation = 1)` creates the secret, writes it to the `SecretStore` as `run/<runId>/secret-g<generation>` (before it is used) and makes `token` + generation the run's current credentials; a generation is registered once, a second `register` of it throws instead of replacing a secret the chain was signed with. `credentials(runId)` is the current generation (null after a restart: the token is never stored, so the old Worker's token is unknown); `secret(runId, generation)` reads through to the store when memory misses, so G1 verifies old generations after a restart. `retire(runId)` deletes every generation from memory and the store; `sweep(isOver)` retires the runs the predicate calls over (the startup sweep of what a crash left). Memory is capped at `MAX_RUN_SECRETS` (5000 runs' tokens, oldest out first; their secrets stay readable from the store). `linkResumedGeneration(receipts, runId, generation, secret, ts)` appends the `resumed` receipt that starts a new generation's chain segment, signed with the new secret. `createLivenessRecorder({ storage, now, onRegistered })` is the handler's `onLiveness`: only the first `SessionStart` of a run writes the `hook_liveness` event and `hook_registered_at` (resume, compact and clear do not move it); a restart resume clears `hook_registered_at`, so the resumed process must register again. `createLivenessRecorder({ storage, now, onRegistered })` is the handler's `onLiveness`: only the first `SessionStart` of a run writes the `hook_liveness` event and `hook_registered_at` (resume, compact and clear do not move it).
- `createHookHandler({ db, receipts, admit, credentials, admitContext, clock, audit?, requireLiveness?, onLiveness? })` -> `handle(runId, token, request)`. Checks token (`constantTimeEqual` from `@forge/tools`), refuses a run that is no longer active (`isRunActive` from `@forge/core`: ended, settling, settled and `interrupted` runs answer `fail_closed_inactive_run` and get no receipts; a `starting` run is served so its hook can register liveness), refuses credentials whose generation is not the run row's (`fail_closed_stale_generation`), with `requireLiveness` a `PreToolUse` from a run whose `hook_registered_at` is unset is denied `fail_closed_no_liveness` with no receipt (d-0033), runs `admit()`, appends decision / effect receipts (each decision records its `resource` via `callResource()` from `@forge/tools`, the same resolver `admit()` uses; `seq` from the chain tail), never throws. An effect's `result_hash` is the canonical-JSON SHA-256 of the output, or, when the hook sent a `TruncatedOutput` stub for an output over 1 MiB, the hash of the whole output the stub carries (`resultHash()`).
- Wire schemas `HookPayload`, `HookRequest`, `HookResponse` are defined in `@forge/tools` (`schemas/hook-wire.ts`, also importable as `@forge/tools/hook-wire`) so the hook client and this handler share them without depending on each other. The client (`bin/hook.js`, `runHook`, `HookConfig`) and the `--settings` / ACP `_meta` renderers are in `@forge/drivers` (`adapters/claude/hooks/`). Receipts go through the `ReceiptLog` port from `@forge/tools`; `@forge/db` provides `openSqlite(path).receipts` and `createMemoryReceiptLog()`.

| Event                | allow | deny / ask   | any failure  |
| -------------------- | ----- | ------------ | ------------ |
| SessionStart         | 0     | 2 (advisory) | 2 (advisory) |
| PreToolUse           | 0     | 2 + stderr   | 2            |
| PostToolUse(Failure) | 0     | 0 (logged)   | 0 (logged)   |

**PreToolUse is the only hard gate.** Claude Code treats SessionStart as non-blocking (exit 2 only shows stderr), so SessionStart exit codes are advisory; with `requireLiveness` (the server turns it on) a run whose hook never registered cannot make a tool call at all (d-0033).

Fail-closed matrix (PreToolUse; SessionStart advisory): server down, timeout, non-2xx, malformed answer, missing or invalid config, bad stdin, unbuilt dist all exit 2. Server side: unknown run, no credentials, bad token, inactive run, bad request, internal error answer `deny` with `fail_closed_<code>`; a bad token or internal error on a real run is reported to the optional `audit(runId, entry)` dep (in-memory default, at most one entry per run per 10 s with a count of suppressed ones) and is never appended to the signed chain, so a Worker cannot bloat it.

## Why this approach

- Plain exit 2 plus a stderr line, no `hookSpecificOutput` JSON: probe 2 measured exit 2 blocking and the stderr text reaching the model; the JSON form was not tested (d-0048).
- `onFailure: "block"` and an explicit `timeout` on every hook, exec form `node "<abs>"` (d-0033). Harness timeout is hook timeout + 2s so our reason is reported first.
- Matcher `.*`: every tool, incl. Edit/Write/Read, goes through `admit()` and gets a receipt; PreToolUse is the single chokepoint (d-0033). The CLI on Windows says PowerShell, ACP says Bash (d-0048); narrow via `renderHookSettings({ matcher })`.
- Run secret stays server-side; the hook file holds only a token (verification-plane.md §2). The secret comes from the `credentials()` callback (the registry: memory, backed by the `SecretStore`, DPAPI-encrypted on Windows) and is never written to the database: `@forge/db` stores only a SHA-256 of the token, so a Worker that can read the DB file can neither forge receipts nor impersonate a run (a test greps the SQLite file and WAL for the secret).
- One secret per generation, stored for the life of the run, rather than sealing the chain at shutdown with a final hash (d-0100): sealing fails exactly when it is needed, on a crash where no shutdown runs. The resumed process signs under a new secret and the `resumed` receipt (signed with that new secret, linked to the last receipt before it) joins the segments, so the new process cannot extend or rewrite the earlier segment and G1 verifies each with its own key.
- `seq` comes from the chain tail inside one atomic append, not from the client, so concurrent posts cannot fork the chain.
- Tool names resolve through the run's catalogue, where `native` may list several names: `Bash` (ACP) and `PowerShell` (Windows CLI) both become `shell`, and `admit()` picks the tokenizer dialect from the native name that was actually called. A name the catalogue does not list stays raw and is denied as `unknown_tool`.
- Rejected: SDK callback hooks and `canUseTool` (do not cross ACP JSON-RPC, d-0049).

## Requirements

- Node >= 24.
- A `SecretStore` (the `@forge/core` port; DPAPI on Windows) for the registry's run secrets; without one the registry is memory-only and a restart loses the secrets (tests only).
- The app serves `POST <server_url>/runs/<run_id>/hook`, calls `handle(runId, bearerToken, body)` and maps its response to HTTP 200. The per-run `hook.json` (`{ run_id, server_url, token, timeout_ms }`) is written by the driver from `prepareRun()`'s `hookServerUrl` / `hookToken`.
- Tests: `pnpm test` (the hook-process spawn tests are in `@forge/drivers`).

## Extending

A durable backend implements `ReceiptLog` in `@forge/db` (`append` must be atomic and serialised per run) and passes `describeReceiptLogContract`. Hook tests use the db package as a devDependency fake: `createMemoryReceiptLog()` by default, `openSqlite(path)` in `hook-handler-sqlite.test.ts`. A new event adds a payload schema and a `HookRequest` branch in `@forge/tools`, a handler case here and a row in the table above. A new harness adds its own hook client in its driver; this package does not change.

## Limits

- The catalogue must know every native tool the Worker uses, or `.*` makes `admit()` deny it as `unknown_tool`.
- No run-token issuance, secret generation or HTTP route here: the app registers `sha256(token)` through `tx.runTokens.put(...)` before launch, keeps the HMAC secret in the `SecretStore` for the life of the run (so a restart does not lose it; a resume gets a new generation, d-0100), and serves `credentials()`.
- PostToolUse(Failure) needs the harness's `tool_use_id` and a matching open decision whose verdict was `allow`; otherwise it answers allow, writes nothing and says why (`effect_no_tool_use_id`, `effect_unmatched`). There is no per-tool fallback, so a forged Post cannot attach an effect to a denied or asked call.
- Windows enforcement is attribution-only: the Worker's OS user can rewrite `hook.json` and `hook.js`, so the hook proves what the harness reported, not what it did. The Claude driver cross-checks the tool ids the harness executed against the receipts (`receipts.decisionFor`, d-0056).
- The `ask` verdict is treated as a block; there is no approval round trip.
