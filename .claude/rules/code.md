# Code rules

Short, enforced, long-term. Every PR is checked against these. Design docs
(`docs/design/`) say *what*; this file says *how code is shaped*.

## 1. Layers point inward

```
apps/*        composition only: wire config → adapters → engine. No logic.
packages/     adapters: db, drivers, tools, gates, memory. Depend on core only.
packages/core pure: types, schemas, state machine, policy functions. No IO,
              no imports from siblings, no harness names.
```

A dependency from `core` to anything else, or between two adapter packages,
is a build error (eslint `no-restricted-imports` + dependency-cruiser).

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

Throw `FactoryError` subclasses with an `errorFamily` from the core enum.
Never throw strings, never swallow. Retry/stall/kill decisions read the
family, not the message.

## 8. Tests

- vitest, `__tests__/` beside the code, AAA (arrange / act / assert).
- Major work is red-green: failing test committed before the fix (d-0015).
- One **contract test** per interface runs against every implementation
  (`describeAdapterContract(makeAdapter)`). A new adapter passes the contract
  before it gets its own tests.
- Property tests for the state machine and policy functions.
- Gates at root: `pnpm test | lint | typecheck | format:check`. Nothing
  merges with a gate red or skipped.

## 9. Config over code

Lanes, floors, tool catalogue, harness options, model matrix live in yaml
under `.factory/`, validated by core schemas at load. Behaviour changes that
need a code edit for a config-shaped thing are a smell.

## 10. Files and names

- ≤ 300 lines per file, one concept per file, `index.ts` re-exports only.
- `kebab-case.ts`, `PascalCase` types, `camelCase` functions,
  `SCREAMING_CASE` constants. Ids `<PROJECT>-<n>`, branches
  `<type>/<id>-<slug>`.
- No side effects on import. Entry points only under `apps/*/src/main.ts`.
- Each package has a `README.md` ≤ 1 screen: purpose, public API, how to add
  an implementation.

## 11. Dependencies

Exact pins. `core` depends on `zod` only. New dep needs one line of reason in
the PR body and a check that it has no Windows caveat. Prefer the standard
library and the platform over a package.

## 12. Comments say why

Code says what. A comment explains a non-obvious constraint, a decision id
(`d-0031`), or a workaround with the upstream issue link. Dead code is
deleted, not commented out.
