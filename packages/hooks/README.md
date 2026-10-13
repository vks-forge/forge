# @forge/hooks

The receipt chokepoint between a Worker's harness and Forge: a hook script the harness runs on every tool event, and the server handler that answers it.

## Why it exists

A Worker runs inside a third-party harness (Claude Code CLI or the ACP adapter) that decides for itself what to run. Forge must still decide every tool call with `admit()` and keep proof of what happened that the Worker cannot forge. The harness offers one place to intervene: it runs our command on SessionStart / PreToolUse / PostToolUse and obeys the exit code. Claude Code's default when such a hook crashes, times out or is missing is to let the tool run (probe 2), so without this package either policy is bypassable by an outage, or receipts are written by the harness side and are untrustworthy.

Actors: the harness (runs the hook, untrusted), the hook script (tiny, holds only a bearer token), the Forge server (holds the run secret, policy and chain), the driver (writes the per-run files).

## What it does

```
harness --stdin JSON--> node bin/hook.js --POST {event,payload,seq}, Bearer token--> server
                                         <-- {decision, reason, receipt_hash} ------ createHookHandler
exit 0 allow | exit 2 deny/ask/any failure (reason on stderr)    admit() + HMAC receipt chain
```

- `runHook(io)` / `main()`: the client. `bin/hook.js` loads `dist/client/hook-main.js`; if that fails it exits 2.
- `createHookHandler({ db, receipts, admit, credentials, admitContext, clock, audit? })` -> `handle(runId, token, request)`. Checks token (`constantTimeEqual` from `@forge/tools`), runs `admit()`, appends decision / effect receipts (`seq` from the chain tail), never throws.
- `renderHookSettings()`, `renderAcpMeta()`: per-run settings file contents and the ACP `_meta`.
- Schemas: `HookPayload`, `HookRequest`, `HookResponse`, `HookConfig`. Receipts go through the `ReceiptLog` port from `@forge/tools`; `@forge/db` provides `openSqlite(path).receipts` and `createMemoryReceiptLog()`.

| Event                | allow | deny / ask   | any failure  |
| -------------------- | ----- | ------------ | ------------ |
| SessionStart         | 0     | 2 (advisory) | 2 (advisory) |
| PreToolUse           | 0     | 2 + stderr   | 2            |
| PostToolUse(Failure) | 0     | 0 (logged)   | 0 (logged)   |

**PreToolUse is the only hard gate.** Claude Code treats SessionStart as non-blocking (exit 2 only shows stderr), so SessionStart exit codes are advisory; a run that never registers liveness is killed by the engine (d-0033), and its first tool call is still judged at PreToolUse.

Fail-closed matrix (PreToolUse; SessionStart advisory): server down, timeout, non-2xx, malformed answer, missing or invalid config, bad stdin, unbuilt dist all exit 2. Server side: unknown run, no credentials, bad token, bad request, internal error answer `deny` with `fail_closed_<code>`; a bad token or internal error on a real run is reported to the optional `audit(runId, entry)` dep (in-memory default, at most one entry per run per 10 s with a count of suppressed ones) and is never appended to the signed chain, so a Worker cannot bloat it.

## Why this approach

- Plain exit 2 plus a stderr line, no `hookSpecificOutput` JSON: probe 2 measured exit 2 blocking and the stderr text reaching the model; the JSON form was not tested (d-0048).
- `onFailure: "block"` and an explicit `timeout` on every hook, exec form `node "<abs>"` (d-0033). Harness timeout is hook timeout + 2s so our reason is reported first.
- Matcher `.*`: every tool, incl. Edit/Write/Read, goes through `admit()` and gets a receipt; PreToolUse is the single chokepoint (d-0033). The CLI on Windows says PowerShell, ACP says Bash (d-0048); narrow via `renderHookSettings({ matcher })`.
- Run secret stays server-side; the hook file holds only a token (verification-plane.md §2). The secret comes from the `credentials()` callback, i.e. Forge server memory, and is never written to the database: `@forge/db` stores only a SHA-256 of the token, so a Worker that can read the DB file can neither forge receipts nor impersonate a run (a test greps the SQLite file and WAL for the secret).
- `seq` comes from the chain tail inside one atomic append, not from the client, so concurrent posts cannot fork the chain.
- Tool names resolve through the signed catalogue, where `native` may list several names: `Bash` (ACP) and `PowerShell` (Windows CLI) both become `shell`, and `admit()` picks the tokenizer dialect from the native name that was actually called. A name the catalogue does not list stays raw and is denied as `unknown_tool`.
- Only `node:http`/`fetch`/`node:crypto` and zod; the client imports no other Forge package so it starts fast.
- Rejected: SDK callback hooks and `canUseTool` (do not cross ACP JSON-RPC, d-0049).

## Requirements

- Node >= 24. `pnpm build` before any live run (the hook runs from `dist/`).
- Config path: `--config <path>` in the hook command wins; `FORGE_HOOK_CONFIG` (path to `.forge/data/runs/<id>/hook.json`) is used only when argv names none.
- `hook.json`: `{ run_id, server_url, token, timeout_ms }`. The server must serve `POST <server_url>/runs/<run_id>/hook` and map `handle()`'s response to HTTP 200.
- Tests: `pnpm test` (spawn tests build this package with `tsc -b` first).

## Extending

A durable backend implements `ReceiptLog` in `@forge/db` (`append` must be atomic and serialised per run) and passes `describeReceiptLogContract`. Hook tests use the db package as a devDependency fake: `createMemoryReceiptLog()` by default, `openSqlite(path)` in `hook-handler-sqlite.test.ts`. A new event adds a payload schema, a `HookRequest` branch, a handler case and a row in the table above.

## Limits

- The catalogue must know every native tool the Worker uses, or `.*` makes `admit()` deny it as `unknown_tool`.
- No run-token issuance, secret generation or HTTP route here: the app registers `sha256(token)` through `tx.runTokens.put(...)` before launch, keeps the HMAC secret in memory (a restart of the Forge server loses it, so receipts of runs in flight can no longer be extended or verified until a new secret scheme exists), and serves `credentials()`.
- PostToolUse(Failure) needs the harness's `tool_use_id` and a matching open decision whose verdict was `allow`; otherwise it answers allow, writes nothing and says why (`effect_no_tool_use_id`, `effect_unmatched`). There is no per-tool fallback, so a forged Post cannot attach an effect to a denied or asked call.
- Windows enforcement is attribution-only: the Worker's OS user can rewrite `hook.json` and `hook.js`, so the hook proves what the harness reported, not what it did. The driver cross-checks the tool ids the harness executed against the receipts (d-0056 follow-up).
- The `ask` verdict is treated as a block; there is no approval round trip.
