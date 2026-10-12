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
- `createHookHandler({ db, receipts, admit, credentials, admitContext, clock })` -> `handle(runId, token, request)`. Checks token (constant time), runs `admit()`, appends decision / effect receipts (`seq` from the chain tail), never throws.
- `renderHookSettings()`, `renderAcpMeta()`: per-run settings file contents and the ACP `_meta`.
- Schemas: `HookPayload`, `HookRequest`, `HookResponse`, `HookConfig`. `createMemoryReceiptLog()`.

| Event                | allow | deny / ask | any failure |
| -------------------- | ----- | ---------- | ----------- |
| SessionStart         | 0     | 2          | 2           |
| PreToolUse           | 0     | 2 + stderr | 2           |
| PostToolUse(Failure) | 0     | 0 (logged) | 0 (logged)  |

Fail-closed matrix (PreToolUse, SessionStart): server down, timeout, non-2xx, malformed answer, missing or invalid config, bad stdin, unbuilt dist all exit 2. Server side: unknown run, no credentials, bad token, bad request, internal error answer `deny` with `fail_closed_<code>`; only a bad token or internal error on a real run leaves an audit receipt.

## Why this approach

- Plain exit 2 plus a stderr line, no `hookSpecificOutput` JSON: probe 2 measured exit 2 blocking and the stderr text reaching the model; the JSON form was not tested (d-0048).
- `onFailure: "block"` and an explicit `timeout` on every hook, exec form `node "<abs>"` (d-0033). Harness timeout is hook timeout + 2s so our reason is reported first.
- Matcher `.*`: every tool, incl. Edit/Write/Read, goes through `admit()` and gets a receipt; PreToolUse is the single chokepoint (d-0033). The CLI on Windows says PowerShell, ACP says Bash (d-0048); narrow via `renderHookSettings({ matcher })`.
- Run secret stays server-side; the hook file holds only a token (verification-plane.md §2).
- `seq` comes from the chain tail inside one atomic append, not from the client, so concurrent posts cannot fork the chain.
- Only `node:http`/`fetch`/`node:crypto` and zod; the client imports no other Forge package so it starts fast.
- Rejected: SDK callback hooks and `canUseTool` (do not cross ACP JSON-RPC, d-0049).

## Requirements

- Node >= 24. `pnpm build` before any live run (the hook runs from `dist/`).
- Env: `FORGE_HOOK_CONFIG` = path to `.forge/data/runs/<id>/hook.json`, set by the driver; fallback `--config <path>` in the hook command.
- `hook.json`: `{ run_id, server_url, token, timeout_ms }`. The server must serve `POST <server_url>/runs/<run_id>/hook` and map `handle()`'s response to HTTP 200.
- Tests: `pnpm test` (spawn tests build this package with `tsc -b` first).

## Extending

A durable backend implements `ReceiptLog` (`append` must be atomic and serialised per run) and passes the same handler tests as `createMemoryReceiptLog()`. A new event adds a payload schema, a `HookRequest` branch, a handler case and a row in the table above.

## Limits

- The catalogue must know every native tool the Worker uses, or `.*` makes `admit()` deny it as `unknown_tool`.
- No SQLite `ReceiptLog` yet (db needs tool_decisions/tool_effects repo); no run-token issuance or HTTP route (the app owns both).
- PostToolUse with no open decision writes nothing (`effect_unmatched`).
- The `ask` verdict is treated as a block; there is no approval round trip.
