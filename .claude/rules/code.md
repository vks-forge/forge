# Code rules

Short, enforced, long-term. Every PR is checked against these. Design docs
(`docs/design/`) say *what*; this file says *how code is shaped*.

## 1. Layers point inward

```
apps/*         composition only: wire config → adapters → engine. No logic.
               The only place that opens a DB, spawns a server or reads env.
packages/      adapters: db, drivers, hooks, mcp, gates, memory.
               Import core and tools only, never each other or engine.
packages/engine inner orchestration ring: tick, dispatch, settle, DirectorLLM
               steps over ports. No IO; imports core and tools only (d-0058).
packages/tools inner policy ring: admit(), floors, grants, receipts, tokenizer.
               Pure (IO only in its own adapters/), imports core only.
packages/core  pure: types, ports, schemas, state machine. No IO, no imports
               from siblings, no harness names.
```

A dependency from `core` to anything else, from `tools` to anything but
`core`, from `engine` to anything but `core`/`tools`, or between two adapter packages, is a build error (eslint
`no-restricted-imports` for static imports + `forge/no-dynamic-cross-package`
for `import()` / `require`). A process that runs on its own
(MCP stdio server, CLI) gets its entry in `apps/<name>/src/main.ts`, which
composes adapters; the adapter package exports factories that take ports.
`__tests__/` may import a sibling adapter (e.g. `createMemoryStorage`) as a
devDependency fake; `src/` may not.

## 2. One interface, many adapters

Every external thing sits behind an interface defined in `core`:
`StorageAdapter`, `WorkerDriver`, `DirectorLLM`, `ToolRenderer`, `GitHost`,
`SecretStore`. One folder per implementation, picked by config, never by
`if`. Adding a harness = new folder under `packages/drivers/`, zero edits in
`core` or `apps`. If adding an implementation needs a core change, the
interface is wrong; fix the interface, not the caller.

## 3. Harness-neutral core

Core speaks only normalized shapes (`RunEvent`, `RunResult`, `ToolCall`,
`Interaction`). Drivers translate harness JSON → normalized at the boundary
and own every quirk. `harness === 'claude'` outside `packages/drivers` is a
bug. Capabilities are declared (`driver.capabilities()`), not inferred.

## 4. Schema is the source of truth

Zod schemas in `core` define every type, DB row, HTTP body, config file and
LLM step output. Types come from `z.infer`, never hand-written twice. Parse
at every boundary (file, HTTP, LLM, harness); trust nothing past it unparsed.

## 5. DRY by the rule of three

Logic lives once, in the lowest package that needs it. Third copy → extract.
Second copy → leave it; premature abstraction costs more than duplication.
No "utils" grab-bag: name the module by what it does (`ids.ts`, `hash.ts`).

## 6. Policy paths have one door

One `admit()` for tool calls, one `transition()` for ticket state, one
`merge()` for git. No helper that bypasses them, no "fast path". Fail closed:
on error or unknown input the policy answer is `deny`, never `allow`.

## 7. Errors are typed

Throw `ForgeError` subclasses with an `errorFamily` from the core enum.
Never throw strings, never swallow. Retry/stall/kill decisions read the
family, not the message.

## 8. Tests

- vitest, AAA (arrange / act / assert).
- **One `__tests__/` folder per package or app root**, mirroring `src/`:
  `src/domain/ticket.ts` → `__tests__/domain/ticket.test.ts`. Never a
  `__tests__/` inside `src/`, never a `.test.ts` beside the code.
  Shared fixtures in `__tests__/helpers/`.
- Major work is red-green: failing test committed before the fix (d-0015).
- One **contract test** per interface runs against every implementation
  (`describeAdapterContract(makeAdapter)`). A new adapter passes the contract
  before it gets its own tests.
- Property tests for the state machine and policy functions.
- Gates at root: `pnpm test | lint | typecheck | format:check`. Nothing
  merges with a gate red or skipped.

## 9. Config over code

Lanes, floors, tool catalogue, harness options, model matrix live in yaml
under `.forge/`, validated by core schemas at load. Behaviour changes that
need a code edit for a config-shaped thing are a smell.

## 10. Files, folders and names

- Every package and app uses the same skeleton. No source file sits at
  `src/` root except `index.ts` (packages) or `main.ts` (apps).

  ```
  <package>/
    __tests__/      mirrors src/ (rule 8)
    src/
      index.ts      public API, re-exports only
      schemas/      zod schemas; the only non-`types/` place a type may be
                    declared, and only as `type X = z.infer<typeof X>`
      types/        every hand-written `type` / `interface`: ports other
                    packages implement (`types/ports/driver.ts`,
                    `types/ports/storage.ts`), event unions, Result,
                    error families, option bags. Types only, no values.
      domain/       pure business rules (state machine, policy, ids, naming)
      adapters/     implementations of core ports, one folder each (adapter packages)
      shared/       small internal helpers (errors, hash, glob); no "utils"
    README.md
  ```

  Apps add `routes/`, `services/`, `config/` as needed; same rule: by
  responsibility. `types/` and `__tests__/` are the two deliberate
  exceptions; no "helpers/", "misc/", "utils/".
