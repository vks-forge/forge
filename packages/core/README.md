# @forge/core

The pure domain layer of Forge: schemas, the ticket state machine, lane triage, ids, branch names, typed errors and the ports every adapter implements.

## Why it exists

The Director engine, the HTTP API, the gates and the Workers' drivers all touch the same tickets, runs and events. If each had its own idea of what a ticket status means, who may move it, or what a run result looks like, a ticket could skip verification, reach Done without the sign-off its tier needs, or loop through automatic rework forever. Core is the one place those rules live. It has no IO, no database and no harness names, so the same rules run identically in the engine, in tests and on replay, and a new storage backend or harness never forces a change here.

## What it does

Public API (`src/index.ts`):

- Ids: `makeTicketId`, `parseTicketId`, `TicketId`. Ticket ids are `<PROJECT>-<n>`; the prefix is `[A-Z][A-Z0-9]{0,9}`, numbers are positive with no leading zero. The parser never throws.
- Branches: `branchName`, `parseBranchName` for `<type>/<id>-<slug>`. The slug falls back to `untitled` when the title has no ASCII content.
- State machine: `transition(ticket, event)` returns `Result<Ticket, TransitionError>` and never throws. Events carry `at` (keeps it pure) and optional `expected_version` for compare-and-swap. Automatic `gate_failed` rework is capped at two loops, then the ticket goes to `waiting_human` with a reason. `done` from Review or NeedsSignoff is the human approve and merge; tier C needs a `signer`. `triaged` raises the lane and never lowers it.
- Lane triage: `preCheckLane`, `maxLane`. Deterministic first step: touched paths against tier-C globs, predicted file count (Express allows at most 3), body length (at most 2000 chars) and ticket type (`ci` counts as infra). A tier-C glob hit forces Full.
- Schemas and inferred types: `Ticket`, `Lane`, `Tier`, `TicketType`, `TicketStatus`, `TicketRelationKind`, `IntakeEvent`, `Run`, `RunRequest`, `RunResult`, `RunEvent`, `DriverCapabilities`, `ProjectConfig`, `Sha256Hex`.
- Errors: `ForgeError` (carries `errorFamily`) and one subclass per family: auth, rate_limit, budget, stall, refusal, crash, policy_denied, unknown. Also `ok`/`err` Result helpers and a glob matcher.
- Ports (types only): `WorkerDriver` (`capabilities`, `preflight`, `start`, `resume`, `steer`, `cancel`, `events`, `result`) and `StorageAdapter` (`transaction`, `close`; ticket, run, run-event, run-token, intake-event and interaction repositories hang off the transaction). `RunEventRepository.append(runId, event: NewRunEvent)` takes the event without `seq` and returns the stored event: storage is the only `seq` allocator (0-based, max+1 per run). `RunTokenRepository` (`put`, `getHash`, `revoke`) keeps per-run bearer tokens as SHA-256 hashes only; the per-run HMAC secret is never part of any port or stored.

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
- Extra events `asked` / `answered` move a ticket between InProgress and WaitingHuman. `rework` is the human "changes requested" and is uncapped. `gate_passed` on tier A stays in Verifying and `merged` then finishes it. `cancelled` is allowed from any non-terminal status.
- Relation kinds are five (blocks, depends_on, related, supersedes, spawned_from).
- `ErrorFamily` is auth, rate_limit, budget, stall, refusal, crash, policy_denied, unknown (execution-plane.md listed different names).

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
- Gate selection and ledger routing by tier are not modelled here.
