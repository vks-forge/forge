# Brief — E2: server, gates, git host, end to end (slice 2, items 6 + exit)

Status: approved 2026-10-13 ("finish the E2 autonomusly"). Decisions: d-0012, d-0033, d-0034,
d-0036, d-0046, d-0052, d-0054, d-0055, d-0058, d-0059, d-0061 (node:http),
d-0062 (GitHost + DPAPI). Design: `m0-brief.md` slice 2 exit,
`verification-plane.md` §2 (G1), `director-core.md` §2/§8, `execution-plane.md` §8.

**Slice 2 exit (m0-brief):** a scripted Express ticket runs end to end on a
fixture repo; hook liveness preflight passes; every tool call has a chained
receipt; G1 catches a planted false claim.

Built in two steps, each with its own commit report:
**E2a** packages (ports, git host, secrets, gates, engine verify→merge flow);
**E2b** `apps/server` + end-to-end tests + live probes.

## E2a — packages

1. **Core ports.** `GitHost` (`push(worktree, branch)`, `openPr({branch, base,
   title, body}) → {number, url}`, `prStatus(n)`, `merge(n, method)`, `closePr(n)`),
   `SecretStore` (`get(name) → Uint8Array | null`, `put(name, bytes)`), `Gate`
   (`run(ctx) → GateResult`). `ProjectConfig` gains `git_host` (`kind: local |
   github`, `owner`, `repo`, `base_branch`, `app_id`, `installation_id`; ids are
   not secrets). One `merge()` door: only the engine's merge step calls
   `GitHost.merge`, after `gate_passed` at tier A.
2. **packages/git — GitHost adapters.**
   - `local-bare`: pushes to a file-path bare remote; a "PR" is a JSON record
     next to the bare repo; merge = `--no-ff` merge into the base branch there.
   - `github-app`: RS256 JWT from the App key with `node:crypto` (no dep) →
     `POST /app/installations/{id}/access_tokens` via `fetch`; push with the
     token through a `GIT_ASKPASS` helper and env var (never in argv, URL, git
     config or logs); open / status / merge (squash) / close PR via REST.
     Token cached until 5 min before expiry. Contract test for both adapters
     (`describeGitHostContract`): github adapter against a local fake HTTP server.
3. **SecretStore adapters** (new `@forge/secrets`, adapter package): `dpapi`
   (Windows, CurrentUser scope, via `powershell -NoProfile` +
   `System.Security.Cryptography.ProtectedData`, data over stdin/stdout base64,
   no shell, no temp files) storing blobs as `.forge/data/secrets/<name>.dpapi`;
   `memory` for tests. A wrap command (`forge secret wrap <name> <file>`, in
   `apps/cli`) encrypts an existing file and prints how to delete the plaintext;
   it never deletes the user's file itself.
4. **packages/gates — G1** (lane Express runs G1; G3 comes later):
   - **Claim matcher:** `finish` claims (typed already by the MCP tool) checked
     against the run's decision receipts (`resource`, verdict `allow`, effect
     `mutation_committed` / `read_completed`) and `git diff --name-status`
     against the run base: `edited <path>` needs an allowed edit/write receipt
     *and* the path in the diff; `ran_tests` needs an allowed shell receipt whose
     resource matches the project's test command; `read <path>` needs a read
     receipt; `added_test <name>` needs the name in a diffed test file.
     Each unsupported claim fails G1 with the claim quoted.
   - **Chain check:** `verifyChain` over the run's receipts; a broken chain or a
     tool call without a receipt fails G1.
   - **Test-diff gate:** removed test files, added `.skip`/`.only`, removed
     `expect`/`assert` lines, weakened matchers → fail.
   - **Project checks** (`profile: ts | generic`, d-0034): run the project's
     `lint`, `typecheck`, `test` scripts in the worktree (dispatcher-side, not
     the Worker); under `generic` the TS-only checks are `skipped` with reason.
5. **Engine verify → merge flow.** Settle success → commit any uncommitted
   worktree changes (Forge author) → `GitHost.push` → `openPr` → ticket
   `verifying` (PR number on the ticket/run) → run gates → `gate_results` rows →
   `gate_passed(tier A)` → `GitHost.merge` → `merged` → `done` → worktree
   removed (branch deleted after merge) | `gate_failed` → rework (new run,
   `retry_of`) up to the cap → `waiting_human`. Tier B/C stop at
   Review / NeedsSignoff (no auto-merge). Token revoke + `final_chain_hash`
   already happen at settle.

## E2b — apps/server and end to end

6. **apps/server composition** (`src/main.ts` thin; logic in `services/`):
   load `.forge/config/forge.yaml` (core schema), open SQLite + run migrations
   (the server owns migrations), server instance id, receipt log, hooks handler,
   engine with the Claude driver (ACP), Claude DirectorLLM, git worktrees,
   memory source, GitHost per project config, DPAPI SecretStore. `prepareRun`:
   run dir under `.forge/data/runs/<id>/`, raw run token + HMAC secret held in
   memory (d-0054), MCP server entry (`apps/mcp` with `FORGE_RUN_ID`,
   `FORGE_RUN_TOKEN`, `FORGE_DB_PATH`), hook server URL. Tick timer 30 s plus
   `requestTick` on intake / run events / hook liveness. Graceful shutdown
   cancels live runs (restart kills runs anyway, d-0054).
7. **HTTP (node:http, d-0061)**, bound to `127.0.0.1`, any other bind refused:
   `POST /intake`, `GET /tickets/:id` (ticket + runs + gate results + pending
   interactions), `POST /interactions/:id/answer` (CAS answer → response wake),
   `GET /runs/:id/events` SSE with `Last-Event-ID` replay then live,
   `POST /runs/:id/hook` (hooks handler), `GET /health`. zod-parsed bodies,
   typed errors → status codes, body size limit, no CORS.
8. **Tests.**
   - In-process end to end (normal suite, no model): real server on an
     ephemeral loopback port, fake WorkerDriver that edits files in the real
     worktree and emits receipts through the real hook route, fake
     DirectorLLM, real git worktrees, `local-bare` GitHost: `POST /intake` →
     … → `done` with the change merged into the bare repo; SSE replay from a
     `Last-Event-ID`; a planted false `finish` claim (`edited` a file never
     touched) → G1 fails → rework → park at cap.
   - Live probe 8 (gated, `pnpm probes`): real Claude driver + real
     DirectorLLM on a fixture repo with `local-bare` host — an Express ticket
     ("add a function and its test") reaches `done`, every tool call has a
     chained receipt, hook liveness registered.
   - Live probe 9 (gated): GitHub App host against the real repo — mint a
     token, push a throwaway branch, open a PR, read status, close it, delete
     the branch. No merge.

## Out of scope

Control room UI (slice 3), Standard/Full lanes and their steps, G2–G6, escalation
during a run, outcomes/ memory writing, cost pane.
