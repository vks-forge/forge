# @forge/core

Pure domain layer: zod schemas (source of truth for types), the ticket state
machine, lane pre-check, ids, branch names, and the `WorkerDriver` /
`StorageAdapter` interfaces (in `src/types/ports/`). No IO, no sibling imports, no harness names.
Depends on `zod` only.

## Layout

```
__tests__/   mirrors src/ (helpers/fixtures.ts holds shared fixtures)
src/
  index.ts   re-exports only
  schemas/   zod schemas + `type X = z.infer<typeof X>` only
  types/     every hand-written type/interface (types/ports/: WorkerDriver, StorageAdapter)
  domain/    ids, state machine, lane triage, branch names
  shared/    ok/err, error classes, glob
```

See `.claude/rules/code.md` rule 10.

Every file opens with a header comment (what, why, exports, depends on): see `.claude/rules/code.md` rule 12; enforced by the `forge/file-header` lint rule.

Imports inside the package use the `#/` alias (`import { transition } from '#/domain/state-machine.js'`, from `package.json` `imports`); tests also get `#tests/` for `__tests__/helpers`. `../` is a lint error (rule 10).

## Public API (`src/index.ts`)

- `makeTicketId`, `parseTicketId`, `TicketId`
- `Ticket`, `Lane`, `Tier`, `TicketType`, `TicketStatus`, `TicketRelationKind`
- `IntakeEvent`, `Run`, `RunRequest`, `RunResult`, `RunEvent`, `DriverCapabilities`, `ProjectConfig`
- `transition(ticket, event)` returns `Result<Ticket, TransitionError>`; never throws
- `preCheckLane`, `maxLane`, `branchName`, `parseBranchName`
- `ForgeError` and one subclass per `ErrorFamily`
- `WorkerDriver`, `StorageAdapter` (types only)

## Adding an implementation

Implement `WorkerDriver` in `packages/drivers/<name>` or `StorageAdapter` in
`packages/db/<name>`, import only from `@forge/core`, and pass the contract
test. If it needs a core change, fix the interface instead.

## Assumptions

Where the docs were silent the simplest option was taken:

- `Ticket` gains `rework_count` (cap bookkeeping) and optional `blocked_reason`.
- No `needs_you` status exists in director-core.md; "Needs you" is a pane over
  `waiting_human`. The rework cap (2 automatic `gate_failed` loops) therefore
  moves the ticket to `waiting_human` with a reason.
- Extra events beyond the brief: `asked` / `answered` (InProgress <-> WaitingHuman).
- `gate_failed` is the capped automatic rework (Verifying -> InProgress);
  `rework` is a human "changes requested" from Review/NeedsSignoff, uncapped.
- `gate_passed` on tier A stays in Verifying; `merged` (tier A) then finishes.
  `done` is the human approve+merge from Review/NeedsSignoff; tier C needs a `signer`.
- `cancelled` is allowed from any non-terminal status.
- Events carry `at` (ISO time, keeps `transition` pure) and optional
  `expected_version` for CAS. `triaged` raises the lane, never lowers it.
- Relation kinds: the docs list five (blocks, depends_on, related, supersedes,
  spawned_from), not six.
- `ErrorFamily` = auth, rate_limit, budget, stall, refusal, crash, policy_denied,
  unknown (execution-plane.md used auth/rate_limit/process/harness/policy).
- `RunRequest` has no `AbortSignal` (not serializable); cancel via `WorkerDriver.cancel`.
  `WorkerDriver` adds `events(handle)` and `result(handle)` so a handle is usable.
- Driver-boundary shapes are camelCase (as in execution-plane.md); DB rows
  (`Run`, `Ticket`, `Interaction`) are snake_case.
- Express lane pre-check: at most 3 predicted files, body at most 2000 chars,
  type `ci` counts as infra (Standard). Tier-C glob hit forces Full.
- Ticket id prefix: `[A-Z][A-Z0-9]{0,9}`; numbers are positive with no leading zero.
- Branch slug falls back to `untitled` when the title has no ascii content.
- `pnpm test` runs vitest with coverage (70% lines on this package).
