# Debug trace log (builder brief)

Status: approved by the owner's answers on 2026-10-17 (d-0163). One builder, backend only.

## Why

When a card misbehaves (a step fails, a Worker goes quiet, a plan looks wrong) the owner cannot
see what happened. The facts are scattered across card events, run events, receipts and step
rows in the database, and nothing records the prompts sent or the raw model output. The owner
wants one place that tells the whole story.

## What the owner chose

- **Files only.** No UI page.
- **Full content.**
  - Director steps: the input, the rendered prompt when the driver can give it, the raw output, the parsed result, cost, duration, model and harness.
  - Worker runs: every run event, including messages and tool calls with their inputs and outputs.
  - Chats in full.
  - Secrets are always redacted.
- **Layout.** Two kinds of file:
  - `<dataHome>/logs/trace/forge-YYYY-MM-DD.jsonl`: everything, in time order, one combined file per day (server local date).
  - `<dataHome>/logs/trace/cards/<CARD-ID>.jsonl`: one card's whole story, from creation and chat through Director steps to its tickets, their runs and escalations.
- **On/off by env var.** It is off by default and costs nothing when off.

## Env (dev/debug switches; code rule 9 allows these)

| Variable | Default | Meaning |
|---|---|---|
| `FORGE_TRACE` | unset (off) | `1` / `true` turns tracing on |
| `FORGE_TRACE_DIR` | `<dataHome>/logs/trace` | Where the files go |
| `FORGE_TRACE_KEEP_DAYS` | `14` | Files older than this are deleted at start-up and once a day |

Parse these in `apps/server/src/schemas/env.ts` with the existing env schema. Log one start-up line saying whether tracing is on and where it writes. Never print a secret.

## Shape

- **Core (pure).**
  - `schemas/trace.ts` with a zod `TraceEntry`:
    - `ts`, `seq`;
    - `level` (`debug|info|warn|error`);
    - `kind`: an enum covering `http`, `card`, `card_event`, `chat`, `ticket`, `transition`, `interaction`, `director_step`, `run`, `run_event`, `tool`, `gate`, `git`, `config`, `engine`, `error`;
    - `project?`, `card_id?`, `ticket_id?`, `run_id?`, `step?`;
    - `actor` (`owner|director|worker|engine|server`);
    - `message` (one readable line);
    - `data` (unknown, full payload).
  - A port, `TraceSink { emit(entry): void }`, in `types/ports/`, plus a `NOOP_TRACE` value in `domain/`.
  - The engine and the adapters receive the sink as a dependency. Nothing imports a file writer.
- **Where entries come from.** Prefer decorators in composition over edits scattered through the code:
  - **Storage decorator** in `apps/server/src/services/`, next to `tracked-storage.ts`. It logs every write:
    - card created or updated;
    - card events, which include grill questions and answers, plans and notes;
    - chat messages;
    - ticket transitions, before and after state with the event;
    - interactions and escalations;
    - run rows, gate results and config saves.
  - **DirectorLLM decorator.** It logs the step name, input, output, parsed result or parse error, cost, duration, model and harness. The rendered prompt and the raw text live in `packages/drivers`. Add an optional `onTrace` callback to the driver's director adapter options so the composition can capture them. The driver stays harness-neutral and passes the text only.
  - **Worker runs.** Log every normalised `RunEvent` as the engine receives it, at the single place events enter the engine, which is settle or the run-event pump. Also log the run start request with redacted args, and the end result.
  - **Engine.** Tick decisions worth reading: dispatch picks, holds and why, sweeps that changed something, retries, and budget warnings. Keep this to one entry per decision, never one per idle tick.
  - **HTTP.** Method, path, status, duration and actor. Mutation bodies are redacted. GET bodies are not logged.
  - **Errors.** Every caught `ForgeError` that reaches a top-level handler, with its family.
- **Card attribution.** An entry with a `ticket_id` but no `card_id` gets the card from a cached lookup of ticket to card. An entry with a run gets it through run, then ticket, then card. Entries with no card go only in the daily file.
- **Redaction (fail closed).** A single `redact()` pass runs over every entry before it is written. It removes:
  - the install token, run secrets and session cookies;
  - `Authorization` headers;
  - values from SecretStore;
  - GitHub tokens and PEM blocks;
  - known key patterns (`ghp_`, `gho_`, `github_pat_`, `sk-`, `-----BEGIN`);
  - env passthrough values.

  Reuse any existing secret-pattern helper; search the codebase first. If redaction throws, the entry is dropped with a single stderr warning. An unredacted entry is never written.
- **Writer.** Lives in `apps/server/src/services/trace/`, where the app owns IO.
  - Append-only and asynchronous: a buffered queue flushed about every 200 ms and at shutdown.
  - It never blocks or fails the engine. On a write error it warns once on stderr and keeps going.
  - One JSON object per line, UTF-8, LF line endings.
  - A single entry larger than 2 MB has its biggest string fields cut, with a `"…[truncated N bytes]"` marker.
  - The day file rolls over at local midnight.
  - Retention prunes by file modification time.
- **Off means off.** With `FORGE_TRACE` unset, composition passes `NOOP_TRACE` and no decorator wraps anything. A test checks that no file is created.

## Done when

1. With `FORGE_TRACE=1`, creating a card through HTTP and running it through the scripted-LLM planning flow writes both files:
   - `cards/<id>.jsonl` holds, in order: the card creation, the queued turn, each `director_step` with input and output, the grill question and answer, the plan, the approval and the tickets created;
   - the day file holds the same entries plus the HTTP lines.
2. A scripted Worker run's events appear under the card through ticket-to-card attribution.
3. A planted secret (an install token value, a `ghp_…` string, an `Authorization` header) appears nowhere in either file.
4. A failed Director step logs the raw output and the parse or budget error.
5. Off by default: no `trace` directory is created and the decorators are not installed.
6. Retention deletes a file whose modification time is older than `KEEP_DAYS`, and the day file rolls over across a midnight boundary under a fake clock.

## Tests, gates, docs

Tests are vitest with AAA, written red first, covering:
- the core schema and the redact property tests (random nesting with secrets planted);
- writer and retention, using a temp dir and a fake clock;
- the decorators;
- an end-to-end server test with the scripted LLM.

Gates (about 2 GB of RAM, never the full suite, `--maxWorkers=2`):
- `pnpm typecheck`;
- `eslint --fix`, then `pnpm lint` with 0 errors;
- prettier `--write` and `--check` on changed files;
- vitest unit on `packages/core`, `packages/engine`, `packages/drivers` and `apps/server`.

Docs:
- the server README gets a "Debug trace" section listing the env vars, the files, what is logged and the redaction rules;
- the core, engine and drivers READMEs are updated where the port or callback lands.

Do not edit PRODUCT.md. No commits.