- **Types live in `types/`.** A `type` or `interface` declaration outside
  `src/types/**` is a lint error, except `type X = z.infer<typeof X>` next to
  its schema in `schemas/`. Code files import their types from `#/types/...`
  with `import type`. A `types/` file exports no runtime values.
- **Types files are named `<name>.types.ts`** (`types/ticket-events.types.ts`,
  `types/ports/driver.types.ts`). Only files under `types/` carry the
  suffix, and every file under `types/` must carry it. Lint-enforced.
- **Imports by namespace, never by `../`.** Inside a package use the
  package-root alias `#/` (`import { transition } from '#/domain/state-machine.js'`),
  declared once in that package's `package.json` `imports` field so Node,
  tsc and vitest all resolve it with no bundler. Across packages use
  `@forge/<name>`. A `./` import is allowed only for a sibling file in
  the same folder; `../` is a lint error.
- ≤ 300 lines per file, one concept per file, `index.ts` re-exports only.
- `kebab-case.ts`, `PascalCase` types, `camelCase` functions,
  `SCREAMING_CASE` constants. Ids `<PROJECT>-<n>`, branches
  `<type>/<id>-<slug>`.
- No side effects on import. Entry points only under `apps/*/src/main.ts`.
- Every package and app has a `README.md` (≤ 150 lines) with these sections,
  in order, written as product knowledge like rule 12's `Why:`:
  1. `# @forge/<name>` + one line: what it is.
  2. `## Why it exists`: the problem in the running system, the actors
     (Director, Worker, harness, user), what breaks without it.
  3. `## What it does`: responsibilities and the public API from `index.ts`.
  4. `## Why this approach`: each key dependency and design pick with its
     reason, plus alternatives rejected (decision ids as pointers).
  5. `## Requirements`: runtime, native binaries, env vars, files under
     `.forge/`, external services, build steps, how to run its tests.
  6. `## Extending`: how to add an implementation or a new piece.
  7. `## Limits`: known gaps and what it deliberately does not do.
  Placeholder packages keep all seven headings; unknown parts say `none yet`.
  **The README is a living doc, kept current as the package grows.** Any
  change that alters what a reader of it would believe (new feature or
  module, changed behaviour, public API, deps, env vars, `.forge/` files,
  requirements, a limit closed or found) updates the README in the same
  commit. Builders check the README before reporting done; a stale README is
  a review block, same as a red gate.

## 11. Dependencies

Exact pins. `core` depends on `zod` only. New dep needs one line of reason in
the PR body and a check that it has no Windows caveat. Prefer the standard
library and the platform over a package.

## 12. Every file opens with a header comment

The first thing in every source and test file is a block comment that a new
developer or agent can read instead of the code:

```ts
/**
 * Ticket state machine — the single door for ticket status changes.
 *
 * Why: the Director engine, HTTP API and gates all move tickets; one pure
 * `transition()` keeps every rule (rework cap, tier C signer, CAS) in one
 * place so no caller can skip it (code.md rule 6, director-core.md §3).
 *
 * Exports: transition(), TicketEvent, TransitionError, MAX_AUTO_REWORKS.
 * Depends on: schemas/ticket, domain/lane-triage. No IO.
 */
```

Required parts: one-line *what*, a *why* paragraph, *exports*, *depends on*.

**`Why:` is product knowledge, not process.** It answers "what problem in
the running system does this file solve, and what goes wrong without it",
in terms a new engineer or agent can use to make decisions: the actors
involved (Director, Worker, harness, user), the failure it prevents, the
invariant it protects. It may cite a design-doc section or decision id in
parentheses as a pointer, never as the reason. It never mentions code rules,
milestones, slices, "this file exists because rule N", or what will land
later.

```
Bad:  Why: the package boundary is one file (code.md rule 10); the Claude
      driver lands in slice 2 after the probes pass.
Good: Why: Workers run inside third-party harnesses (Claude Code, Codex,
      OpenCode) that each speak their own protocol. The Director must start,
      steer, resume and kill a run the same way regardless of harness, and
      must never trust the harness's own permission bypass. This package is
      that boundary: one WorkerDriver per harness, normalised events out,
      policy enforced on our side (execution-plane.md §3).
```

Test files say what behaviour they pin and why that behaviour matters to
the system, in the same spirit. Exported functions and interfaces
get a short JSDoc. Inside the body, comments say *why*, not *what*: a
non-obvious constraint, a decision id, a workaround with its upstream link.
Dead code is deleted, not commented out. Missing or stale header = lint
failure (eslint `header` check) and a review block.
