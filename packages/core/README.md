# @forge/core

The pure domain layer of Forge: schemas, the ticket state machine, lane triage, ids, branch names, typed errors and the ports every adapter implements.

## Why it exists

The Director engine, the HTTP API, the gates and the Workers' drivers all touch the same tickets, runs and events. If each had its own idea of what a ticket status means, who may move it, or what a run result looks like, a ticket could skip verification, reach Done without the sign-off its tier needs, or loop through automatic rework forever. Core is the one place those rules live. It has no IO, no database and no harness names, so the same rules run identically in the engine, in tests and on replay, and a new storage backend or harness never forces a change here.

## What it does

Public API (`src/index.ts`):

- Ids: `makeTicketId`, `parseTicketId`, `TicketId`. Ticket ids are `<PROJECT>-<n>`; the prefix is `[A-Z][A-Z0-9]{0,9}`, numbers are positive with no leading zero. The parser never throws.
- Branches: `branchName`, `parseBranchName` for `<type>/<id>-<slug>`. The slug falls back to `untitled` when the title has no ASCII content.
- State machine: `transition(ticket, event)` returns `Result<Ticket, TransitionError>` and never throws. Events carry `at` (keeps it pure) and optional `expected_version` for compare-and-swap. Automatic `gate_failed` rework is capped at two loops, then the ticket goes to `waiting_human` with a reason. `done` from Review or NeedsSignoff is the human approve and merge; tier C needs a non-blank `signer` (whitespace-only is refused). `triaged` raises the lane and never lowers it. Every verify cycle needs its own `gate_passed`: `verifying`, `gate_failed` and `rework` clear `tier_actual`, so `merged` can never ride on a pass from an earlier cycle. A cleared optional field (`blocked_reason`, `tier_actual`) is emitted as a present-but-undefined key so a storage patch built from the result clears the column.
- `toTicketPatch(next)`: the `TicketPatch` that stores a transitioned ticket with `updateTicketCas`. It drops `id`, `project`, `created_at`, `status_version` (storage owns the version) and the derived `parent` / `blocked_by`, and keeps the explicit clears (also for the nullable engine fields `assignee_run_id`, `branch`, `worktree`, `checkout_run_id`, `epic_id`, `created_by_intake`).
- Lane triage: `preCheckLane`, `maxLane`. Deterministic first step: touched paths against tier-C globs, predicted file count (Express allows at most 3), body length (at most 2000 chars) and ticket type (`ci` counts as infra). A tier-C glob hit forces Full.
- Schemas and inferred types: `Ticket`, `Lane`, `Tier`, `TicketType`, `TicketStatus`, `TicketRelationKind`, `TicketRelation`, `IntakeEvent`, `StoredIntakeEvent`, `Run`, `RunStatus`, `RunRequest`, `RunResult`, `RunEvent`, `InteractionKind`, `Interaction`, `WakeRequest`, `RunInboxMessage`, `GateResult`, `Project` (the `projects` row), `ProjectConfig` (the project.yaml), `DriverCapabilities`, `Sha256Hex`.
- Run lifecycle: `RunStatus` is `starting`, `running`, `settling`, `settled` plus the terminal results. `Run` carries `owner` (the Forge server instance, required) and optional `pid`, `last_event_at`, `final_chain_hash`, `catalogue_hash`, `prompt_hash`, `hook_registered_at`, `retry_of`. `isRunActive(run)` is the one liveness rule (status `starting` or `running` and no `ended_at`); the hook handler and the MCP server both use it.
- **Resume is a new run row.** Resuming a run creates a new `runs` row whose `retry_of` names the old one; a run that has `ended_at` is never reopened (storage refuses to clear `ended_at` or move an ended run back to `starting` / `running`). `RunResult.status` gains `paused`, which must carry `pauseReason: 'interaction'` and the `interactionId` to answer; the Director resumes it as a new run.
- Run events: besides tool_call, tool_result, text, ask, finish, error and usage, `permission` (`interaction_id?`, `call_id`, `tool`, `decision`), `inbox_delivered` (`inbox_seq`, `mode`), `session` (`session_ref`) and `hook_liveness` (`fingerprint`). `InteractionKind` is `question`, `plan_confirm`, `permission`, `blocked` (a Worker's `report_blocked`).
- `RunRequest` adds `runId`, `projectId`, `lane`, `promptHash`, `mcpIdentity` (the server name the run's Forge MCP server is registered under). `permissionPolicy` and `tools` are optional: the app derives both from `visibleTools()` over the run's `AdmitContext`, so the request is not a second policy source.
- Errors: `ForgeError` (carries `errorFamily`) and one subclass per family: auth, rate_limit, budget, stall, refusal, crash, policy_denied, unknown, and `InvalidInputError` (family `invalid_input`: a caller bug such as a rejected patch, a bad constructor argument or a constraint violation; never retried as-is). Also `ok`/`err` Result helpers and `globMatch`.
- Glob grammar (`globMatch(glob, path)`): `*` is any run of non-slash characters, `?` one non-slash character, `**` anything including slashes (`**` followed by a slash also matches zero directories); every other character is literal; backslashes in the glob or the path are read as `/`. A pattern with no slash matches the name at any depth, like gitignore (`*.sql` matches `db/migrations/x.sql`); a pattern containing a slash is anchored to the root (`db/*.sql` does not match `app/db/x.sql`). Runs of `*` and repeated `**` followed by a slash are collapsed before compiling, so a hostile pattern cannot cause catastrophic backtracking. No negation, no character classes, no braces.
- Ports (types only): `WorkerDriver` (`capabilities`, `preflight`, `start`, `resume`, `steer`, `cancel`, `events`, `result`; `steer(handle, message, mode, inboxSeq?)`: the optional `inboxSeq` is the `run_inbox` row being delivered, echoed in the `inbox_delivered` event) and `StorageAdapter` (`transaction`, `close`; the repositories `tickets`, `ticketRelations`, `runs`, `runEvents`, `runInbox`, `runTokens`, `intakeEvents`, `interactions`, `wakeRequests`, `gateResults`, `projects` hang off the transaction). **`ticket_relations` is the one source of truth for parent and blocker links**: `Ticket.parent` (first `spawned_from` edge out of the ticket) and `Ticket.blocked_by` (its `depends_on` targets plus the sources of `blocks` edges into it) are derived on every read, are not columns, and are not patchable; `tickets.insert` records a seeded `parent` / `blocked_by` as edges, later changes go through `ticketRelations.add/remove`. `interactions.answer(id, answer, at)` and `expire(id, at)` are compare-and-swap from `pending` (`expire` also waits for `timeout_at`) and return a boolean; `intakeEvents.insertIfNew` returns `{ inserted, event }` with the stored id and `markTicket(id, ticketId)` links it; `wakeRequests` is idempotent on (ticket, reason, key) and counts recent wakes for the re-wake cap. `updateTicketCas(id, expectedVersion, patch)` always sets `status_version` to `expectedVersion + 1`; a patch carrying `status_version` is refused (`TicketPatch` no longer has the field), and a key present with value `undefined` clears an optional column. `RunEventRepository.append(runId, event: NewRunEvent)` takes the event without `seq` and returns the stored event: storage is the only `seq` allocator (0-based, max+1 per run). `RunTokenRepository` (`issue`, `reissue`, `getHash`, `revoke`; `put` is a deprecated alias of `issue`) keeps per-run bearer tokens as SHA-256 hashes only; `issue` throws `PolicyDeniedError` for a run whose token was revoked, and only the explicit `reissue` re-arms it. The per-run HMAC secret is never part of any port or stored.

Layout follows the repo skeleton: `schemas/`, `types/` (`types/ports/` for the two ports), `domain/`, `shared/`, with tests in `__tests__/` mirroring `src/`.

## Why this approach

- `zod@4.6.7` is the only dependency. Schemas are the source of truth for types, DB rows, HTTP bodies, config and LLM step output; types come from `z.infer`, so nothing is declared twice. Parsing happens at every boundary.
- Result values instead of exceptions for expected failures (`transition`, id parsing), so callers must handle illegal moves. Unexpected failures throw `ForgeError` subclasses; retry, stall and kill decisions read `errorFamily`, not the message.
- One `transition()` for status changes (the single door). It takes an optional version for CAS so racing writers lose atomically in storage.
- Driver-boundary shapes are camelCase; DB rows (`Run`, `Ticket`, `Interaction`) are snake_case.
- `RunRequest` has no `AbortSignal` (not serializable); cancellation goes through `WorkerDriver.cancel`.
- Ports live here, not in the adapters, so adding a harness or database is a new folder elsewhere and never a core edit (d-0016, d-0047).

Where the design docs were silent, the simplest option was taken:

- `Ticket` gains `rework_count` and optional `blocked_reason`. There is no `needs_you` status; "Needs you" is a view over `waiting_human`.
- Extra events `asked` / `answered` move a ticket between InProgress and WaitingHuman for a Worker question. `parked` (non-blank reason, becomes `blocked_reason`) holds a Planned or InProgress ticket in WaitingHuman when no question exists; `unparked` releases it to Planned (not `answered`, since a parked ticket may never have run). `rework` is the human "changes requested" and is uncapped. `gate_passed` on tier A stays in Verifying and `merged` then finishes it. `cancelled` is allowed from every non-terminal status: inbox, planned, in_progress, blocked, waiting_human, verifying, review and needs_signoff (director-core.md §4 lists all eight as of this change; earlier drafts listed fewer).
- Relation kinds are five (blocks, depends_on, related, supersedes, spawned_from).
- `ErrorFamily` is auth, rate_limit, budget, stall, refusal, crash, policy_denied, unknown, invalid_input (execution-plane.md listed different names). `InvalidInputError` used to be an `unknown` subclass; it has its own family now, so code that tested `instanceof UnknownForgeError` for it must test the class or the family instead.

## Requirements

- Node 24.20 and pnpm; no native binaries, no env vars, no `.forge/` files, no external services.
- `pnpm build` at the root runs `tsc -b` and produces `dist/`. The `development` export condition resolves `src/` for tests and typecheck.
- Inside the package use the `#/` alias (from `package.json` `imports`); tests also get `#tests/` for `__tests__/helpers`.
- Tests: `pnpm test` at the root (vitest with coverage). Coverage floor is 70% lines on this package.

## Extending

- A new harness implements `WorkerDriver` in `packages/drivers/src/adapters/<name>/`; a new database implements `StorageAdapter` in `packages/db/src/adapters/<name>/`. Both import only `@forge/core` and must pass the contract test. If an implementation needs a core change, fix the interface instead.
- A new schema goes in `src/schemas/` with its `z.infer` alias beside it; hand-written types go in `src/types/` as `<name>.types.ts`; export from `src/index.ts`.
- A new ticket event goes in `types/ticket-events.types.ts` and `domain/state-machine.ts`, with property tests.

## Limits

- Lane triage here is only the deterministic pre-check; the LLM triage step is not in core.
- Core defines the `WorkerDriver` and `StorageAdapter` shapes but contains no implementation of either.
- `DirectorLLM`, `GitHost`, `SecretStore` and `WorktreeManager` ports are not here yet (they arrive with the engine).
- Gate selection and ledger routing by tier are not modelled here.
