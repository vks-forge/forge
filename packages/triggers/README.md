# @forge/triggers

TriggerAdapter implementations: the ticket sources that feed the Director (chat today).

## Why it exists

Work reaches the Director from several places: a person typing in the control room or CLI, later
GitHub issues, cron, webhooks and telemetry. Each speaks its own shape and each redelivers. The
Director (engine) must see one `IntakeEvent` and must never learn a source's quirks, and the intake
door must accept events only from sources someone turned on. Without this package every new source
would be an engine or route edit, and a client could claim any `source` it liked. The `TriggerAdapter`
port (in `@forge/core`) is the boundary; this package holds one folder per source (d-0002).

## What it does

Public API from `src/index.ts`:

- `createChatTrigger()` returns the chat `TriggerAdapter`: id `chat`, source `chat`, push only.
  `normalise(raw)` parses the body as an `IntakeEvent` (the web client already builds the envelope,
  including a client-chosen `dedupe_key` per message) and refuses any event whose `source` is not
  `chat`, so a chat client cannot file work as another source. It throws a `ZodError` on junk.

## Why this approach

- Adapters import `@forge/core` only (and `@forge/tools` is allowed but unused), never the engine or each
  other (code.md rule 1); the registry and the polling loop live in `apps/server`, which composes them.
- Normalisation is pure and deterministic and the engine dedupes on `(source, dedupe_key)`, so redelivery
  is safe without adapter state (d-0002).
- Alternatives rejected: a registry inside the engine (the engine would need to know source names, against
  d-0058), one `if (source === ...)` in the route (a new source would edit the route).

## Requirements

- Runtime: Node 24, no native binaries, no env vars, no `.forge/` files, no services.
- Tests: `pnpm test` runs `__tests__/adapters/chat-trigger.test.ts`, which runs
  `describeTriggerAdapterContract` (in `__tests__/contract/`) against the chat adapter and a fake polled
  adapter.

## Extending

Add `src/adapters/<name>/<name>-trigger.ts` exporting a factory that returns a `TriggerAdapter`, export it
from `src/index.ts`, and run `describeTriggerAdapterContract` against it before writing its own tests. A
new `IntakeSource` value goes in `@forge/core` (`schemas/intake.ts`). The server registers it through
`ExternalPorts.triggers` or `services/triggers.ts`. A polled source declares `capabilities().poll` and
implements `poll(since)`.

## Limits

- Only chat exists. The GitHub Issues adapter (polled, with a persisted cursor and the author allow-list)
  comes after release; webhooks, cron and telemetry adapters are not built.
- Adapters hold no state; cursors are the server poller's, in memory.
